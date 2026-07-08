// Constantes derivadas de docs/doctrina-lente.md (fuente única de verdad).
// Si esto y la doctrina divergen, gana la doctrina y este archivo se corrige.
// Usado por server.js, app.js (vía import) y el seed.

// --- Fases (vocabulario español canónico, único en schema/UI/prompt) ---
export const PHASES = ["F0", "F1", "F2", "F3", "F4", "F5"];
export const FASE_LABEL = {
  F0: "Detección",
  F1: "Diagnóstico",
  F2: "Intervención",
  F3: "Experimento",
  F4: "Despliegue",
  F5: "Aprendizaje",
};

// --- B=MAP (causa primaria) ---
export const CAUSA = ["M", "A", "P"];
export const CAUSA_LABEL = { M: "Motivación", A: "Ability", P: "Prompt" };
export const CAUSA_COLOR = { M: "#8B5CF6", A: "#3B82F6", P: "#14B8A6" };
// Sub-causa secundaria (opcional, lista cerrada 3×3; NO maneja el filtro).
export const SUB_CAUSA = {
  M: ["motivacion", "confianza", "incentivo"],
  A: ["claridad", "capacidad", "friccion"],
  P: ["timing", "visibilidad", "ausencia"],
};
export const SUB_CAUSA_LABEL = {
  motivacion: "Motivación (no ve el valor)",
  confianza: "Confianza (no se fía)",
  incentivo: "Incentivo (no compensa)",
  claridad: "Claridad (no entiende qué/cómo)",
  capacidad: "Capacidad (no tiene skill/recurso)",
  friccion: "Fricción (el flujo cuesta)",
  timing: "Timing (momento equivocado)",
  visibilidad: "Visibilidad (no lo nota)",
  ausencia: "Ausencia (no hay trigger)",
};
// Normaliza una sub-causa validando que pertenezca al bucket de la causa dada.
// Sin causa válida, o sub-causa fuera del bucket → null (se descarta).
export function normalizeSubCausa(value, causa) {
  const c = normalizeCausa(causa);
  if (!c) return null;
  const v = String(value ?? "").trim().toLowerCase();
  return (SUB_CAUSA[c] ?? []).includes(v) ? v : null;
}

// --- Escala cognitiva (5 niveles) + transiciones válidas (pares adyacentes) ---
export const COGNITIVE_LEVELS = ["setup", "aha", "habit", "engaged", "principalidad"];
export const COGNITIVE_LABEL = {
  setup: "Setup",
  aha: "Aha",
  habit: "Habit",
  engaged: "Engaged",
  principalidad: "Principalidad",
};
export const TRANSITIONS = ["setup_aha", "aha_habit", "habit_engaged", "engaged_principalidad"];

// --- Sub-perfiles (3 arquetipos canónicos + sin clasificar) ---
export const SUB_PERFILES = ["rebuscador_digital", "empleado_aspirante", "joven_visionario", "sin_clasificar"];
export const SUB_PERFIL_LABEL = {
  rebuscador_digital: "Rebuscador Digital",
  empleado_aspirante: "Empleado Aspirante",
  joven_visionario: "Joven Visionario",
  sin_clasificar: "Sin clasificar",
};

// --- Decisión de cierre (F5) → tipo de patrón derivado ---
export const DECISIONS = ["escalar", "matar", "iterar"];
export function patternTypeFromDecision(decision) {
  if (decision === "matar") return "anti_patron";
  if (decision === "escalar") return "patron";
  return null; // iterar no cierra en patrón; otros → sin derivar
}

// Helpers de normalización (devuelven la key canónica o null).
// Aceptan alias: labels con espacios/tildes/mayúsculas ("Rebuscador Digital"),
// formatos viejos ("Setup_Aha", "Aha_Habito"). Un valor no mapeable → null;
// el gate lo pedirá (asesora, no bloquea) — nunca un 400 duro.
const slug = (v) => String(v ?? "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\s→>-]+/g, "_");

const TRANSITION_ALIASES = {
  setup_aha: "setup_aha",
  aha_habit: "aha_habit",
  aha_habito: "aha_habit",
  habit_engaged: "habit_engaged",
  habito_engaged: "habit_engaged",
  engaged_principalidad: "engaged_principalidad",
};

export function normalizeSubPerfil(v) {
  const s = slug(v);
  return SUB_PERFILES.includes(s) ? s : null;
}
export function normalizeTransition(v) {
  return TRANSITION_ALIASES[slug(v)] ?? null;
}
export function normalizeCausa(v) {
  const s = String(v ?? "").trim().toUpperCase();
  return CAUSA.includes(s) ? s : null;
}

// Labels de display: "setup_aha" → "Setup → Aha".
export function transitionLabel(t) {
  const key = TRANSITION_ALIASES[slug(t)];
  if (!key) return t ?? "";
  const cut = key.indexOf("_");
  const from = key.slice(0, cut);
  const to = key.slice(cut + 1);
  return `${COGNITIVE_LABEL[from] ?? from} → ${COGNITIVE_LABEL[to] ?? to}`;
}
export function subPerfilLabel(sp) {
  return SUB_PERFIL_LABEL[normalizeSubPerfil(sp)] ?? (sp ?? "");
}
