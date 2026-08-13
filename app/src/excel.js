import * as XLSX from "xlsx";
import { TEAM, PHASES, sumH, gtm } from "./constants.js";

const HISTORY_SHEET_NAMES = ["histórico avance", "historico avance", "histórico", "historico"];
const AUDIT_SHEET_NAMES = ["auditoría", "auditoria", "bitácora", "bitacora"];
const HISTORY_PHASE_COLUMNS = [
  { phase: "Levantamiento", header: "Levantamiento" },
  { phase: "Diseño", header: "Diseño" },
  { phase: "Desarrollo", header: "Desarrollo" },
  { phase: "Pruebas", header: "Pruebas" },
  { phase: "Impl. y Transferencia", header: "Impl. y transferencia" },
  { phase: "Migración de Datos", header: "Migración de datos" },
];

const round1 = value => Math.round(value * 10) / 10;

export function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKey(value) {
  if (value === undefined || value === null || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function percentValue(value) {
  if (value === undefined || value === null || value === "") return 0;
  const hasPercentSymbol = typeof value === "string" && value.includes("%");
  const numeric = typeof value === "string"
    ? Number(value.replace("%", "").replace(",", ".").trim())
    : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = !hasPercentSymbol && Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return round1(Math.max(0, Math.min(100, normalized)));
}

function calculateProgress(tasks) {
  const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
  const completedHours = tasks.reduce((sum, task) => sum + task.hours * task.progress / 100, 0);
  const phases = {};

  PHASES.forEach(phase => {
    const phaseTasks = tasks.filter(task => task.phase === phase.name);
    const hours = phaseTasks.reduce((sum, task) => sum + task.hours, 0);
    const completed = phaseTasks.reduce((sum, task) => sum + task.hours * task.progress / 100, 0);
    phases[phase.name] = hours > 0
      ? round1(completed / hours * 100)
      : (phaseTasks.length > 0 && phaseTasks.every(task => task.progress === 100) ? 100 : 0);
  });

  return {
    global: totalHours > 0 ? round1(completedHours / totalHours * 100) : 0,
    phases,
  };
}

export function buildHistoryCut(tasks, previousHistory = [], note = "", options = {}) {
  const date = options.date || todayKey();
  const progress = calculateProgress(tasks);
  const previous = previousHistory.find(cut => cut.date === date);

  return {
    date,
    global: progress.global,
    phases: progress.phases,
    branch: options.branch ?? previous?.branch ?? "Seguimiento-FARO",
    commit: options.commit ?? previous?.commit ?? "",
    notes: note.trim() || previous?.notes || "Corte exportado desde el tablero de seguimiento.",
    updatedBy: options.actor?.name ?? previous?.updatedBy ?? "",
    updatedById: options.actor?.id ?? previous?.updatedById ?? "",
    updatedAt: options.savedAt ?? previous?.updatedAt ?? "",
  };
}

export function withCurrentCut(tasks, history, note, options = {}) {
  const normalized = Array.isArray(history) ? history.filter(cut => cut?.date) : [];
  const current = buildHistoryCut(tasks, normalized, note, options);
  return [...normalized.filter(cut => cut.date !== current.date), current]
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ═══ EXPORT ═══
export function createWorkbook(tasks, history = [], note = "", options = {}) {
  const rows = tasks.map(t => {
    const respNames = t.responsible.map(id => gtm(id).name).join(", ");
    const tHL = sumH(t.hoursBy);
    const status = t.progress === 100 ? "Listo" : t.progress > 0 ? "En curso" : "Pendiente";

    const row = {
      ID: t.id,
      Fase: t.phase,
      Tarea: t.name,
      "Horas Plan": t.hours,
      "Avance %": t.progress,
      Estado: status,
      Responsables: respNames,
    };

    // Add per-person hours columns
    TEAM.forEach(m => {
      row[`Horas ${m.name}`] = t.hoursBy?.[m.id] || 0;
    });

    row["Total Horas Reales"] = tHL;
    row["Notas"] = t.notes || "";
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 4 },   // ID
    { wch: 22 },  // Fase
    { wch: 42 },  // Tarea
    { wch: 11 },  // Horas Plan
    { wch: 10 },  // Avance
    { wch: 10 },  // Estado
    { wch: 35 },  // Responsables
    ...TEAM.map(() => ({ wch: 14 })),
    { wch: 16 },  // Total
    { wch: 40 },  // Notas
  ];

  const wb = options.baseWorkbookData
    ? XLSX.read(options.baseWorkbookData, { type: "array", cellStyles: true })
    : XLSX.utils.book_new();
  const upsertSheet = (name, sheet, matches = candidate => candidate === name) => {
    const existingNames = wb.SheetNames.filter(matches);
    const insertionIndex = existingNames.length > 0
      ? wb.SheetNames.indexOf(existingNames[0])
      : wb.SheetNames.length;
    for (const existingName of existingNames) {
      delete wb.Sheets[existingName];
      wb.SheetNames = wb.SheetNames.filter(candidate => candidate !== existingName);
    }
    wb.SheetNames.splice(insertionIndex, 0, name);
    wb.Sheets[name] = sheet;
  };
  upsertSheet(
    "Cronograma",
    ws,
    candidate => candidate.toLowerCase().includes("cronograma") || candidate.toLowerCase().includes("crono"),
  );

  // Summary sheet
  const summaryRows = PHASES.map(p => {
    const pt = tasks.filter(t => t.phase === p.name);
    const pH = pt.reduce((s, t) => s + t.hours, 0);
    const pC = pt.reduce((s, t) => s + t.hours * t.progress / 100, 0);
    const pHL = pt.reduce((s, t) => s + sumH(t.hoursBy), 0);
    return {
      Fase: p.name,
      Tareas: pt.length,
      Completadas: pt.filter(t => t.progress === 100).length,
      "Horas Plan": pH,
      "Horas Reales": pHL,
      "Avance %": pH > 0 ? Math.round(pC / pH * 100) : 0,
    };
  });

  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2["!cols"] = [{ wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 11 }, { wch: 13 }, { wch: 10 }];
  upsertSheet("Resumen", ws2);

  // Team sheet
  const teamRows = TEAM.map(m => {
    const mt = tasks.filter(t => t.responsible.includes(m.id));
    const mHL = tasks.reduce((s, t) => s + (parseFloat(t.hoursBy?.[m.id]) || 0), 0);
    return {
      Nombre: m.name,
      Rol: m.role,
      Dedicación: m.ded,
      "Tareas Asignadas": mt.length,
      "Horas Reales": mHL,
    };
  });

  const ws3 = XLSX.utils.json_to_sheet(teamRows);
  ws3["!cols"] = [{ wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 13 }];
  upsertSheet("Equipo", ws3);

  // History sheet: one row per review date. Exporting again on the same day updates that day's cut.
  const completeHistory = withCurrentCut(tasks, history, note, options);
  const historyRows = completeHistory.map(cut => {
    const row = {
      "Fecha del corte": new Date(`${cut.date}T12:00:00`),
      "Avance general": cut.global / 100,
    };

    HISTORY_PHASE_COLUMNS.forEach(({ phase, header }) => {
      row[header] = (cut.phases?.[phase] || 0) / 100;
    });

    row["Rama revisada"] = cut.branch || "";
    row["Commit"] = cut.commit || "";
    row["Notas / evidencia"] = cut.notes || "";
    row["Actualizado por"] = cut.updatedBy || "";
    row["Actualizado por ID"] = cut.updatedById || "";
    row["Actualizado en UTC"] = cut.updatedAt || "";
    return row;
  });

  const ws4 = XLSX.utils.json_to_sheet(historyRows, { dateNF: "dd/mm/yyyy" });
  ws4["!cols"] = [
    { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 13 }, { wch: 11 },
    { wch: 22 }, { wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 62 },
    { wch: 24 }, { wch: 20 }, { wch: 25 },
  ];
  if (historyRows.length > 0) {
    for (let row = 2; row <= historyRows.length + 1; row += 1) {
      ws4[`A${row}`].z = "dd/mm/yyyy";
      for (const col of ["B", "C", "D", "E", "F", "G", "H"]) {
        ws4[`${col}${row}`].z = "0.0%";
      }
    }
  }
  upsertSheet(
    "Histórico avance",
    ws4,
    candidate => HISTORY_SHEET_NAMES.includes(candidate.toLowerCase()),
  );

  // Append-only audit log. Unlike the daily history row, this keeps every save.
  const previousAudit = options.baseWorkbookData ? parseWorkbookAudit(options.baseWorkbookData) : [];
  const completeAudit = options.auditEvent
    ? [...previousAudit, { ...options.auditEvent }]
    : previousAudit;
  if (completeAudit.length > 0) {
    const auditRows = completeAudit.map(event => ({
      "ID de operación": event.operationId || "",
      "Fecha y hora UTC": event.savedAt || "",
      "Fecha del corte": event.cutDate || "",
      "Usuario ID": event.userId || "",
      Usuario: event.userName || "",
      Rol: event.role || "",
      Acción: event.action || "Guardar corte",
      Archivo: event.fileName || "",
      "Versión base": event.baseVersion || "",
    }));
    const auditSheet = XLSX.utils.json_to_sheet(auditRows);
    auditSheet["!cols"] = [
      { wch: 38 }, { wch: 25 }, { wch: 16 }, { wch: 20 }, { wch: 26 },
      { wch: 20 }, { wch: 18 }, { wch: 42 }, { wch: 72 },
    ];
    upsertSheet(
      "Auditoría",
      auditSheet,
      candidate => AUDIT_SHEET_NAMES.includes(candidate.toLowerCase()),
    );
  }

  return { workbook: wb, history: completeHistory, audit: completeAudit };
}

export function workbookToArray(workbook) {
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
}

export function exportToExcel(tasks, history = [], note = "") {
  const date = todayKey();
  const { workbook } = createWorkbook(tasks, history, note, { date });
  XLSX.writeFile(workbook, `FARO_Cronograma_${date}.xlsx`);
}

// ═══ IMPORT ═══
// Parses an exported workbook (ArrayBuffer) into an updates map: taskId -> { progress, notes, hoursBy, responsible }.
// Throws if the file is empty or wasn't exported from this tool.
export function parseWorkbookUpdates(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: "array" });

  // Find the right sheet
  const sheetName = wb.SheetNames.find(s =>
    s.toLowerCase().includes("cronograma") || s.toLowerCase().includes("crono")
  ) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  // Preserve blank cells from managed columns. An empty responsible/notes cell
  // is an intentional value and must not fall back to INITIAL_TASKS on reload.
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  if (!rows || rows.length === 0) {
    throw new Error("El archivo está vacío o no tiene datos válidos.");
  }

  // Check required columns
  const first = rows[0];
  const hasID = "ID" in first || "id" in first;
  if (!hasID) {
    throw new Error("El archivo no tiene columna 'ID'. Asegurate de usar un Excel exportado desde esta herramienta.");
  }

  // Build update map: taskId -> { progress, notes, hoursBy, responsible }
  const updates = {};
  const teamNameToId = {};
  TEAM.forEach(m => {
    teamNameToId[m.name.toLowerCase()] = m.id;
    teamNameToId[m.short.toLowerCase()] = m.id;
  });

  rows.forEach(row => {
    const id = parseInt(row["ID"] || row["id"]);
    if (isNaN(id)) return;

    const update = {};

    // Progress
    const pct = row["Avance %"] ?? row["Avance"] ?? row["avance"];
    if (pct !== undefined && pct !== null) {
      const val = parseInt(pct);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        update.progress = Math.round(val / 5) * 5; // snap to 5%
      }
    }

    // Notes
    const notes = row["Notas"] ?? row["notas"] ?? row["Comentarios"];
    if (notes !== undefined && notes !== null) {
      update.notes = String(notes);
    }

    // Hours by person
    const hoursBy = {};
    let hasHours = false;
    TEAM.forEach(m => {
      const key = `Horas ${m.name}`;
      const val = row[key];
      if (val !== undefined && val !== null) {
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0) {
          hoursBy[m.id] = num;
          hasHours = true;
        }
      }
    });
    if (hasHours) update.hoursBy = hoursBy;

    // Responsible (from comma-separated names)
    const hasResponsibleColumn = Object.hasOwn(row, "Responsables") || Object.hasOwn(row, "responsables");
    const respStr = row["Responsables"] ?? row["responsables"];
    if (hasResponsibleColumn && typeof respStr === "string") {
      const names = respStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const ids = names.map(n => teamNameToId[n]).filter(Boolean);
      update.responsible = ids;
    }

    if (Object.keys(update).length > 0) {
      updates[id] = update;
    }
  });

  if (Object.keys(updates).length === 0) {
    throw new Error("No se encontraron datos válidos para actualizar.");
  }

  return updates;
}

export function parseWorkbookHistory(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames.find(name => HISTORY_SHEET_NAMES.includes(name.toLowerCase()));
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: true });
  return rows.map(row => {
    const date = dateKey(row["Fecha del corte"] ?? row["Fecha"] ?? row["Corte"]);
    if (!date) return null;

    const phases = {};
    HISTORY_PHASE_COLUMNS.forEach(({ phase, header }) => {
      phases[phase] = percentValue(row[header] ?? row[phase]);
    });

    return {
      date,
      global: percentValue(row["Avance general"] ?? row["Avance Global"] ?? row["Avance"]),
      phases,
      branch: String(row["Rama revisada"] ?? row["Rama"] ?? "").trim(),
      commit: String(row["Commit"] ?? "").trim(),
      notes: String(row["Notas / evidencia"] ?? row["Notas"] ?? row["Evidencia"] ?? "").trim(),
      updatedBy: String(row["Actualizado por"] ?? "").trim(),
      updatedById: String(row["Actualizado por ID"] ?? "").trim(),
      updatedAt: String(row["Actualizado en UTC"] ?? "").trim(),
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

export function parseWorkbookAudit(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames.find(name => AUDIT_SHEET_NAMES.includes(name.toLowerCase()));
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "", raw: false });
  return rows.map(row => ({
    operationId: String(row["ID de operación"] ?? "").trim(),
    savedAt: String(row["Fecha y hora UTC"] ?? "").trim(),
    cutDate: dateKey(row["Fecha del corte"]) || String(row["Fecha del corte"] ?? "").trim(),
    userId: String(row["Usuario ID"] ?? "").trim(),
    userName: String(row["Usuario"] ?? "").trim(),
    role: String(row["Rol"] ?? "").trim(),
    action: String(row["Acción"] ?? "").trim(),
    fileName: String(row["Archivo"] ?? "").trim(),
    baseVersion: String(row["Versión base"] ?? "").trim(),
  })).filter(event => event.operationId || event.savedAt || event.userName);
}

export function importFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        resolve({
          updates: parseWorkbookUpdates(e.target.result),
          history: parseWorkbookHistory(e.target.result),
        });
      } catch (err) {
        reject(new Error("Error leyendo el archivo: " + err.message));
      }
    };

    reader.onerror = () => reject(new Error("Error leyendo el archivo."));
    reader.readAsArrayBuffer(file);
  });
}

// ═══ PUBLISHED DATA ═══
// Vercel serves the latest workbook through /api/cuts. GitHub Pages keeps the
// static datos/ fallback so both deployments can read the same published data.
export async function fetchPublishedData({ allowStatic = true } = {}) {
  const sources = allowStatic
    ? ["/api/cuts", "./datos/FARO_Cronograma.xlsx"]
    : ["/api/cuts"];
  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const updates = parseWorkbookUpdates(buf);
      const history = parseWorkbookHistory(buf);
      const lm = res.headers.get("Last-Modified");
      return {
        updates,
        history,
        lastModified: lm ? new Date(lm) : null,
        fileName: res.headers.get("X-Cut-File") || "FARO_Cronograma.xlsx",
        version: res.headers.get("X-Faro-Version") || res.headers.get("ETag")?.replace(/^\"|\"$/g, "") || null,
        updatedBy: decodeHeader(res.headers.get("X-Faro-Updated-By")),
        updatedById: decodeHeader(res.headers.get("X-Faro-Updated-By-Id")),
        updatedAt: res.headers.get("X-Faro-Updated-At") || null,
        source: url === "/api/cuts" ? "vercel" : "static",
      };
    } catch {
      // Try the next source.
    }
  }
  return null;
}

function decodeHeader(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function fetchPublishedMeta() {
  try {
    const response = await fetch("/api/cuts?meta=1", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function saveCutToRemote({ tasks, history, note, baseVersion, date = todayKey() }) {
  const res = await fetch("/api/cuts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ tasks, history, note, date, baseVersion }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error || "No se pudo guardar el corte en GitHub.");
    error.status = res.status;
    error.code = payload.code;
    error.currentVersion = payload.currentVersion;
    error.currentFileName = payload.currentFileName;
    error.updatedBy = payload.updatedBy;
    error.updatedAt = payload.updatedAt;
    throw error;
  }
  return payload;
}
