import * as XLSX from "xlsx";
import { TEAM, PHASES, sumH, gtm } from "./constants";

// ═══ EXPORT ═══
export function exportToExcel(tasks) {
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

  XLSX.writeFile(wb, `FARO_Cronograma_${new Date().toISOString().slice(0, 10)}.xlsx`);
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

export function importFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        resolve(parseWorkbookUpdates(e.target.result));
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
// next to the app. Returns { updates, lastModified } or null if there is no published file.
export async function fetchPublishedData() {
  try {
    const res = await fetch("./datos/FARO_Cronograma.xlsx", { cache: "no-store" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const updates = parseWorkbookUpdates(buf);
    const lm = res.headers.get("Last-Modified");
    return { updates, lastModified: lm ? new Date(lm) : null };
  } catch {
    return null;
  }
}
