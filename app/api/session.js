import {
  assertTrustedOrigin,
  authenticateRequest,
  authenticateToken,
  expiredSessionCookie,
  FaroAuthError,
  sessionCookie,
} from "../lib/faro-auth.js";

function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
}

export default async function handler(req, res) {
  noStore(res);
  try {
    if (req.method === "GET") {
      const user = authenticateRequest(req);
      return res.status(200).json({ authenticated: true, user });
    }

    if (req.method === "POST") {
      assertTrustedOrigin(req);
      const token = String(req.body?.token || "").trim();
      const user = authenticateToken(token);
      res.setHeader("Set-Cookie", sessionCookie(user, req));
      return res.status(200).json({ authenticated: true, user });
    }

    if (req.method === "DELETE") {
      assertTrustedOrigin(req);
      res.setHeader("Set-Cookie", expiredSessionCookie(req));
      return res.status(200).json({ authenticated: false });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Método no permitido." });
  } catch (error) {
    const status = error instanceof FaroAuthError ? error.status : 500;
    if (status >= 500) console.error("session-api", error);
    return res.status(status).json({
      error: error.message || "No se pudo iniciar sesión.",
      code: error.code || "SESSION_ERROR",
    });
  }
}
