// Phase gate engine (ported from server/src/domain/phaseEngine.ts to plain JS).
// The isMet() checks accept BOTH the generic English shape used by the original
// tests AND the live Spanish cycle schema produced by server.js / app.js
// (cycle.brief.<field>.value/confirmed, cycle.causa = "M"|"A"|"P", etc.), so the
// same engine works for the deployed data model.

const PHASES = ["F0", "F1", "F2", "F3", "F4", "F5"];

const GATE_REQUIREMENTS = {
  F0: [
    { key: "behaviorStatement", message: "Falta el comportamiento objetivo.", isMet: hasBehaviorStatement },
    { key: "quantitativeSignal", message: "Falta la señal cuantitativa.", isMet: hasQuantitativeSignal },
    { key: "segment", message: "Falta el segmento (cohorte conductual, ej. 'inactivos 30d').", isMet: hasSegment },
  ],
  F1: [
    { key: "sources", message: "Faltan al menos 2 fuentes de evidencia.", isMet: hasAtLeastTwoSources },
    { key: "bmapCause", message: "Falta confirmar la causa B=MAP (Motivación, Ability o Prompt) — la sugerida por la IA no basta.", isMet: hasBmapCause },
  ],
  F2: [
    { key: "intervention", message: "Falta la intervención.", isMet: hasIntervention },
    { key: "falsifiableHypothesis", message: "Falta la hipótesis falsable.", isMet: hasFalsifiableHypothesis },
  ],
  F3: [
    { key: "metric", message: "Falta la métrica de éxito.", isMet: hasMetric },
    { key: "outcomeMetric", message: "Marca la métrica primaria como outcome (no actividad) — el éxito no es adopción.", isMet: hasOutcomeMetric },
    { key: "sizeAndDuration", message: "Falta tamaño de muestra / duración.", isMet: hasSizeAndDuration },
    { key: "stopCriteria", message: "Falta el criterio de stop.", isMet: hasStopCriteria },
  ],
  F4: [{ key: "trackingConfirmed", message: "Falta confirmar el tracking.", isMet: hasTrackingConfirmed }],
  F5: [
    { key: "decision", message: "Falta la decisión de cierre.", isMet: hasDecision },
    { key: "namedPattern", message: "Falta nombrar el patrón.", isMet: hasNamedPattern },
  ],
};

export function getCurrentPhase(cycle) {
  const phase = cycle.fase_actual ?? cycle.currentPhase ?? cycle.activePhase ?? cycle.phase;
  return isPhase(phase) ? phase : "F0";
}

export function canClosePhase(cycle, phase) {
  return getMissingGateRequirements(cycle, phase).length === 0;
}

// Returns { key, message }[] of unmet requirements for the given phase.
export function getMissingGateRequirements(cycle, phase) {
  assertPhase(phase);
  return GATE_REQUIREMENTS[phase]
    .filter((req) => !req.isMet(cycle))
    .map((req) => ({ key: req.key, message: req.message }));
}

// Returns ALL requirements for the phase with their met status — drives the
// in-chat phase guide checklist (A1).
export function getGateRequirements(cycle, phase) {
  assertPhase(phase);
  return GATE_REQUIREMENTS[phase].map((req) => ({ key: req.key, message: req.message, met: req.isMet(cycle) }));
}

export function acceptRisk(cycle, phase, riskText, actor = {}) {
  assertPhase(phase);
  if (!String(riskText ?? "").trim()) throw new Error("Risk text is required.");
  const risk = {
    id: `${phase}-risk-${(cycle.risks ?? []).length + 1}`,
    phase,
    text: String(riskText).trim(),
    acceptedBy: actor,
    acceptedAt: new Date().toISOString(),
  };
  return { ...cycle, risks: [...(cycle.risks ?? []), risk] };
}

// --- Gate predicates (support generic + live schema) ---
const briefField = (cycle, name) => cycle.brief?.[name];
const briefHasValue = (cycle, name) => hasText(briefField(cycle, name)?.value);

function hasBehaviorStatement(cycle) {
  return hasText(cycle.behaviorStatement) || hasText(cycle.behavior?.statement) || briefHasValue(cycle, "behavior_statement");
}

function hasQuantitativeSignal(cycle) {
  return hasText(cycle.quantitativeSignal) || hasText(cycle.quantSignal) || briefHasValue(cycle, "senal_cuantitativa");
}

// Segmento = cohorte conductual (≠ sub-perfil/arquetipo). Doctrina §4, gate F0.
function hasSegment(cycle) {
  return hasText(cycle.segment) || hasText(cycle.segmento_objetivo);
}

function hasAtLeastTwoSources(cycle) {
  const generic = cycle.sources ?? cycle.evidence?.sources;
  if (Array.isArray(generic) && generic.filter(Boolean).length >= 2) return true;
  // Live schema: both sources must be present AND confirmed by the PM — an
  // auto-suggested [CONFIRMAR] value is an assumption, not evidence.
  const confirmed = (name) => {
    const f = cycle.brief?.[name];
    return !!(f && hasText(f.value) && f.confirmed);
  };
  return confirmed("evidencia_primaria") && confirmed("segunda_fuente");
}

function hasBmapCause(cycle) {
  const generic = cycle.cause ?? cycle.diagnosis?.cause ?? cycle.bmapCause;
  if (["Motivation", "Ability", "Prompt"].includes(String(generic ?? ""))) return true;
  // Live schema: the cause must be a valid B=MAP value AND confirmed by the
  // human (propose→confirm). An LLM-suggested cause is a hypothesis, not a
  // diagnosis — symmetric with hasAtLeastTwoSources requiring confirmed evidence.
  const isBmap = ["M", "A", "P"].includes(String(cycle.causa ?? ""));
  const confirmed = cycle.causa_source === "pm_confirmed" || cycle.brief?.causa?.confirmed === true;
  return isBmap && confirmed;
}

function hasIntervention(cycle) {
  return hasText(cycle.intervention) || briefHasValue(cycle, "intervencion");
}

function hasFalsifiableHypothesis(cycle) {
  return hasText(cycle.falsifiableHypothesis) || hasText(cycle.hypothesis?.falsifiable) || briefHasValue(cycle, "hipotesis");
}

function hasMetric(cycle) {
  return hasText(cycle.metric) || briefHasValue(cycle, "senal_cuantitativa") || hasText(cycle.experiment?.metrica_primaria?.value);
}

function hasSizeAndDuration(cycle) {
  if (hasText(cycle.sizeAndDuration) || (hasText(cycle.size) && hasText(cycle.duration))) return true;
  return hasText(cycle.experiment?.tamano_muestra?.value) && hasText(cycle.experiment?.duracion?.value);
}

// 2D - honestidad: la métrica primaria debe declararse como outcome (no
// actividad). Doctrina §4 gate F3. Sin declarar → pendiente (asesora).
function hasOutcomeMetric(cycle) {
  return cycle.experiment?.metrica_tipo === "outcome" || cycle.metricType === "outcome";
}

function hasStopCriteria(cycle) {
  return hasText(cycle.stopCriteria) || hasText(cycle.experiment?.criterio_stop?.value);
}

function hasTrackingConfirmed(cycle) {
  if (cycle.trackingConfirmed === true) return true;
  const t = cycle.experiment?.tracking_eventos;
  return Array.isArray(t) ? t.length > 0 : hasText(t?.value);
}

function hasDecision(cycle) {
  return hasText(cycle.decision) || hasText(cycle.resultado_cierre) || hasText(cycle.cierre?.decision);
}

function hasNamedPattern(cycle) {
  return hasText(cycle.namedPattern) || hasText(cycle.patternName) || hasText(cycle.cierre?.pattern_id);
}

function hasText(value) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function isPhase(value) {
  return typeof value === "string" && PHASES.includes(value);
}

function assertPhase(value) {
  if (!isPhase(value)) throw new Error(`Unknown phase: ${String(value)}.`);
}

export { PHASES };
