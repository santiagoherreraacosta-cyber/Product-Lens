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

// Helpers de validación (devuelven el valor saneado o null).
export function normalizeSubPerfil(v) {
  return SUB_PERFILES.includes(v) ? v : null;
}
export function normalizeTransition(v) {
  return TRANSITIONS.includes(v) ? v : null;
}
export function normalizeCausa(v) {
  return CAUSA.includes(v) ? v : null;
}
