// Tests del engine real (src/phaseEngine.js) sobre el schema vivo en español.
// Cubre el rigor de gates de la doctrina: F1 exige causa B=MAP CONFIRMADA por
// humano + ≥2 fuentes confirmadas (Ola 1 · decisión 3).
import assert from "node:assert/strict";
import { test } from "node:test";
import { getMissingGateRequirements } from "../../src/phaseEngine.js";

const confirmed = (value) => ({ value, confirmed: true });

function baseF1Cycle(extra = {}) {
  return {
    fase_actual: "F1",
    brief: {
      evidencia_primaria: confirmed("Cohorte 30d, n=412"),
      segunda_fuente: confirmed("Entrevistas, n=12"),
    },
    ...extra,
  };
}

const keys = (cycle, phase) => getMissingGateRequirements(cycle, phase).map((r) => r.key);

test("F1: causa M/A/P sin confirmar NO cumple el gate (sigue faltando bmapCause)", () => {
  const cycle = baseF1Cycle({ causa: "A", causa_source: "llm_suggested" });
  assert.ok(keys(cycle, "F1").includes("bmapCause"));
});

test("F1: causa confirmada por el humano (pm_confirmed) + 2 fuentes → gate completo", () => {
  const cycle = baseF1Cycle({ causa: "A", causa_source: "pm_confirmed" });
  assert.deepEqual(getMissingGateRequirements(cycle, "F1"), []);
});

test("F1: causa confirmada vía brief.causa.confirmed también cuenta", () => {
  const cycle = baseF1Cycle({ causa: "M", brief: { ...baseF1Cycle().brief, causa: confirmed("M") } });
  assert.ok(!keys(cycle, "F1").includes("bmapCause"));
});

test("F1: con causa confirmada pero solo 1 fuente → falta 'sources', no 'bmapCause'", () => {
  const cycle = {
    fase_actual: "F1",
    causa: "P",
    causa_source: "pm_confirmed",
    brief: { evidencia_primaria: confirmed("solo una") },
  };
  const missing = keys(cycle, "F1");
  assert.ok(missing.includes("sources"));
  assert.ok(!missing.includes("bmapCause"));
});
