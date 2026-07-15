// Constantes derivadas de docs/doctrina-lente.md (fuente única de verdad).
// Si esto y la doctrina divergen, gana la doctrina y este archivo se corrige.
// Usado por server.js, app.js (vía import) y el seed.

// --- Fases (vocabulario español canónico, único en schema/UI/prompt) ---
export const PHASES = ["F0", "F1", "F2", "F3", "F4", "F5"];
export const FASE_LABEL = {
  F0: "Detección",
  F1: "Diagnóstico",
  F2: "Intervención",
  F3: "Validar",
  F4: "Build / Spec",
  F5: "Aprendizaje",
};
// Alias de compatibilidad: "Experimento"/"Despliegue" eran los nombres de F3/F4
// antes de este cierre del E2E del lente. Ceban el salto directo a A/B y a
// borrar el spec conductual, respectivamente — ver docs/doctrina-lente.md §4.
export const FASE_LABEL_LEGACY_ALIASES = { Experimento: "F3", Despliegue: "F4" };
export function normalizeFaseLabel(label) {
  return FASE_LABEL_LEGACY_ALIASES[label] ? FASE_LABEL[FASE_LABEL_LEGACY_ALIASES[label]] : label;
}

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

// --- Sub-perfiles: Niveles de dropshipper (nombres oficiales de Comercial, §3.1) ---
// 6 niveles por volumen de órdenes mensuales (+ sin_clasificar). Reemplaza los 3
// arquetipos psicográficos anteriores (Rebuscador Digital/Empleado Aspirante/Joven
// Visionario) — el eje pasa de "quién es" a "en qué escalón de volumen está".
export const SUB_PERFILES = ["bienvenido", "explorador", "master", "experto", "sabio_vip", "leyenda", "sin_clasificar"];
export const SUB_PERFIL_LABEL = {
  bienvenido: "Bienvenido",
  explorador: "Explorador",
  master: "Master",
  experto: "Experto",
  sabio_vip: "Sabio VIP",
  leyenda: "Leyenda",
  sin_clasificar: "Sin clasificar",
};
export const SUB_PERFIL_ORDERS = {
  bienvenido: "0 – 100",
  explorador: "101 – 1.000",
  master: "1.001 – 2.500",
  experto: "2.501 – 5.000",
  sabio_vip: "5.001 – 20.000",
  leyenda: "20.001+",
};
export const SUB_PERFIL_DESC = {
  bienvenido: "Nuevo en la plataforma, en proceso de activación.",
  explorador: "Primeras ventas sostenidas, aprendiendo operación.",
  master: "Operador establecido, flujo de ventas estable.",
  experto: "Alto volumen, empieza a optimizar procesos.",
  sabio_vip: "Vendedor consolidado, referente del ecosistema.",
  leyenda: "Élite del ecosistema Dropi.",
};

// --- Decisión de cierre (F5) → tipo de patrón derivado ---
export const DECISIONS = ["escalar", "matar", "iterar"];
export function patternTypeFromDecision(decision) {
  if (decision === "matar") return "anti_patron";
  if (decision === "escalar") return "patron";
  return null; // iterar no cierra en patrón; otros → sin derivar
}

// Helpers de normalización (devuelven la key canónica o null).
// Aceptan alias: labels con espacios/tildes/mayúsculas ("Sabio VIP"),
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

// --- F1: sesgo específico (tras clasificar M o A) — cada uno con su antídoto ---
export const SESGOS = ["present_bias", "choice_overload", "ambiguedad", "status_quo", "loss_aversion"];
export const SESGO_LABEL = {
  present_bias: "Present bias (acercar la recompensa)",
  choice_overload: "Choice overload (reducir opciones / default)",
  ambiguedad: "Ambigüedad (mostrar resultado esperado con evidencia)",
  status_quo: "Status quo (hacer del comportamiento nuevo el default)",
  loss_aversion: "Loss aversion (enmarcar en lo que se pierde)",
};
export function normalizeSesgo(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return SESGOS.includes(s) ? s : null;
}

// --- F3: tipo de supuesto + escalera de validación (§8, más barato primero) ---
export const TIPOS_SUPUESTO = ["deseabilidad", "factibilidad", "viabilidad"];
export function normalizeTipoSupuesto(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return TIPOS_SUPUESTO.includes(s) ? s : null;
}

export const TEST_ESCALERA = [
  "pre_mortem", "expert_review", "guerrilla_5u", "wizard_of_oz",
  "concierge", "n1_sced", "fake_door", "ab",
];
export const TEST_ELEGIDO_LABEL = {
  pre_mortem: "Pre-Mortem",
  expert_review: "Expert Review",
  guerrilla_5u: "Guerrilla (5 usuarios)",
  wizard_of_oz: "Wizard of Oz",
  concierge: "Concierge MVP",
  n1_sced: "N=1 SCED",
  fake_door: "Fake Door",
  ab: "A/B",
};
export function normalizeTestElegido(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return TEST_ESCALERA.includes(s) ? s : null;
}
// Nivel mínimo por doctrina para afirmar causalidad de mecanismo (§4.1).
export const UMBRAL_CAUSALIDAD_DEFAULT = "wizard_of_oz";
// true si `test` está en o por encima de `umbral` en la escalera (más barato → más caro).
export function testCumpleUmbral(test, umbral = UMBRAL_CAUSALIDAD_DEFAULT) {
  const ti = TEST_ESCALERA.indexOf(normalizeTestElegido(test));
  const ui = TEST_ESCALERA.indexOf(normalizeTestElegido(umbral) ?? UMBRAL_CAUSALIDAD_DEFAULT);
  return ti >= 0 && ui >= 0 && ti >= ui;
}

// --- F3: decisión post-experimento (distinta de la decisión de cierre F5) ---
export const DECISIONS_F3 = ["avanzar_f4", "re_diagnosticar", "matar"];
export function normalizeDecisionF3(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return DECISIONS_F3.includes(s) ? s : null;
}
