import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { INITIAL_TASKS } from "../src/constants.js";
import {
  createWorkbook,
  parseWorkbookHistory,
  parseWorkbookUpdates,
  workbookToArray,
} from "../src/excel.js";
import handler, { normalizeSavePayload } from "../api/cuts.js";

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
  });

  assert.equal(result.tasks.length, 44);
  assert.equal(result.tasks[0].name, INITIAL_TASKS[0].name);
  assert.equal(result.date, "2026-08-13");
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
  assert.equal(history.at(-1).date, "2026-08-13");
  assert.equal(total, 655);
});

test("la Function publica en GitHub un Excel válido y devuelve el commit", async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalSaveToken = process.env.FARO_SAVE_TOKEN;
  process.env.GITHUB_TOKEN = "github-test-token";
  process.env.FARO_SAVE_TOKEN = "save-test-token";

  let uploadedWorkbook;
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/contents/datos?ref=")) {
      return Response.json([{
        type: "file",
        name: "FARO_Cronograma_2026-08-13.xlsx",
        path: "datos/FARO_Cronograma_2026-08-13.xlsx",
        sha: "source-sha",
      }]);
    }
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      uploadedWorkbook = Buffer.from(body.content, "base64");
      return Response.json({
        commit: { sha: "abcdef1234567890", html_url: "https://github.example/commit/abcdef1" },
      });
    }
    if (requestUrl.includes("FARO_Cronograma_2026-08-13.xlsx")) {
      return Response.json({
        name: "FARO_Cronograma_2026-08-13.xlsx",
        path: "datos/FARO_Cronograma_2026-08-13.xlsx",
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
      headers: { authorization: "Bearer save-test-token" },
      body: {
        date: "2026-08-13",
        tasks: currentTasks(),
        history: [],
        note: "Publicado desde prueba",
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.commitSha, "abcdef1234567890");
    assert.ok(uploadedWorkbook);
    const reopened = XLSX.read(uploadedWorkbook, { type: "buffer" });
    assert.ok(reopened.SheetNames.includes("Evidencia horas"));
    assert.equal(Object.keys(parseWorkbookUpdates(uploadedWorkbook)).length, 44);
    assert.deepEqual(
      parseWorkbookHistory(uploadedWorkbook).map(cut => cut.date),
      ["2026-08-04", "2026-08-13"],
    );
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalSaveToken === undefined) delete process.env.FARO_SAVE_TOKEN;
    else process.env.FARO_SAVE_TOKEN = originalSaveToken;
  }
});
