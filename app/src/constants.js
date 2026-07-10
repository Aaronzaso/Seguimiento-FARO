// Grant Thornton Official Brand Colors
export const GT = {
  purple: "#4F2D7F",
  purpleLight: "#6B4A9E",
  purpleBg: "#F3EFF8",
  warmGrey: "#CBC4BC",
  warmGreyLight: "#E8E5E1",
  warmGreyBg: "#F7F6F4",
  teal: "#00A7B5",
  tealBg: "#E5F6F8",
  green: "#9BD732",
  greenDark: "#6B9B1E",
  greenBg: "#F2FAE2",
  orange: "#FF7D1E",
  orangeBg: "#FFF2E8",
  red: "#E92841",
  redBg: "#FDECEE",
  black: "#2D2D2D",
};

// Project deadline
export const PROJECT_START = "2026-03-11";
export const PROJECT_DEADLINE = "2026-11-16";
export const TOTAL_PLAN_HOURS = 1178;

export const PHASES = [
  { name: "Levantamiento", color: GT.teal, bg: GT.tealBg, icon: "📋" },
  { name: "Diseño", color: GT.purple, bg: GT.purpleBg, icon: "✏️" },
  { name: "Desarrollo", color: GT.orange, bg: GT.orangeBg, icon: "⚙️" },
  { name: "Pruebas", color: GT.greenDark, bg: GT.greenBg, icon: "🧪" },
  { name: "Impl. y Transferencia", color: GT.red, bg: GT.redBg, icon: "🚀" },
  { name: "Migración de Datos", color: "#1F6E8C", bg: "#E5F0F4", icon: "💾" },
];

export const TEAM = [
  { id: "luis_m", name: "Luis Montero", role: "DEV", short: "LM", ded: "50%", color: GT.teal },
  { id: "aaron", name: "Aarón Mayorga", role: "DEV", short: "AM", ded: "75%", color: "#0090A0" },
  { id: "luis_ma", name: "Luis Martínez", role: "DEV", short: "LMa", ded: "45%", color: "#2EAFC0" },
  { id: "daniel", name: "Daniel Pulido", role: "ARQ", short: "DP", ded: "30%", color: GT.purple },
  { id: "karol", name: "Karol", role: "AF", short: "K", ded: "30%", color: GT.purpleLight },
  { id: "jorge", name: "Jorge Jiménez", role: "PM", short: "JJ", ded: "40%", color: GT.orange },
  { id: "kenneth", name: "Kenneth", role: "ATI", short: "Ke", ded: "10%", color: "#1F6E8C" },
];

function mk(id, phase, name, hours, responsible, notes, done) {
  return { id, phase, name, hours, progress: done ? 100 : 0, responsible, notes: notes || "", hoursBy: {} };
}

export const INITIAL_TASKS = [
  mk(1,"Levantamiento","Reunión de levantamiento funcional",12,["jorge","luis_m","aaron"]),
  mk(2,"Levantamiento","Elaboración de doc. de requerimientos",18,["luis_m","aaron","karol"]),
  mk(3,"Levantamiento","Sesión de evacuación de dudas",6,["karol","luis_m","jorge"]),
  mk(4,"Diseño","Doc. Diseño de Arquitectura",6,["kenneth","jorge"]),
  mk(5,"Diseño","Documentar Arquitectura lógica",12,["daniel"]),
  mk(6,"Diseño","Documentar Arquitectura física",0,["daniel"],"🟢 Reutilizable",true),
  mk(7,"Diseño","Documentar Pipeline CI/CD",0,["daniel"],"🟢 Reutilizable",true),
  mk(8,"Diseño","Documentar Diseño modular",12,["daniel"]),
  mk(9,"Diseño","Documentar Seguridad en el diseño",6,["daniel"]),
  mk(10,"Diseño","Modelo de datos lógico (BD)",25,["daniel","luis_m","karol","jorge"]),
  mk(11,"Diseño","Diseño de APIs (contratos)",20,["daniel","aaron"]),
  mk(12,"Diseño","Configuración de repositorio",4,["daniel"]),
  mk(13,"Diseño","Config. ambiente de desarrollo",1,["jorge"]),
  mk(14,"Diseño","Config. herramientas y frameworks",8,["daniel","luis_m"]),
  mk(15,"Diseño","Config. ambiente de pruebas",10,["daniel"]),
  mk(16,"Diseño","Automatización CI/CD",5,["daniel","jorge"]),
  mk(17,"Desarrollo","Config. modelo de datos (Tablas, llaves)",28,["daniel","aaron","luis_m"]),
  mk(18,"Desarrollo","Stored Procedures y Funciones",12,["daniel","aaron"]),
  mk(19,"Desarrollo","Implementación de triggers",13,["daniel","luis_m","jorge"]),
  mk(20,"Desarrollo","Implementación de RBAC",17,["daniel","jorge"]),
  mk(21,"Desarrollo","Módulo de Administración",70,["aaron","luis_m","luis_ma","jorge"],"🟠 Optimizado 50%"),
  mk(22,"Desarrollo","Módulo Formulario GTRS",124,["luis_m","aaron","luis_ma"]),
  mk(23,"Desarrollo","Módulo Revisión de GTRS",142,["aaron","luis_m","luis_ma"]),
  mk(24,"Desarrollo","Módulo Portal de Captura",142,["luis_ma","aaron","luis_m"]),
  mk(25,"Desarrollo","Módulo Portal Interno",40,["luis_ma","aaron","luis_m"]),
  mk(26,"Desarrollo","Módulo Formulario Aseguramiento",66,["luis_m","aaron","luis_ma"]),
  mk(27,"Desarrollo","Módulo Revisión Aseguramiento",76,["aaron","luis_m","luis_ma"]),
  mk(28,"Desarrollo","Doc. especificaciones de dev.",51,["luis_m","aaron","luis_ma","jorge"]),
  mk(29,"Pruebas","Plan de pruebas",17,["karol","daniel","luis_m","jorge"]),
  mk(30,"Pruebas","Pruebas UAT Ciclo 1",16,["karol","daniel","luis_m","jorge"]),
  mk(31,"Pruebas","Corrección ciclo 1",26,["daniel","aaron","luis_m"]),
  mk(32,"Pruebas","Pruebas UAT Ciclo 2",8,["karol","daniel","luis_m","jorge"]),
  mk(33,"Impl. y Transferencia","Impl. ambiente productivo",25,["kenneth","daniel","luis_m","jorge"],"🟠 Optimizado"),
  mk(34,"Impl. y Transferencia","Guía de despliegue",0,["daniel","luis_m"],"🟢 Reutilizable",true),
  mk(35,"Impl. y Transferencia","Manual operativo",20,["daniel","luis_m","kenneth"]),
  mk(36,"Impl. y Transferencia","Doc. de estabilización",18,["luis_m","aaron","kenneth"]),
  mk(37,"Migración de Datos","Análisis y Mapeo de Datos (CSV)",14,["luis_m","aaron","karol"]),
  mk(38,"Migración de Datos","Exportación CSV desde SharePoint",8,["karol","kenneth"]),
  mk(39,"Migración de Datos","Script Python: ETL",32,["aaron","luis_m"]),
  mk(40,"Migración de Datos","Revisión por Independencia",12,["karol","luis_m"]),
  mk(41,"Migración de Datos","Carga a Supabase",14,["luis_m","aaron"]),
  mk(42,"Migración de Datos","Migración Archivos PDF",20,["aaron","luis_m"]),
  mk(43,"Migración de Datos","Validación de Integridad",16,["karol","aaron"]),
  mk(44,"Migración de Datos","Doc. Proceso de Migración",6,["luis_m","aaron"]),
];

// Helpers
export const gph = n => PHASES.find(p => p.name === n) || PHASES[0];
export const gtm = id => TEAM.find(t => t.id === id) || TEAM[0];
export const sumH = hb => {
  if (!hb || typeof hb !== "object") return 0;
  return Object.values(hb).reduce((s, v) => s + (parseFloat(v) || 0), 0);
};

export function migrateTask(t) {
  return {
    ...t,
    hoursBy: (t.hoursBy && typeof t.hoursBy === "object") ? t.hoursBy : {},
    responsible: Array.isArray(t.responsible) ? t.responsible : [],
    progress: typeof t.progress === "number" ? t.progress : 0,
    notes: t.notes || "",
  };
}

export function getDeadlineStats() {
  const start = new Date(PROJECT_START);
  const end = new Date(PROJECT_DEADLINE);
  const now = new Date();
  const totalDays = Math.ceil((end - start) / 86400000);
  const elapsed = Math.ceil((now - start) / 86400000);
  const remaining = Math.max(0, Math.ceil((end - now) / 86400000));
  const timePct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
  const isPast = now > end;
  return { totalDays, elapsed, remaining, timePct, isPast, start, end };
}
