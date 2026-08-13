import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { INITIAL_TASKS, PHASES, TEAM } from "../src/constants.js";
import {
  createWorkbook,
  parseWorkbookAudit,
  parseWorkbookHistory,
  workbookToArray,
} from "../src/excel.js";
import { assertTrustedOrigin, authenticateRequest, FaroAuthError } from "../lib/faro-auth.js";

const DEFAULT_REPOSITORY = "Aaronzaso/Seguimiento-FARO";
const DEFAULT_BRANCH = "main";
const GITHUB_API_VERSION = "2022-11-28";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEAM_IDS = new Set(TEAM.map(member => member.id));
const PHASE_NAMES = new Set(PHASES.map(phase => phase.name));
const TASKS_BY_ID = new Map(INITIAL_TASKS.map(task => [task.id, task]));

function serverDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    Object.assign(this, details);
  }
}

function text(value, maxLength = 20000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function finiteNumber(value, { min = 0, max = 100000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function validDate(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeSavePayload(body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Solicitud inválida.");
  if (!validDate(body.date)) throw new HttpError(400, "La fecha del corte no es válida.");
  if (!Array.isArray(body.tasks) || body.tasks.length !== INITIAL_TASKS.length) {
    throw new HttpError(400, `Se esperaban ${INITIAL_TASKS.length} tareas.`);
  }

  const seen = new Set();
  const tasks = body.tasks.map(candidate => {
    const id = Number(candidate?.id);
    const canonical = TASKS_BY_ID.get(id);
    if (!canonical || seen.has(id)) throw new HttpError(400, "La lista de tareas contiene IDs inválidos o duplicados.");
    seen.add(id);

    const progress = finiteNumber(candidate.progress, { min: 0, max: 100 });
    if (progress === null) throw new HttpError(400, `El avance de la tarea ${id} no es válido.`);

    const responsible = Array.isArray(candidate.responsible)
      ? [...new Set(candidate.responsible.filter(memberId => TEAM_IDS.has(memberId)))]
      : [];
    const hoursBy = {};
    TEAM.forEach(member => {
      const hours = finiteNumber(candidate.hoursBy?.[member.id], { min: 0, max: 10000 });
      hoursBy[member.id] = hours ?? 0;
    });

    return {
      ...canonical,
      progress: Math.round(progress * 10) / 10,
      responsible,
      hoursBy,
      notes: text(candidate.notes),
    };
  });

  const history = Array.isArray(body.history)
    ? body.history.slice(-100).map(cut => {
      if (!validDate(cut?.date)) return null;
      const phases = {};
      PHASE_NAMES.forEach(phase => {
        phases[phase] = finiteNumber(cut.phases?.[phase], { min: 0, max: 100 }) ?? 0;
      });
      return {
        date: cut.date,
        global: finiteNumber(cut.global, { min: 0, max: 100 }) ?? 0,
        phases,
        branch: text(cut.branch, 100),
        commit: text(cut.commit, 100),
        notes: text(cut.notes),
      };
    }).filter(Boolean)
    : [];

  return {
    date: body.date,
    tasks,
    history,
    note: text(body.note),
    baseVersion: text(body.baseVersion, 300),
  };
}

function requireCurrentCutDate(date) {
  const currentDate = serverDateKey();
  if (date !== currentDate) {
    throw new HttpError(400, `El corte debe guardarse con la fecha actual de Costa Rica (${currentDate}).`, {
      code: "CUT_DATE_MISMATCH",
    });
  }
}

function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new HttpError(503, "Falta configurar GITHUB_TOKEN en Vercel.");
  return {
    token,
    repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    branch: process.env.GITHUB_BRANCH || DEFAULT_BRANCH,
  };
}

function encodedPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${config.repository}/${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "FARO-Vercel",
      ...options.headers,
    },
  });

  if (response.status === 404 && options.allowNotFound) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 409 ? 409 : 502;
    const message = status === 409
      ? "Otra persona publicó cambios mientras se guardaba. Tu borrador se conservó."
      : `GitHub no pudo procesar el corte (${response.status}).`;
    throw new HttpError(status, message, {
      code: status === 409 ? "VERSION_CONFLICT" : "GITHUB_REQUEST_FAILED",
    });
  }
  return payload;
}

async function listWorkbooks(config) {
  const items = await githubRequest(
    config,
    `contents/datos?ref=${encodeURIComponent(config.branch)}`,
  );
  return items
    .filter(item => item.type === "file" && /^FARO_Cronograma_\d{4}-\d{2}-\d{2}\.xlsx$/.test(item.name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function getWorkbook(config, path, allowNotFound = false) {
  return githubRequest(
    config,
    `contents/${encodedPath(path)}?ref=${encodeURIComponent(config.branch)}`,
    { allowNotFound },
  );
}

function workbookBytes(file) {
  if (!file?.content) return null;
  return new Uint8Array(Buffer.from(file.content.replace(/\s/g, ""), "base64"));
}

function fileVersion(file) {
  if (!file?.sha) return null;
  return `${file.path || file.name || "datos/FARO_Cronograma.xlsx"}:${file.sha}`;
}

function latestAuditMetadata(file) {
  const data = workbookBytes(file);
  const event = data ? parseWorkbookAudit(data).at(-1) : null;
  return {
    updatedBy: event?.userName || "",
    updatedById: event?.userId || "",
    updatedAt: event?.savedAt || "",
  };
}

function metaRequested(req) {
  if (String(req.query?.meta || "") === "1") return true;
  try {
    return new URL(req.url || "/", "https://faro.local").searchParams.get("meta") === "1";
  } catch {
    return false;
  }
}

function setCutHeaders(res, file, metadata) {
  const version = fileVersion(file);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Cut-File", file.name);
  if (version) res.setHeader("X-Faro-Version", version);
  if (file.sha) res.setHeader("ETag", `"${file.sha}"`);
  if (metadata.updatedBy) res.setHeader("X-Faro-Updated-By", encodeURIComponent(metadata.updatedBy));
  if (metadata.updatedById) res.setHeader("X-Faro-Updated-By-Id", encodeURIComponent(metadata.updatedById));
  if (metadata.updatedAt) res.setHeader("X-Faro-Updated-At", metadata.updatedAt);
}

async function serveLatestCut(req, res) {
  const config = githubConfig();
  const workbooks = await listWorkbooks(config);
  const latest = workbooks.at(-1);
  if (!latest) throw new HttpError(404, "Todavía no hay cortes publicados.");
  const file = await getWorkbook(config, latest.path);
  const metadata = latestAuditMetadata(file);
  setCutHeaders(res, file, metadata);

  if (metaRequested(req)) {
    return res.status(200).json({
      version: fileVersion(file),
      fileName: file.name,
      ...metadata,
    });
  }

  const bytes = Buffer.from(file.content.replace(/\s/g, ""), "base64");

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `inline; filename="${latest.name}"`);
  return res.status(200).send(bytes);
}

async function saveCut(req, res) {
  assertTrustedOrigin(req);
  const actor = authenticateRequest(req);
  const input = normalizeSavePayload(req.body);
  requireCurrentCutDate(input.date);
  const config = githubConfig();
  const targetPath = `datos/FARO_Cronograma_${input.date}.xlsx`;
  const [workbooks, existingTarget] = await Promise.all([
    listWorkbooks(config),
    getWorkbook(config, targetPath, true),
  ]);
  const templateFile = existingTarget || (workbooks.at(-1)
    ? await getWorkbook(config, workbooks.at(-1).path)
    : null);
  const currentVersion = fileVersion(templateFile);
  if (currentVersion && input.baseVersion !== currentVersion) {
    const metadata = latestAuditMetadata(templateFile);
    throw new HttpError(409, "Otra persona publicó una versión más reciente. Tu borrador se conservó.", {
      code: "VERSION_CONFLICT",
      currentVersion,
      currentFileName: templateFile.name,
      ...metadata,
    });
  }

  const templateData = workbookBytes(templateFile);
  const officialHistory = templateData ? parseWorkbookHistory(templateData) : [];
  if (templateData && officialHistory.length === 0) {
    throw new HttpError(
      422,
      "El Excel oficial no contiene un histórico válido. Se bloqueó el guardado para conservar los cortes anteriores.",
      { code: "HISTORY_INVALID" },
    );
  }
  const baseHistory = officialHistory;
  const operationId = randomUUID();
  const savedAt = new Date().toISOString();
  const fileName = targetPath.split("/").at(-1);

  const { workbook, history } = createWorkbook(input.tasks, baseHistory, input.note, {
    date: input.date,
    branch: config.branch,
    commit: `op:${operationId.slice(0, 8)}`,
    baseWorkbookData: templateData,
    actor,
    savedAt,
    auditEvent: {
      operationId,
      savedAt,
      cutDate: input.date,
      userId: actor.id,
      userName: actor.name,
      role: actor.role,
      action: existingTarget ? "Actualizar corte" : "Crear corte",
      fileName,
      baseVersion: currentVersion || "",
    },
  });
  const bytes = Buffer.from(new Uint8Array(workbookToArray(workbook)));
  const commitBody = {
    message: `Actualizar corte FARO ${input.date} · ${actor.name} · ${operationId.slice(0, 8)}`,
    content: bytes.toString("base64"),
    branch: config.branch,
  };
  if (existingTarget?.sha) commitBody.sha = existingTarget.sha;
  if (process.env.GITHUB_COMMITTER_NAME && process.env.GITHUB_COMMITTER_EMAIL) {
    commitBody.committer = {
      name: process.env.GITHUB_COMMITTER_NAME,
      email: process.env.GITHUB_COMMITTER_EMAIL,
    };
  }

  const saved = await githubRequest(config, `contents/${encodedPath(targetPath)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(commitBody),
  });

  return res.status(existingTarget ? 200 : 201).json({
    ok: true,
    fileName,
    version: saved.content?.sha ? `${targetPath}:${saved.content.sha}` : null,
    commitSha: saved.commit.sha,
    commitUrl: saved.commit.html_url,
    history,
    operationId,
    savedAt,
    updatedBy: actor.name,
    updatedById: actor.id,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await serveLatestCut(req, res);
    if (req.method === "POST") return await saveCut(req, res);
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido." });
  } catch (error) {
    const status = error instanceof HttpError || error instanceof FaroAuthError ? error.status : 500;
    if (status >= 500) console.error("cuts-api", error);
    return res.status(status).json({
      error: error.message || "Error inesperado guardando el corte.",
      code: error.code,
      currentVersion: error.currentVersion,
      currentFileName: error.currentFileName,
      updatedBy: error.updatedBy,
      updatedById: error.updatedById,
      updatedAt: error.updatedAt,
    });
  }
}
