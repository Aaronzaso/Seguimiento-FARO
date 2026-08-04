import * as XLSX from "xlsx";
import { TEAM, PHASES, sumH, gtm } from "./constants.js";

const HISTORY_SHEET_NAMES = ["histórico avance", "historico avance", "histórico", "historico"];
const HISTORY_PHASE_COLUMNS = [
  { phase: "Levantamiento", header: "Levantamiento" },
  { phase: "Diseño", header: "Diseño" },
  { phase: "Desarrollo", header: "Desarrollo" },
  { phase: "Pruebas", header: "Pruebas" },
  { phase: "Impl. y Transferencia", header: "Impl. y transferencia" },
  { phase: "Migración de Datos", header: "Migración de datos" },
];

const round1 = value => Math.round(value * 10) / 10;

function todayKey() {
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

export function buildHistoryCut(tasks, previousHistory = [], note = "") {
  const date = todayKey();
  const progress = calculateProgress(tasks);
  const previous = previousHistory.find(cut => cut.date === date);

  return {
    date,
    global: progress.global,
    phases: progress.phases,
    branch: previous?.branch || "Seguimiento-FARO",
    commit: previous?.commit || "",
    notes: note.trim() || previous?.notes || "Corte exportado desde el tablero de seguimiento.",
  };
}

function withCurrentCut(tasks, history, note) {
  const normalized = Array.isArray(history) ? history.filter(cut => cut?.date) : [];
  const current = buildHistoryCut(tasks, normalized, note);
  return [...normalized.filter(cut => cut.date !== current.date), current]
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ═══ EXPORT ═══
export function exportToExcel(tasks, history = [], note = "") {
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

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cronograma");

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
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

  // Team sheet
  const teamRows = TEAM.map(m => {
    const mt = tasks.filter(t => t.responsible.includes(m.id));
    const mHL = mt.reduce((s, t) => s + (parseFloat(t.hoursBy?.[m.id]) || 0), 0);
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
  XLSX.utils.book_append_sheet(wb, ws3, "Equipo");

  // History sheet: one row per review date. Exporting again on the same day updates that day's cut.
  const historyRows = withCurrentCut(tasks, history, note).map(cut => {
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
    return row;
  });

  const ws4 = XLSX.utils.json_to_sheet(historyRows, { dateNF: "dd/mm/yyyy" });
  ws4["!cols"] = [
    { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 13 }, { wch: 11 },
    { wch: 22 }, { wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 62 },
  ];
  if (historyRows.length > 0) {
    for (let row = 2; row <= historyRows.length + 1; row += 1) {
      ws4[`A${row}`].z = "dd/mm/yyyy";
      for (const col of ["B", "C", "D", "E", "F", "G", "H"]) {
        ws4[`${col}${row}`].z = "0.0%";
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, ws4, "Histórico avance");

  XLSX.writeFile(wb, `FARO_Cronograma_${todayKey()}.xlsx`);
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
  const rows = XLSX.utils.sheet_to_json(ws);

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
    const notes = row["Notas"] || row["notas"] || row["Comentarios"];
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
    const respStr = row["Responsables"] || row["responsables"];
    if (respStr && typeof respStr === "string") {
      const names = respStr.split(",").map(s => s.trim().toLowerCase());
      const ids = names.map(n => teamNameToId[n]).filter(Boolean);
      if (ids.length > 0) update.responsible = ids;
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
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
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
// The deploy workflow publishes the latest Excel from datos/ as datos/FARO_Cronograma.xlsx
// next to the app. Returns { updates, history, lastModified } or null if there is no published file.
export async function fetchPublishedData() {
  try {
    const res = await fetch("./datos/FARO_Cronograma.xlsx", { cache: "no-store" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const updates = parseWorkbookUpdates(buf);
    const history = parseWorkbookHistory(buf);
    const lm = res.headers.get("Last-Modified");
    return { updates, history, lastModified: lm ? new Date(lm) : null };
  } catch {
    return null;
  }
}