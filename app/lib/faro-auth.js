import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export const FARO_SESSION_COOKIE = "faro_session";
export const FARO_SECURE_SESSION_COOKIE = "__Host-faro_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export class FaroAuthError extends Error {
  constructor(status, message, code = "AUTH_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function tokenDigest(token) {
  return createHash("sha256").update(String(token || ""), "utf8").digest();
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sessionSecret(env = process.env) {
  const secret = String(env.FARO_SESSION_SECRET || "");
  if (secret.length < 32) {
    throw new FaroAuthError(
      503,
      "Falta configurar FARO_SESSION_SECRET con al menos 32 caracteres.",
      "AUTH_NOT_CONFIGURED",
    );
  }
  return secret;
}

function parseCookieHeader(header) {
  return String(header || "").split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    shared: Boolean(user.shared),
  };
}

export function configuredUsers(env = process.env) {
  const raw = env.FARO_USERS_JSON;
  if (!raw) {
    const sharedToken = env.FARO_SAVE_TOKEN;
    const sharedAllowed = env.FARO_ALLOW_SHARED_TOKEN === "true";
    if (!sharedToken || !sharedAllowed) {
      throw new FaroAuthError(
        503,
        "Falta configurar FARO_USERS_JSON en Vercel.",
        "AUTH_NOT_CONFIGURED",
      );
    }
    return [{
      id: "equipo",
      name: "Equipo FARO",
      role: "Editor compartido",
      token: sharedToken,
      active: true,
      shared: true,
    }];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FaroAuthError(503, "FARO_USERS_JSON no contiene JSON válido.", "AUTH_CONFIG_INVALID");
  }

  const candidates = Array.isArray(parsed) ? parsed : parsed?.users;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new FaroAuthError(503, "FARO_USERS_JSON no contiene usuarios.", "AUTH_CONFIG_INVALID");
  }

  const ids = new Set();
  const tokenHashes = new Set();
  return candidates.map((candidate, index) => {
    const id = String(candidate?.id || "").trim();
    const name = String(candidate?.name || "").trim();
    const role = String(candidate?.role || "Editor").trim();
    const token = String(candidate?.token || "");
    if (!/^[a-z0-9_-]{2,40}$/i.test(id) || !name || token.length < 24) {
      throw new FaroAuthError(
        503,
        `El usuario ${index + 1} de FARO_USERS_JSON es inválido.`,
        "AUTH_CONFIG_INVALID",
      );
    }
    const tokenHash = tokenDigest(token).toString("hex");
    if (ids.has(id) || tokenHashes.has(tokenHash)) {
      throw new FaroAuthError(503, "FARO_USERS_JSON contiene IDs o claves duplicadas.", "AUTH_CONFIG_INVALID");
    }
    ids.add(id);
    tokenHashes.add(tokenHash);
    return {
      id,
      name,
      role,
      token,
      active: candidate.active !== false,
      shared: false,
    };
  });
}

export function authenticateToken(receivedToken, env = process.env) {
  const token = String(receivedToken || "");
  if (!token) throw new FaroAuthError(401, "Iniciá sesión para guardar el corte.", "AUTH_REQUIRED");

  const receivedHash = tokenDigest(token);
  let match = null;
  for (const user of configuredUsers(env)) {
    const matches = timingSafeEqual(receivedHash, tokenDigest(user.token));
    if (matches && user.active) match = user;
  }
  if (!match) throw new FaroAuthError(401, "La clave personal no es válida.", "AUTH_INVALID");
  return publicUser(match);
}

export function requestToken(req) {
  const authorization = req.headers?.authorization;
  if (/^Bearer\s+/i.test(authorization || "")) return authorization.replace(/^Bearer\s+/i, "").trim();
  return "";
}

export function authenticateRequest(req, env = process.env) {
  const bearerToken = requestToken(req);
  if (bearerToken) return authenticateToken(bearerToken, env);

  const cookies = parseCookieHeader(req.headers?.cookie);
  const session = cookies[FARO_SECURE_SESSION_COOKIE] || cookies[FARO_SESSION_COOKIE];
  if (!session) throw new FaroAuthError(401, "Iniciá sesión para guardar el corte.", "AUTH_REQUIRED");
  return verifySession(session, env);
}

function secureRequest(req) {
  const forwarded = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  if (forwarded) return forwarded === "https";
  return process.env.NODE_ENV === "production";
}

function sessionCookieName(req) {
  return secureRequest(req) ? FARO_SECURE_SESSION_COOKIE : FARO_SESSION_COOKIE;
}

function signSessionPayload(payload, env = process.env) {
  return createHmac("sha256", sessionSecret(env)).update(payload, "utf8").digest();
}

export function createSession(user, env = process.env, now = Date.now()) {
  const configured = configuredUsers(env).find(candidate => candidate.id === user.id && candidate.active);
  if (!configured) throw new FaroAuthError(401, "La cuenta ya no está activa.", "AUTH_INVALID");
  const payload = base64url(JSON.stringify({
    v: 1,
    sub: configured.id,
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
    credential: tokenDigest(configured.token).toString("base64url"),
  }));
  return `${payload}.${signSessionPayload(payload, env).toString("base64url")}`;
}

export function verifySession(session, env = process.env, now = Date.now()) {
  const [payload, signature, extra] = String(session || "").split(".");
  if (!payload || !signature || extra) {
    throw new FaroAuthError(401, "La sesión no es válida.", "AUTH_INVALID");
  }

  const receivedSignature = Buffer.from(signature, "base64url");
  const expectedSignature = signSessionPayload(payload, env);
  if (receivedSignature.length !== expectedSignature.length
      || !timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new FaroAuthError(401, "La sesión no es válida.", "AUTH_INVALID");
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new FaroAuthError(401, "La sesión no es válida.", "AUTH_INVALID");
  }
  if (claims.v !== 1 || !claims.sub || !Number.isFinite(claims.exp)
      || claims.exp <= Math.floor(now / 1000)) {
    throw new FaroAuthError(401, "La sesión venció. Iniciá sesión de nuevo.", "AUTH_EXPIRED");
  }

  const configured = configuredUsers(env).find(candidate => candidate.id === claims.sub && candidate.active);
  const expectedCredential = configured ? tokenDigest(configured.token).toString("base64url") : "";
  if (!configured || claims.credential !== expectedCredential) {
    throw new FaroAuthError(401, "La cuenta o su clave ya no están activas.", "AUTH_INVALID");
  }
  return publicUser(configured);
}

export function sessionCookie(user, req, env = process.env) {
  const session = createSession(user, env);
  const attributes = [
    `${sessionCookieName(req)}=${encodeURIComponent(session)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secureRequest(req)) attributes.push("Secure");
  return attributes.join("; ");
}

export function expiredSessionCookie(req) {
  const attributes = [
    `${sessionCookieName(req)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secureRequest(req)) attributes.push("Secure");
  return attributes.join("; ");
}

function requestOrigin(req) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
  return host ? `${protocol}://${host}` : "";
}

export function assertTrustedOrigin(req, env = process.env) {
  const received = String(req.headers?.origin || "").replace(/\/$/, "");
  const configured = String(env.FARO_ALLOWED_ORIGIN || "")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  // Vercel can serve the same production deployment from its canonical domain,
  // branch aliases and immutable deployment URL. The request host is trusted by
  // the platform, so same-origin writes remain valid across those aliases while
  // configured domains continue to allow an explicit canonical/custom origin.
  const allowed = [...new Set([...configured, requestOrigin(req)].filter(Boolean))];
  if (!received || !allowed.includes(received)) {
    throw new FaroAuthError(403, "Origen de la solicitud no permitido.", "ORIGIN_FORBIDDEN");
  }
}
