import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { GT, PHASES, TEAM, INITIAL_TASKS, gph, gtm, sumH, migrateTask, getDeadlineStats, PROJECT_DEADLINE } from "./constants";
import { storageGet, storageSet } from "./storage";
import { exportToExcel, importFromExcel, fetchPublishedData, saveCutToRemote } from "./excel";

const SK = "faro-v6";
const REMOTE_TOKEN_KEY = "faro_save_token";

function DragBar({ value, color, onChange, h = 8 }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const [, tick] = useState(0);
  const calc = useCallback((cx) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(cx - r.left, r.width));
    onChange(Math.max(0, Math.min(100, Math.round((x / r.width) * 20) * 5)));
  }, [onChange]);
  useEffect(() => {
    const mv = e => { if (dragging.current) calc(e.clientX); };
    const up = () => { dragging.current = false; tick(t => t + 1); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [calc]);
  return (
    <div ref={ref} onMouseDown={e => { dragging.current = true; calc(e.clientX); }}
      style={{ width: "100%", height: h, background: GT.warmGreyLight, borderRadius: h / 2, cursor: "ew-resize", flexShrink: 0 }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: h / 2, transition: dragging.current ? "none" : "width .2s" }} />
    </div>
  );
}

function Badge({ p }) {
  const c = p === 100 ? { bg: GT.greenBg, fg: GT.greenDark, t: "Listo" } : p > 0 ? { bg: GT.tealBg, fg: GT.teal, t: "En curso" } : { bg: GT.warmGreyBg, fg: "#aaa", t: "Pendiente" };
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: c.bg, color: c.fg, fontWeight: 700, whiteSpace: "nowrap" }}>{c.t}</span>;
}

function Avatars({ ids, size = 24 }) {
  if (!Array.isArray(ids)) return null;
  const shown = ids.slice(0, 3), extra = ids.length - 3;
  return (
    <div style={{ display: "flex", flexShrink: 0 }}>
      {shown.map((id, i) => { const m = gtm(id); return (
        <div key={id} title={`${m.name} (${m.role})`} style={{ width: size, height: size, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size < 22 ? 7 : 9, fontWeight: 800, color: "white", marginLeft: i > 0 ? -6 : 0, border: "2px solid white", zIndex: shown.length - i, position: "relative" }}>{m.short}</div>); })}
      {extra > 0 && <div style={{ width: size, height: size, borderRadius: "50%", background: GT.warmGrey, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "white", marginLeft: -6, border: "2px solid white" }}>+{extra}</div>}
    </div>
  );
}

// ═══ Deadline indicator ═══
function DeadlineGauge({ globalPct }) {
  const dl = getDeadlineStats();
  const diff = globalPct - dl.timePct;
  const status = dl.isPast ? { label: "Vencido", color: GT.red, icon: "🔴" }
    : diff >= 5 ? { label: "Adelantado", color: GT.greenDark, icon: "🟢" }
    : diff >= -5 ? { label: "En línea", color: GT.orange, icon: "🟡" }
    : { label: "En riesgo", color: GT.red, icon: "🔴" };

  return (
    <div style={{ background: "white", borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: GT.purple }}>📅 Cierre del Proyecto</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>{status.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: status.color }}>{status.label}</span>
        </div>
      </div>

      {/* Double progress bar */}
      <div style={{ position: "relative", height: 24, background: GT.warmGreyLight, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
        {/* Time elapsed (background) */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${dl.timePct}%`,
          background: `repeating-linear-gradient(45deg, ${GT.warmGrey}40, ${GT.warmGrey}40 4px, transparent 4px, transparent 8px)`,
          transition: "width .5s" }} />
        {/* Actual progress */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${globalPct}%`,
          background: `linear-gradient(90deg, ${GT.purple}, ${GT.purpleLight})`, borderRadius: 12, transition: "width .5s", opacity: .85 }} />
        {/* Time marker line */}
        <div style={{ position: "absolute", left: `${dl.timePct}%`, top: 0, bottom: 0, width: 2, background: GT.red, zIndex: 2 }} />
        {/* Labels inside bar */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "white", textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>
            Avance: {globalPct}% | Tiempo: {dl.timePct}%
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "#666" }}>
          <span style={{ fontWeight: 700, color: GT.purple }}>Fecha cierre:</span>{" "}
          {new Date(PROJECT_DEADLINE + "T12:00:00").toLocaleDateString("es-CR", { day: "2-digit", month: "long", year: "numeric" })}
        </div>
        <div style={{ fontSize: 11, color: "#666" }}>
          <span style={{ fontWeight: 700, color: GT.red }}>Días restantes:</span>{" "}
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{dl.remaining}</span>
        </div>
        <div style={{ fontSize: 11, color: "#666" }}>
          <span style={{ fontWeight: 700 }}>Diferencia:</span>{" "}
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: status.color }}>
            {diff > 0 ? `+${diff}%` : `${diff}%`}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: "#999" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 8, borderRadius: 2, background: `linear-gradient(90deg, ${GT.purple}, ${GT.purpleLight})` }} /> Avance real
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 14, height: 8, borderRadius: 2, background: `repeating-linear-gradient(45deg, ${GT.warmGrey}60, ${GT.warmGrey}60 2px, transparent 2px, transparent 4px)` }} /> Tiempo transcurrido
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 2, height: 8, background: GT.red }} /> Hoy
        </div>
      </div>
    </div>
  );
}

// ═══ MAIN APP ═══
export default function App() {
  const [tasks, setTasks] = useState(() => INITIAL_TASKS.map(migrateTask));
  const [tab, setTab] = useState("avance");
  const [fp, setFp] = useState("all");
  const [fm, setFm] = useState("all");
  const [exp, setExp] = useState(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState([]);
  const [importMsg, setImportMsg] = useState(null);
  const [published, setPublished] = useState(null);
  const [savingCut, setSavingCut] = useState(false);
  const fileRef = useRef(null);
  const isGitHubPages = window.location.hostname.endsWith("github.io");

  const applyUpdates = useCallback((updates) => {
    setTasks(prev => prev.map(t => {
      const u = updates[t.id];
      if (!u) return t;
      const merged = { ...t };
      if (u.progress !== undefined) merged.progress = u.progress;
      if (u.notes !== undefined) merged.notes = u.notes;
      if (u.hoursBy) merged.hoursBy = { ...t.hoursBy, ...u.hoursBy };
      if (u.responsible) merged.responsible = u.responsible;
      return merged;
    }));
  }, []);

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let hasLocal = false;
      try {
        const raw = await storageGet(SK);
        if (!cancelled && raw) {
          const d = JSON.parse(raw);
          if (d.tasks && Array.isArray(d.tasks)) { setTasks(d.tasks.map(migrateTask)); hasLocal = true; }
          if (typeof d.note === "string") setNote(d.note);
          if (Array.isArray(d.history)) setHistory(d.history);
        }
      } catch (err) { console.error("Load:", err); }

      // Published Excel (datos/ in the repo, copied next to the app on deploy)
      try {
        const pub = await fetchPublishedData();
        if (!cancelled && pub) {
          setPublished(pub);
          if (pub.history?.length) setHistory(pub.history);
          if (!hasLocal) applyUpdates(pub.updates); // first visit: start from the team's published data
        }
      } catch (err) { console.error("Published:", err); }

      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [applyUpdates]);

  // Save (debounced)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => { storageSet(SK, JSON.stringify({ tasks, note, history })); }, 400);
    return () => clearTimeout(t);
  }, [tasks, note, history, ready]);

  const updateTask = useCallback((id, updates) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const filtered = tasks.filter(t =>
    (fp === "all" || t.phase === fp) &&
    (fm === "all" || (Array.isArray(t.responsible) && t.responsible.includes(fm)))
  );

  const stats = useMemo(() => {
    const tH = tasks.reduce((s, t) => s + t.hours, 0);
    const cH = tasks.reduce((s, t) => s + t.hours * t.progress / 100, 0);
    const hL = tasks.reduce((s, t) => s + sumH(t.hoursBy), 0);
    const done = tasks.filter(t => t.progress === 100).length;
    const inP = tasks.filter(t => t.progress > 0 && t.progress < 100).length;
    const pend = tasks.filter(t => t.progress === 0).length;
    const phases = PHASES.map(p => {
      const pt = tasks.filter(t => t.phase === p.name);
      const pH = pt.reduce((s, t) => s + t.hours, 0);
      const pC = pt.reduce((s, t) => s + t.hours * t.progress / 100, 0);
      const pHL = pt.reduce((s, t) => s + sumH(t.hoursBy), 0);
      return { ...p, tasks: pt.length, hours: pH, hL: pHL, pct: pH > 0 ? Math.round(pC / pH * 100) : (pt.every(t => t.progress === 100) ? 100 : 0), done: pt.filter(t => t.progress === 100).length };
    });
    const ms = TEAM.map(m => {
      const mt = tasks.filter(t => Array.isArray(t.responsible) && t.responsible.includes(m.id));
      const mH = mt.reduce((s, t) => s + t.hours, 0);
      const mC = mt.reduce((s, t) => s + t.hours * t.progress / 100, 0);
      const mHL = mt.reduce((s, t) => s + (parseFloat(t.hoursBy?.[m.id]) || 0), 0);
      return { ...m, tasks: mt.length, hours: mH, pct: mH > 0 ? Math.round(mC / mH * 100) : 0,
        done: mt.filter(t => t.progress === 100).length, inP: mt.filter(t => t.progress > 0 && t.progress < 100).length, hL: mHL };
    });
    const active = tasks.filter(t => t.progress > 0 && t.progress < 100).sort((a, b) => b.progress - a.progress);
    const rd = tasks.filter(t => t.progress === 100 && t.hours > 0).sort((a, b) => b.id - a.id).slice(0, 10);
    return { tH, cH, hL, global: tH > 0 ? Math.round(cH / tH * 100) : 0, done, inP, pend, phases, ms, active, rd };
  }, [tasks]);

  // Import handler
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importFromExcel(file);
      applyUpdates(imported.updates);
      if (imported.history?.length) setHistory(imported.history);
      setImportMsg({ ok: true, text: `Se actualizaron ${Object.keys(imported.updates).length} tareas correctamente.` });
    } catch (err) {
      setImportMsg({ ok: false, text: err.message });
    }
    e.target.value = "";
    setTimeout(() => setImportMsg(null), 5000);
  };

  const handleSaveCut = async () => {
    let token = sessionStorage.getItem(REMOTE_TOKEN_KEY) || "";
    if (!token) {
      token = window.prompt("Ingresá la clave para publicar el corte en GitHub:")?.trim() || "";
      if (!token) return;
      sessionStorage.setItem(REMOTE_TOKEN_KEY, token);
    }

    setSavingCut(true);
    setImportMsg({ ok: true, text: "Publicando el Excel del corte en GitHub…" });
    try {
      const saved = await saveCutToRemote({ tasks, history, note, token });
      if (saved.history?.length) setHistory(saved.history);
      setPublished(prev => ({
        ...prev,
        history: saved.history || prev?.history || [],
        fileName: saved.fileName,
        lastModified: new Date(),
      }));
      setImportMsg({
        ok: true,
        text: `Corte publicado: ${saved.fileName} · commit ${saved.commitSha.slice(0, 7)}.`,
      });
    } catch (error) {
      if (error.status === 401) sessionStorage.removeItem(REMOTE_TOKEN_KEY);
      setImportMsg({ ok: false, text: error.message });
    } finally {
      setSavingCut(false);
      setTimeout(() => setImportMsg(null), 8000);
    }
  };

  const dl = getDeadlineStats();

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: GT.warmGreyBg, minHeight: "100vh", color: GT.black }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg, ${GT.purple} 0%, #3D2266 50%, ${GT.purpleLight} 100%)`, padding: "22px 28px 18px", color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, opacity: .5, fontFamily: "'JetBrains Mono',monospace" }}>GRANT THORNTON · PROYECTO FARO · WAVE 1</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: -.3 }}>Cronograma de Avance</h1>
            <div style={{ fontSize: 10, opacity: .4, marginTop: 3 }}>
              Cierre: 16/11/2026 · {dl.remaining} días restantes · {stats.tH}h planificadas
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{stats.global}%</div>
            <div style={{ fontSize: 10, opacity: .5, marginTop: 2 }}>{Math.round(stats.cH)}h de {stats.tH}h</div>
          </div>
        </div>

        {/* Phase strip */}
        <div style={{ display: "flex", gap: 2, marginTop: 14, height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,.1)" }}>
          {stats.phases.map(p => (
            <div key={p.name} style={{ flex: p.hours || 1, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: p.color, opacity: .25 }} />
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p.pct}%`, background: p.color, opacity: .8, transition: "width .5s" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 7, flexWrap: "wrap" }}>
          {stats.phases.map(p => (
            <div key={p.name} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, opacity: .7 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: p.color, display: "inline-block" }} />
              {p.name} <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{p.pct}%</span>
            </div>
          ))}
        </div>

        {/* Tabs + Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.06)", borderRadius: 10, padding: 3 }}>
            {[["avance", "📊 Avance"], ["ejecutivo", "📈 Ejecutivo"], ["historico", "🕘 Histórico"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 20px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: tab === k ? "rgba(255,255,255,.15)" : "transparent", color: tab === k ? "white" : "rgba(255,255,255,.4)", transition: "all .15s" }}>{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleSaveCut} disabled={savingCut || isGitHubPages}
              title={isGitHubPages ? "La publicación automática está disponible en la versión Vercel." : "Crear o actualizar el Excel del corte de hoy"}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.35)", background: savingCut || isGitHubPages ? "rgba(255,255,255,.08)" : GT.teal,
                color: "white", fontSize: 11, fontWeight: 700, cursor: savingCut ? "wait" : isGitHubPages ? "not-allowed" : "pointer", opacity: savingCut || isGitHubPages ? .65 : 1 }}>
              {savingCut ? "⏳ Publicando…" : isGitHubPages ? "☁️ Disponible en Vercel" : "☁️ Guardar corte"}
            </button>
            <button onClick={() => exportToExcel(tasks, history, note)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.8)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              📥 Exportar Excel
            </button>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.8)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              📤 Importar Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: "none" }} />
          </div>
        </div>
      </div>

      {/* Published data bar */}
      {published && (
        <div style={{ padding: "8px 28px", background: GT.purpleBg, borderBottom: `1px solid ${GT.purple}20`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12 }}>📂</span>
          <span style={{ fontSize: 12, color: GT.purple, fontWeight: 600 }}>
            Datos publicados por el equipo
            {published.lastModified ? ` (${published.lastModified.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" })})` : ""}
            {published.fileName ? ` · ${published.fileName}` : ""}
          </span>
          <button onClick={() => {
            applyUpdates(published.updates);
            if (published.history?.length) setHistory(published.history);
            setImportMsg({ ok: true, text: `Se cargaron los datos publicados (${Object.keys(published.updates).length} tareas).` });
            setTimeout(() => setImportMsg(null), 5000);
          }}
            style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${GT.purple}40`, background: "white",
              color: GT.purple, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            🔄 Cargar
          </button>
          <span style={{ fontSize: 10, color: "#999" }}>Carga el Excel más reciente publicado en GitHub. “Guardar corte” crea o actualiza el archivo del día.</span>
        </div>
      )}

      {/* Import message */}
      {importMsg && (
        <div style={{ padding: "10px 28px", background: importMsg.ok ? GT.greenBg : GT.redBg,
          borderBottom: `1px solid ${importMsg.ok ? GT.greenDark : GT.red}40`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{importMsg.ok ? "✅" : "❌"}</span>
          <span style={{ fontSize: 12, color: importMsg.ok ? GT.greenDark : GT.red, fontWeight: 600 }}>{importMsg.text}</span>
        </div>
      )}

      {tab === "avance" && (
        <AvanceTab tasks={tasks} filtered={filtered} fp={fp} setFp={setFp} fm={fm} setFm={setFm} exp={exp} setExp={setExp} updateTask={updateTask} stats={stats} setTasks={setTasks} />
      )}
      {tab === "ejecutivo" && <EjecTab stats={stats} tasks={tasks} note={note} setNote={setNote} />}
      {tab === "historico" && <HistoryTab history={history} />}
    </div>
  );
}

// ═══ AVANCE TAB ═══
function AvanceTab({ tasks, filtered, fp, setFp, fm, setFm, exp, setExp, updateTask, stats, setTasks }) {
  return (
    <>
      <div style={{ padding: "12px 28px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: `1px solid ${GT.warmGreyLight}`, background: "white" }}>
        <select value={fp} onChange={e => setFp(e.target.value)} style={sel}>
          <option value="all">Todas las fases</option>
          {PHASES.map(p => <option key={p.name} value={p.name}>{p.icon} {p.name}</option>)}
        </select>
        <select value={fm} onChange={e => setFm(e.target.value)} style={sel}>
          <option value="all">Todo el equipo</option>
          {TEAM.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#999" }}>{filtered.length} tareas</span>
          <button onClick={() => { if (confirm("¿Resetear todo el avance a valores iniciales?")) setTasks(INITIAL_TASKS.map(migrateTask)); }}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #ddd", background: "white", fontSize: 10, cursor: "pointer", color: "#999", fontWeight: 600 }}>Reset</button>
        </div>
      </div>
      <div style={{ padding: "14px 28px 40px" }}>
        {(() => {
          let cp = null;
          return filtered.map(task => {
            const pi = gph(task.phase);
            const hdr = task.phase !== cp;
            cp = task.phase;
            const isE = exp === task.id;
            const tHL = sumH(task.hoursBy);

            return (
              <div key={task.id}>
                {hdr && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>{pi.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: pi.color }}>{task.phase}</span>
                    <span style={{ fontSize: 11, color: GT.warmGrey }}>({stats.phases.find(p => p.name === task.phase)?.pct || 0}%)</span>
                    <div style={{ flex: 1, height: 1, background: GT.warmGreyLight }} />
                  </div>
                )}
                <div onClick={() => setExp(isE ? null : task.id)}
                  style={{ background: "white", borderRadius: 10, padding: "11px 14px", marginBottom: 3,
                    borderLeft: `3px solid ${isE ? pi.color : "transparent"}`,
                    boxShadow: isE ? `0 3px 12px ${pi.color}12` : "0 1px 2px rgba(0,0,0,.03)", cursor: "pointer", transition: "all .12s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: pi.bg, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 800, color: pi.color, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{task.id}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</div>
                      <div style={{ fontSize: 10, color: "#999", marginTop: 1, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: pi.color }}>{task.hours}h plan</span>
                        {tHL > 0 && <><span style={{ opacity: .3 }}>·</span><span style={{ fontWeight: 600, color: GT.teal }}>{tHL}h real</span></>}
                        {task.notes && task.notes.length > 0 && <span style={{ color: pi.color }}>📝</span>}
                      </div>
                    </div>
                    <Avatars ids={task.responsible} />
                    <div style={{ width: 85, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <DragBar value={task.progress} color={pi.color} onChange={v => updateTask(task.id, { progress: v })} />
                    </div>
                    <div style={{ width: 32, textAlign: "right", fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace",
                      color: task.progress === 100 ? GT.greenDark : task.progress > 0 ? pi.color : GT.warmGrey }}>{task.progress}%</div>
                    <Badge p={task.progress} />
                  </div>

                  {isE && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${pi.bg}` }} onClick={e => e.stopPropagation()}>
                      <div style={{ marginBottom: 14 }}>
                        <label style={lbl}>Responsables</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                          {TEAM.map(m => {
                            const active = task.responsible.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => {
                                if (active) {
                                  const nr = task.responsible.filter(r => r !== m.id);
                                  if (nr.length > 0) { const nb = { ...task.hoursBy }; delete nb[m.id]; updateTask(task.id, { responsible: nr, hoursBy: nb }); }
                                } else updateTask(task.id, { responsible: [...task.responsible, m.id] });
                              }}
                                style={{ padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${active ? m.color : "#ddd"}`,
                                  background: active ? m.color + "12" : "white", fontSize: 11, fontWeight: active ? 700 : 500,
                                  cursor: "pointer", color: active ? m.color : "#999", display: "flex", alignItems: "center", gap: 4, transition: "all .12s" }}>
                                <div style={{ width: 16, height: 16, borderRadius: "50%", background: active ? m.color : GT.warmGrey,
                                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6.5, fontWeight: 800, color: "white" }}>{m.short}</div>
                                {m.name}<span style={{ opacity: .4, fontSize: 9 }}>({m.role})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                        <div>
                          <label style={lbl}>Avance</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                            <div style={{ flex: 1 }}><DragBar value={task.progress} color={pi.color} onChange={v => updateTask(task.id, { progress: v })} h={11} /></div>
                            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: pi.color }}>{task.progress}%</span>
                          </div>
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            {[0, 25, 50, 75, 100].map(v => (
                              <button key={v} onClick={() => updateTask(task.id, { progress: v })}
                                style={{ padding: "3px 10px", borderRadius: 6, border: task.progress === v ? `2px solid ${pi.color}` : `1px solid ${GT.warmGreyLight}`,
                                  background: task.progress === v ? pi.bg : "white", fontSize: 10, fontWeight: 700, cursor: "pointer",
                                  color: task.progress === v ? pi.color : "#999", fontFamily: "'JetBrains Mono',monospace" }}>{v}%</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label style={lbl}>Horas reales por persona</label>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 5 }}>
                            {task.responsible.map(pid => {
                              const m = gtm(pid);
                              const val = task.hoursBy?.[pid] || 0;
                              return (
                                <div key={pid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7,
                                  background: GT.warmGreyBg, border: `1px solid ${GT.warmGreyLight}` }}>
                                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 7, fontWeight: 800, color: "white", flexShrink: 0 }}>{m.short}</div>
                                  <span style={{ fontSize: 10.5, fontWeight: 600, flex: 1 }}>{m.name}</span>
                                  <input type="number" min="0" step="0.5" value={val === 0 ? "" : val} placeholder="0"
                                    onChange={e => updateTask(task.id, { hoursBy: { ...task.hoursBy, [pid]: parseFloat(e.target.value) || 0 } })}
                                    style={{ width: 52, padding: "3px 5px", borderRadius: 5, border: `1px solid ${GT.warmGreyLight}`,
                                      fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", textAlign: "center", background: "white" }} />
                                  <span style={{ fontSize: 9, color: "#999" }}>h</span>
                                </div>
                              );
                            })}
                          </div>
                          {tHL > 0 && task.hours > 0 && (
                            <div style={{ marginTop: 5, fontSize: 10.5, fontWeight: 600, color: tHL > task.hours ? GT.red : GT.greenDark }}>
                              Total: {tHL}h / {task.hours}h plan
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label style={lbl}>Notas / Bloqueantes</label>
                        <textarea value={task.notes} onChange={e => updateTask(task.id, { notes: e.target.value })}
                          placeholder="Avances, bloqueos, dependencias..."
                          style={{ ...inp, minHeight: 48, resize: "vertical" }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </>
  );
}

function HistoryTab({ history }) {
  const cuts = useMemo(
    () => [...history].filter(cut => cut?.date).sort((a, b) => b.date.localeCompare(a.date)),
    [history],
  );
  const latest = cuts[0];
  const previous = cuts[1];
  const latestDelta = latest && previous ? Math.round((latest.global - previous.global) * 10) / 10 : null;
  const pct = value => `${Number(value || 0).toLocaleString("es-CR", { maximumFractionDigits: 1 })}%`;
  const cutDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("es-CR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  if (cuts.length === 0) {
    return (
      <div style={{ padding: "24px 28px 40px", maxWidth: 940 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🕘</div>
          <h2 style={{ margin: "0 0 6px", fontSize: 17, color: GT.purple }}>Todavía no hay cortes históricos</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
            Al cargar o exportar un Excel con la hoja “Histórico avance”, los cortes aparecerán aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px 40px", maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: "0 0 5px", fontSize: 18, color: GT.purple }}>Histórico de avance</h2>
          <p style={{ margin: 0, fontSize: 11, color: "#888", maxWidth: 620, lineHeight: 1.5 }}>
            Cada Excel publicado conserva los cortes anteriores. Si se exporta más de una vez el mismo día, se actualiza ese corte sin duplicarlo.
          </p>
        </div>
        <div style={{ fontSize: 10, color: "#999", padding: "6px 10px", borderRadius: 7, background: "white", border: `1px solid ${GT.warmGreyLight}` }}>
          Fuente oficial: hoja “Histórico avance”
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
        {[
          { label: "Último avance", value: pct(latest.global), detail: cutDate(latest.date), color: GT.purple },
          { label: "Cambio", value: latestDelta === null ? "—" : `${latestDelta > 0 ? "+" : ""}${pct(latestDelta)}`, detail: previous ? "vs. corte anterior" : "primer corte", color: latestDelta >= 0 ? GT.greenDark : GT.red },
          { label: "Cortes registrados", value: cuts.length, detail: "sin sobrescribir el histórico", color: GT.teal },
        ].map(card => (
          <div key={card.label} style={{ background: "white", borderRadius: 12, padding: 15, borderTop: `3px solid ${card.color}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>{card.label}</div>
            <div style={{ fontSize: 25, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: card.color, marginTop: 3 }}>{card.value}</div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{card.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cuts.map((cut, index) => {
          const older = cuts[index + 1];
          const delta = older ? Math.round((cut.global - older.global) * 10) / 10 : null;
          return (
            <div key={`${cut.date}-${index}`} style={{ background: "white", borderRadius: 12, padding: "16px 18px", borderLeft: `4px solid ${index === 0 ? GT.purple : GT.warmGrey}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: GT.black }}>{cutDate(cut.date)}</div>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    {index === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: GT.purple, background: GT.purpleBg, padding: "2px 7px", borderRadius: 4 }}>ÚLTIMO CORTE</span>}
                    {cut.branch && <span style={{ fontSize: 10, color: "#888" }}>Rama: <strong>{cut.branch}</strong></span>}
                    {cut.commit && <span style={{ fontSize: 10, color: "#888", fontFamily: "'JetBrains Mono',monospace" }}>Commit: {cut.commit}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 25, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: index === 0 ? GT.purple : GT.black }}>{pct(cut.global)}</div>
                  <div style={{ fontSize: 10, color: delta === null ? "#aaa" : delta >= 0 ? GT.greenDark : GT.red, fontWeight: 700 }}>
                    {delta === null ? "Punto de partida" : `${delta > 0 ? "+" : ""}${pct(delta)} desde el corte anterior`}
                  </div>
                </div>
              </div>

              <div style={{ height: 7, background: GT.warmGreyLight, borderRadius: 4, overflow: "hidden", margin: "13px 0 12px" }}>
                <div style={{ width: `${Math.max(0, Math.min(100, cut.global))}%`, height: "100%", background: index === 0 ? GT.purple : GT.warmGrey, borderRadius: 4 }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 7 }}>
                {PHASES.map(phase => (
                  <div key={phase.name} style={{ padding: "7px 9px", borderRadius: 8, background: phase.bg, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: phase.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{phase.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: phase.color, fontFamily: "'JetBrains Mono',monospace" }}>{pct(cut.phases?.[phase.name])}</span>
                  </div>
                ))}
              </div>

              {cut.notes && (
                <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${GT.warmGreyLight}`, fontSize: 10.5, lineHeight: 1.5, color: "#777" }}>
                  <strong style={{ color: GT.purple }}>Evidencia:</strong> {cut.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const lbl = { fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 2 };
const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid #E8E5E1`, fontSize: 12, fontFamily: "inherit", background: "#F7F6F4", boxSizing: "border-box", marginTop: 4 };
const sel = { padding: "7px 12px", borderRadius: 8, border: `1px solid #E8E5E1`, fontSize: 12, background: "white" };

// ═══ EJECUTIVO TAB ═══
function EjecTab({ stats, tasks, note, setNote }) {
  return (
    <div style={{ padding: "24px 28px 40px", maxWidth: 940 }}>
      {/* Deadline Gauge */}
      <DeadlineGauge globalPct={stats.global} />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 22 }}>
        {[
          { l: "Avance Global", v: `${stats.global}%`, s: `${Math.round(stats.cH)}h de ${stats.tH}h`, a: GT.purple },
          { l: "Completadas", v: `${stats.done}`, s: `de ${tasks.length} tareas`, a: GT.greenDark },
          { l: "En Progreso", v: `${stats.inP}`, s: "tareas activas", a: GT.orange },
          { l: "Pendientes", v: `${stats.pend}`, s: "por iniciar", a: GT.warmGrey },
          { l: "Horas Reales", v: `${stats.hL}`, s: `de ${stats.tH}h plan`, a: GT.teal },
        ].map((k, i) => (
          <div key={i} style={{ background: "white", borderRadius: 12, padding: "14px 12px", borderTop: `3px solid ${k.a}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>{k.l}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: k.a, marginTop: 3 }}>{k.v}</div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* Phases */}
      <div style={{ background: "white", borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800, color: GT.purple }}>Avance por Fase</h3>
        {stats.phases.map(p => (
          <div key={p.name} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p.bg, border: `1.5px solid ${p.color}`, display: "inline-block" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.name}</span>
                <span style={{ fontSize: 10, color: GT.warmGrey }}>{p.done}/{p.tasks} · {p.hours}h plan{p.hL > 0 && ` · ${p.hL}h real`}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: p.color }}>{p.pct}%</span>
            </div>
            <div style={{ height: 10, background: p.bg, borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${p.pct}%`, height: "100%", background: p.color, borderRadius: 5, transition: "width .5s", opacity: .8 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Active / Done */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, color: GT.teal }}>🔵 En Curso</h3>
          {stats.active.length === 0 ? <div style={{ fontSize: 11, color: GT.warmGrey, padding: 14, textAlign: "center" }}>Registrá avances en la pestaña Avance</div>
          : stats.active.map(t => { const pi = gph(t.phase); const h = sumH(t.hoursBy); return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: `1px solid ${GT.warmGreyBg}` }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: pi.bg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 800, color: pi.color, fontFamily: "'JetBrains Mono',monospace" }}>{t.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: 9.5, color: "#aaa", display: "flex", gap: 3, alignItems: "center" }}>
                  <Avatars ids={t.responsible} size={14} /><span>{t.hours}h{h > 0 && ` · ${h}h real`}</span>
                </div>
              </div>
              <div style={{ width: 40, flexShrink: 0 }}><div style={{ height: 4, background: GT.warmGreyLight, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${t.progress}%`, height: "100%", background: pi.color }} /></div></div>
              <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: pi.color, width: 28, textAlign: "right" }}>{t.progress}%</span>
            </div>
          ); })}
        </div>
        <div style={{ background: "white", borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, color: GT.greenDark }}>✅ Completadas</h3>
          {stats.rd.length === 0 ? <div style={{ fontSize: 11, color: GT.warmGrey, padding: 14, textAlign: "center" }}>Sin completadas aún</div>
          : stats.rd.map(t => { const pi = gph(t.phase); const h = sumH(t.hoursBy); return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: `1px solid ${GT.warmGreyBg}` }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: GT.greenBg, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800, color: GT.greenDark }}>✓</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: 9.5, color: "#aaa", display: "flex", gap: 3, alignItems: "center" }}>
                  <Avatars ids={t.responsible} size={13} /><span>{t.hours}h{h > 0 && ` · ${h}h real`} · {pi.name}</span>
                </div>
              </div>
            </div>
          ); })}
        </div>
      </div>

      {/* Team */}
      <div style={{ background: "white", borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 800, color: GT.purple }}>👥 Equipo</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(195px,1fr))", gap: 10 }}>
          {stats.ms.filter(m => m.tasks > 0).map(m => (
            <div key={m.id} style={{ padding: 12, borderRadius: 10, border: `1px solid ${GT.warmGreyLight}`, background: GT.warmGreyBg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: m.color, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800, color: "white" }}>{m.short}</div>
                <div><div style={{ fontSize: 11.5, fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 9.5, color: "#aaa" }}>{m.role} · {m.ded}</div></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: "#888" }}>{m.tasks} tareas</span>
                <span style={{ fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: m.color }}>{m.pct}%</span>
              </div>
              <div style={{ height: 5, background: GT.warmGreyLight, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ width: `${m.pct}%`, height: "100%", background: m.color, transition: "width .5s" }} />
              </div>
              <div style={{ fontSize: 9.5, color: "#aaa" }}>✅{m.done} · 🔵{m.inP} · ⬜{m.tasks - m.done - m.inP}</div>
              {m.hL > 0 && <div style={{ fontSize: 10, color: m.color, fontWeight: 700, marginTop: 3, fontFamily: "'JetBrains Mono',monospace" }}>{m.hL}h reales</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div style={{ background: "white", borderRadius: 12, padding: 18 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800, color: GT.purple }}>📝 Nota para el Socio</h3>
        <p style={{ fontSize: 10, color: "#999", margin: "0 0 10px" }}>Se guarda automáticamente.</p>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder={"Resumen de avance:\n\n• Logros:\n  -\n\n• Bloqueantes:\n  -\n\n• Próximos pasos:\n  -"}
          style={{ width: "100%", minHeight: 140, padding: 14, borderRadius: 10, border: `1px solid #E8E5E1`, fontSize: 13,
            fontFamily: "inherit", lineHeight: 1.7, resize: "vertical", background: "#F7F6F4", boxSizing: "border-box" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={() => { navigator.clipboard.writeText(note || ""); alert("Copiado al portapapeles"); }}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: GT.purple, color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            📋 Copiar
          </button>
        </div>
      </div>
    </div>
  );
}
