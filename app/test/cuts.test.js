import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { INITIAL_TASKS } from "../src/constants.js";
import {
  createWorkbook,
  parseWorkbookAudit,
  parseWorkbookHistory,
  parseWorkbookUpdates,
  workbookToArray,
} from "../src/excel.js";
import handler, { normalizeSavePayload } from "../api/cuts.js";
import sessionHandler from "../api/session.js";
import { authenticateToken, createSession, verifySession } from "../lib/faro-auth.js";

const ORIGIN = "https://faro.example";
const SESSION_SECRET = "session-secret-for-tests-1234567890";
const requestHeaders = {
  origin: ORIGIN,
  host: "faro.example",
  "x-forwarded-proto": "https",
};
const todayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date()).map(part => [part.type, part.value]));
const TODAY = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
const TARGET_FILE = `FARO_Cronograma_${TODAY}.xlsx`;
const TARGET_PATH = `datos/${TARGET_FILE}`;

const sourcePath = new URL("../../datos/FARO_Cronograma_2026-08-13.xlsx", import.meta.url);
const source = fs.readFileSync(sourcePath);
const sourceArray = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);

function currentTasks() {
  const updates = parseWorkbookUpdates(sourceArray);
  return INITIAL_TASKS.map(task => ({ ...task, ...updates[task.id] }));
}

test("normaliza un corte completo sin alterar la identidad de las tareas", () => {
  const result = normalizeSavePayload({
    date: "2026-08-13",
    tasks: currentTasks(),
    history: parseWorkbookHistory(sourceArray),
    note: "Corte de prueba",
    baseVersion: "datos/FARO_Cronograma_2026-08-13.xlsx:source-sha",
  });

  assert.equal(result.tasks.length, 44);
  assert.equal(result.tasks[0].name, INITIAL_TASKS[0].name);
  assert.equal(result.date, "2026-08-13");
  assert.equal(result.baseVersion, "datos/FARO_Cronograma_2026-08-13.xlsx:source-sha");
});

test("rechaza IDs de tareas duplicados", () => {
  const tasks = currentTasks();
  tasks[1] = { ...tasks[1], id: tasks[0].id };
  assert.throws(
    () => normalizeSavePayload({ date: "2026-08-13", tasks, history: [] }),
    /IDs inválidos o duplicados/,
  );
});

test("actualiza las hojas administradas y conserva la evidencia del libro base", () => {
  const tasks = currentTasks();
  const { workbook, history } = createWorkbook(
    tasks,
    parseWorkbookHistory(sourceArray),
    "Corte de prueba en Vercel",
    {
      date: "2026-08-13",
      branch: "main",
      commit: "Vercel auto",
      baseWorkbookData: new Uint8Array(sourceArray),
      actor: { id: "aaron", name: "Aarón Mayorga", role: "Administrador" },
      savedAt: "2026-08-13T17:00:00.000Z",
      auditEvent: {
        operationId: "op-prueba",
        savedAt: "2026-08-13T17:00:00.000Z",
        cutDate: "2026-08-13",
        userId: "aaron",
        userName: "Aarón Mayorga",
        role: "Administrador",
        action: "Actualizar corte",
        fileName: "FARO_Cronograma_2026-08-13.xlsx",
        baseVersion: "datos/FARO_Cronograma_2026-08-13.xlsx:source-sha",
      },
    },
  );
  const output = workbookToArray(workbook);
  const reopened = XLSX.read(output, { type: "array" });
  const updates = parseWorkbookUpdates(output);
  const total = Object.values(updates).reduce(
    (sum, task) => sum + Object.values(task.hoursBy || {}).reduce((hours, value) => hours + value, 0),
    0,
  );

  assert.ok(reopened.SheetNames.includes("Evidencia horas"));
  assert.ok(reopened.SheetNames.includes("Auditoría"));
  assert.equal(history.at(-1).date, "2026-08-13");
  assert.equal(history.at(-1).updatedBy, "Aarón Mayorga");
  assert.equal(parseWorkbookAudit(output).at(-1).operationId, "op-prueba");
  assert.equal(total, 655);
});

test("respeta responsables y notas vacíos al volver a cargar un corte", () => {
  const tasks = currentTasks().map(task => (
    task.id === 1 ? { ...task, responsible: [], notes: "" } : task
  ));
  const { workbook } = createWorkbook(tasks, [], "", { date: "2026-08-13" });
  const updates = parseWorkbookUpdates(workbookToArray(workbook));

  assert.deepEqual(updates[1].responsible, []);
  assert.equal(updates[1].notes, "");
});

test("reemplaza aliases históricos sin duplicar hojas administradas", () => {
  const tasks = currentTasks();
  const first = createWorkbook(tasks, parseWorkbookHistory(sourceArray), "Primer guardado", {
    date: "2026-08-13",
    baseWorkbookData: new Uint8Array(sourceArray),
    auditEvent: {
      operationId: "op-1", savedAt: "2026-08-13T17:00:00.000Z", cutDate: "2026-08-13",
      userId: "aaron", userName: "Aarón Mayorga", fileName: "corte.xlsx",
    },
  });
  const legacy = XLSX.read(workbookToArray(first.workbook), { type: "array" });
  const rename = (from, to) => {
    legacy.Sheets[to] = legacy.Sheets[from];
    delete legacy.Sheets[from];
    legacy.SheetNames[legacy.SheetNames.indexOf(from)] = to;
  };
  rename("Cronograma", "Cronograma FARO");
  rename("Histórico avance", "Historico avance");
  rename("Auditoría", "Auditoria");
  const legacyData = XLSX.write(legacy, { type: "array", bookType: "xlsx" });

  const second = createWorkbook(tasks, parseWorkbookHistory(legacyData), "Segundo guardado", {
    date: "2026-08-13",
    baseWorkbookData: legacyData,
    auditEvent: {
      operationId: "op-2", savedAt: "2026-08-13T18:00:00.000Z", cutDate: "2026-08-13",
      userId: "luis_ma", userName: "Luis Martínez", fileName: "corte.xlsx",
    },
  });
  const output = workbookToArray(second.workbook);
  const reopened = XLSX.read(output, { type: "array" });

  assert.ok(reopened.SheetNames.includes("Cronograma"));
  assert.ok(reopened.SheetNames.includes("Histórico avance"));
  assert.ok(reopened.SheetNames.includes("Auditoría"));
  assert.equal(reopened.SheetNames.includes("Cronograma FARO"), false);
  assert.equal(reopened.SheetNames.includes("Historico avance"), false);
  assert.equal(reopened.SheetNames.includes("Auditoria"), false);
  assert.deepEqual(parseWorkbookAudit(output).map(event => event.operationId), ["op-1", "op-2"]);
  assert.equal(parseWorkbookHistory(output).at(-1).notes, "Segundo guardado");
});

test("la Function publica en GitHub un Excel válido y devuelve el commit", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalSaveToken = process.env.FARO_SAVE_TOKEN;
  const originalUsers = process.env.FARO_USERS_JSON;
  const originalAllowShared = process.env.FARO_ALLOW_SHARED_TOKEN;
  process.env.GITHUB_TOKEN = "github-test-token";
  delete process.env.FARO_SAVE_TOKEN;
  delete process.env.FARO_ALLOW_SHARED_TOKEN;
  process.env.FARO_USERS_JSON = JSON.stringify([
    { id: "aaron", name: "Aarón Mayorga", role: "Administrador", token: "a".repeat(32), active: true },
  ]);

  let uploadedWorkbook;
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/contents/datos?ref=")) {
      return Response.json([{
        type: "file",
        name: TARGET_FILE,
        path: TARGET_PATH,
        sha: "source-sha",
      }]);
    }
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      uploadedWorkbook = Buffer.from(body.content, "base64");
      return Response.json({
        commit: { sha: "abcdef1234567890", html_url: "https://github.example/commit/abcdef1" },
        content: { sha: "result-blob-sha" },
      });
    }
    if (requestUrl.includes(TARGET_FILE)) {
      return Response.json({
        name: TARGET_FILE,
        path: TARGET_PATH,
        sha: "source-sha",
        content: source.toString("base64"),
      });
    }
    return Response.json({ message: "Not found" }, { status: 404 });
  };

  const response = {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };

  try {
    await handler({
      method: "POST",
      headers: { ...requestHeaders, authorization: `Bearer ${"a".repeat(32)}` },
      body: {
        date: TODAY,
        tasks: currentTasks(),
        history: [],
        note: "Publicado desde prueba",
        baseVersion: `${TARGET_PATH}:source-sha`,
        actor: { id: "luis_ma", name: "Luis Martínez" },
        updatedBy: "Luis Martínez",
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.commitSha, "abcdef1234567890");
    assert.equal(response.body.version, `${TARGET_PATH}:result-blob-sha`);
    assert.equal(response.body.updatedBy, "Aarón Mayorga");
    assert.ok(uploadedWorkbook);
    const reopened = XLSX.read(uploadedWorkbook, { type: "buffer" });
    assert.ok(reopened.SheetNames.includes("Evidencia horas"));
    assert.ok(reopened.SheetNames.includes("Auditoría"));
    assert.equal(Object.keys(parseWorkbookUpdates(uploadedWorkbook)).length, 44);
    assert.equal(parseWorkbookHistory(uploadedWorkbook).at(-1).date, TODAY);
    assert.equal(parseWorkbookAudit(uploadedWorkbook).at(-1).userName, "Aarón Mayorga");
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalSaveToken === undefined) delete process.env.FARO_SAVE_TOKEN;
    else process.env.FARO_SAVE_TOKEN = originalSaveToken;
    if (originalUsers === undefined) delete process.env.FARO_USERS_JSON;
    else process.env.FARO_USERS_JSON = originalUsers;
    if (originalAllowShared === undefined) delete process.env.FARO_ALLOW_SHARED_TOKEN;
    else process.env.FARO_ALLOW_SHARED_TOKEN = originalAllowShared;
  }
});

test("autentica claves individuales y deriva la identidad en el servidor", () => {
  const env = {
    FARO_SESSION_SECRET: SESSION_SECRET,
    FARO_USERS_JSON: JSON.stringify([
      { id: "aaron", name: "Aarón Mayorga", role: "Administrador", token: "a".repeat(32), active: true },
      { id: "luis_ma", name: "Luis Martínez", role: "Editor", token: "b".repeat(32), active: false },
    ]),
  };

  assert.deepEqual(authenticateToken("a".repeat(32), env), {
    id: "aaron",
    name: "Aarón Mayorga",
    role: "Administrador",
    shared: false,
  });
  assert.throws(() => authenticateToken("b".repeat(32), env), /no es válida/);
  assert.throws(() => authenticateToken("otra-clave-que-no-coincide-123456", env), /no es válida/);
  assert.throws(
    () => authenticateToken("shared-token-secure-1234567890", { FARO_SAVE_TOKEN: "shared-token-secure-1234567890" }),
    /FARO_USERS_JSON/,
  );

  const user = authenticateToken("a".repeat(32), env);
  const now = Date.UTC(2026, 7, 13, 12, 0, 0);
  const signedSession = createSession(user, env, now);
  assert.equal(signedSession.includes("a".repeat(32)), false);
  assert.equal(verifySession(signedSession, env, now + 1000).id, "aaron");
  assert.throws(() => verifySession(signedSession, env, now + 8 * 60 * 60 * 1000 + 1000), /venció/);
});

test("crea una sesión HttpOnly sin devolver la clave al navegador", async () => {
  const originalUsers = process.env.FARO_USERS_JSON;
  const originalSaveToken = process.env.FARO_SAVE_TOKEN;
  const originalSessionSecret = process.env.FARO_SESSION_SECRET;
  const personalToken = "token-personal-seguro-1234567890";
  process.env.FARO_USERS_JSON = JSON.stringify([
    { id: "aaron", name: "Aarón Mayorga", role: "Administrador", token: personalToken, active: true },
  ]);
  process.env.FARO_SESSION_SECRET = SESSION_SECRET;
  delete process.env.FARO_SAVE_TOKEN;
  const response = {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    await sessionHandler({
      method: "POST",
      headers: requestHeaders,
      body: { token: personalToken },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.user.name, "Aarón Mayorga");
    assert.equal(JSON.stringify(response.body).includes(personalToken), false);
    assert.match(response.headers["Set-Cookie"], /HttpOnly/);
    assert.match(response.headers["Set-Cookie"], /SameSite=Strict/);
    assert.match(response.headers["Set-Cookie"], /Secure/);
    assert.match(response.headers["Set-Cookie"], /^__Host-faro_session=/);
    assert.equal(response.headers["Set-Cookie"].includes(personalToken), false);

    const cookie = response.headers["Set-Cookie"].split(";")[0];
    const authenticated = { ...response, headers: {}, statusCode: 0, body: null };
    await sessionHandler({ method: "GET", headers: { cookie } }, authenticated);
    assert.equal(authenticated.statusCode, 200);
    assert.equal(authenticated.body.user.id, "aaron");

    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith("a") ? "b" : "a"}`;
    const rejectedSession = { ...response, headers: {}, statusCode: 0, body: null };
    await sessionHandler({ method: "GET", headers: { cookie: tampered } }, rejectedSession);
    assert.equal(rejectedSession.statusCode, 401);

    const rejectedOrigin = { ...response, headers: {}, statusCode: 0, body: null };
    await sessionHandler({
      method: "POST",
      headers: { ...requestHeaders, origin: "https://otro.example" },
      body: { token: personalToken },
    }, rejectedOrigin);
    assert.equal(rejectedOrigin.statusCode, 403);
    assert.equal(rejectedOrigin.headers["Set-Cookie"], undefined);
  } finally {
    if (originalUsers === undefined) delete process.env.FARO_USERS_JSON;
    else process.env.FARO_USERS_JSON = originalUsers;
    if (originalSaveToken === undefined) delete process.env.FARO_SAVE_TOKEN;
    else process.env.FARO_SAVE_TOKEN = originalSaveToken;
    if (originalSessionSecret === undefined) delete process.env.FARO_SESSION_SECRET;
    else process.env.FARO_SESSION_SECRET = originalSessionSecret;
  }
});

test("expone metadatos de versión sin descargar el Excel en el cliente", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "github-test-token";
  global.fetch = async url => {
    const requestUrl = String(url);
    if (requestUrl.includes("/contents/datos?ref=")) {
      return Response.json([{
        type: "file",
        name: TARGET_FILE,
        path: TARGET_PATH,
        sha: "source-sha",
      }]);
    }
    return Response.json({
      name: TARGET_FILE,
      path: TARGET_PATH,
      sha: "source-sha",
      content: source.toString("base64"),
    });
  };
  const response = {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };

  try {
    await handler({ method: "GET", query: { meta: "1" }, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.version, `${TARGET_PATH}:source-sha`);
    assert.equal(response.headers["X-Faro-Version"], response.body.version);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
});

test("rechaza un borrador obsoleto antes de escribir en GitHub", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalSaveToken = process.env.FARO_SAVE_TOKEN;
  const originalUsers = process.env.FARO_USERS_JSON;
  const originalAllowShared = process.env.FARO_ALLOW_SHARED_TOKEN;
  process.env.GITHUB_TOKEN = "github-test-token";
  process.env.FARO_SAVE_TOKEN = "save-test-token";
  process.env.FARO_ALLOW_SHARED_TOKEN = "true";
  delete process.env.FARO_USERS_JSON;
  let putCount = 0;

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/contents/datos?ref=")) {
      return Response.json([{
        type: "file",
        name: TARGET_FILE,
        path: TARGET_PATH,
        sha: "source-sha",
      }]);
    }
    if (options.method === "PUT") {
      putCount += 1;
      return Response.json({});
    }
    if (requestUrl.includes(TARGET_FILE)) {
      return Response.json({
        name: TARGET_FILE,
        path: TARGET_PATH,
        sha: "source-sha",
        content: source.toString("base64"),
      });
    }
    return Response.json({}, { status: 404 });
  };

  const response = {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };

  try {
    await handler({
      method: "POST",
      headers: { ...requestHeaders, authorization: "Bearer save-test-token" },
      body: {
        date: TODAY,
        tasks: currentTasks(),
        history: [],
        note: "Borrador viejo",
        baseVersion: "datos/FARO_Cronograma_2026-08-04.xlsx:old-sha",
      },
    }, response);

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, "VERSION_CONFLICT");
    assert.equal(response.body.currentVersion, `${TARGET_PATH}:source-sha`);
    assert.equal(putCount, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalSaveToken === undefined) delete process.env.FARO_SAVE_TOKEN;
    else process.env.FARO_SAVE_TOKEN = originalSaveToken;
    if (originalUsers === undefined) delete process.env.FARO_USERS_JSON;
    else process.env.FARO_USERS_JSON = originalUsers;
    if (originalAllowShared === undefined) delete process.env.FARO_ALLOW_SHARED_TOKEN;
    else process.env.FARO_ALLOW_SHARED_TOKEN = originalAllowShared;
  }
});

test("rechaza fechas distintas al día actual de Costa Rica antes de consultar GitHub", async () => {
  const originalUsers = process.env.FARO_USERS_JSON;
  process.env.FARO_USERS_JSON = JSON.stringify([
    { id: "aaron", name: "Aarón Mayorga", role: "Administrador", token: "a".repeat(32), active: true },
  ]);
  const response = {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    await handler({
      method: "POST",
      headers: { ...requestHeaders, authorization: `Bearer ${"a".repeat(32)}` },
      body: {
        date: "9999-12-31",
        tasks: currentTasks(),
        history: [],
        note: "Fecha manipulada",
        baseVersion: "version",
      },
    }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, "CUT_DATE_MISMATCH");
  } finally {
    if (originalUsers === undefined) delete process.env.FARO_USERS_JSON;
    else process.env.FARO_USERS_JSON = originalUsers;
  }
});

test("bloquea el guardado si el Excel oficial perdió su histórico", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalUsers = process.env.FARO_USERS_JSON;
  process.env.GITHUB_TOKEN = "github-test-token";
  process.env.FARO_USERS_JSON = JSON.stringify([
    { id: "aaron", name: "Aarón Mayorga", role: "Administrador", token: "a".repeat(32), active: true },
  ]);

  const base = XLSX.read(sourceArray, { type: "array" });
  for (const sheetName of [...base.SheetNames]) {
    if (["histórico avance", "historico avance", "histórico", "historico"].includes(sheetName.toLowerCase())) {
      delete base.Sheets[sheetName];
      base.SheetNames = base.SheetNames.filter(name => name !== sheetName);
    }
  }
  const corrupt = Buffer.from(XLSX.write(base, { type: "buffer", bookType: "xlsx" }));
  let putCount = 0;
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/contents/datos?ref=")) {
      return Response.json([{
        type: "file", name: TARGET_FILE,
        path: TARGET_PATH, sha: "source-sha",
      }]);
    }
    if (options.method === "PUT") {
      putCount += 1;
      return Response.json({});
    }
    return Response.json({
      name: TARGET_FILE,
      path: TARGET_PATH,
      sha: "source-sha",
      content: corrupt.toString("base64"),
    });
  };
  const response = {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };

  try {
    await handler({
      method: "POST",
      headers: { ...requestHeaders, authorization: `Bearer ${"a".repeat(32)}` },
      body: {
        date: TODAY,
        tasks: currentTasks(),
        history: [{ date: "2026-08-04", global: 99 }],
        note: "No debe guardarse",
        baseVersion: `${TARGET_PATH}:source-sha`,
      },
    }, response);
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.code, "HISTORY_INVALID");
    assert.equal(putCount, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalUsers === undefined) delete process.env.FARO_USERS_JSON;
    else process.env.FARO_USERS_JSON = originalUsers;
  }
});
