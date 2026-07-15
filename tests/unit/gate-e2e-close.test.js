// Tests for the "cerrar el E2E del lente" changes: F2/F3/F4 gates now require
// the structured fields the doctrina §4.1 introduced (SDT checks, escalera de
// validación, spec conductual) instead of accepting free-form LLM prose.
import assert from "node:assert";
import { test } from "node:test";
import { getMissingGateRequirements } from "../../src/phaseEngine.js";
import { normalizeSesgo, normalizeTestElegido, testCumpleUmbral, normalizeFaseLabel, FASE_LABEL } from "../../src/doctrina.js";

const keys = (cycle, phase) => getMissingGateRequirements(cycle, phase).map((r) => r.key);

function baseF2Cycle(extra = {}) {
  return {
    fase_actual: "F2",
    brief: {
      intervencion: { value: "checklist post-compra" },
      hipotesis: { value: "si agregamos X, sube Y" },
    },
    ...extra,
  };
}

test("F2 gate: falta cualquiera de los 3 checks SDT bloquea el gate (asesora, no bloquea)", () => {
  const cycle = baseF2Cycle();
  const missing = keys(cycle, "F2");
  assert.ok(missing.includes("sdtAutonomia"));
  assert.ok(missing.includes("sdtMastery"));
  assert.ok(missing.includes("sdtRelatedness"));
});

test("F2 gate: los 3 checks SDT marcados + brief completo → gate cumplido", () => {
  const cycle = baseF2Cycle({
    brief: {
      intervencion: { value: "checklist post-compra" },
      hipotesis: { value: "si agregamos X, sube Y" },
      sdt: {
        autonomia: { check: true, nota: "el seller elige cuándo" },
        mastery: { check: true, nota: "no genera dependencia" },
        relatedness: { check: true, nota: "conecta con la tribu" },
      },
    },
  });
  assert.deepStrictEqual(keys(cycle, "F2"), []);
});

test("F2 gate: un check sin marcar (solo nota) NO cuenta como cumplido", () => {
  const cycle = baseF2Cycle({
    brief: {
      intervencion: { value: "x" },
      hipotesis: { value: "y" },
      sdt: { autonomia: { check: false, nota: "algo" }, mastery: { check: true }, relatedness: { check: true } },
    },
  });
  assert.ok(keys(cycle, "F2").includes("sdtAutonomia"));
});

function baseF3Cycle(extra = {}) {
  return { fase_actual: "F3", experiment: {}, ...extra };
}

test("F3 gate: sin supuesto_mas_riesgoso ni test_elegido, faltan ambos y la causalidad", () => {
  const missing = keys(baseF3Cycle(), "F3");
  assert.ok(missing.includes("supuestoMasRiesgoso"));
  assert.ok(missing.includes("testElegido"));
  assert.ok(missing.includes("causalidadValidada"));
});

test("F3 gate: A/B ya NO es el default — sus campos no aparecen si test_elegido no es 'ab'", () => {
  const cycle = baseF3Cycle({
    experiment: { supuesto_mas_riesgoso: "el seller confía en el checklist", test_elegido: "wizard_of_oz" },
  });
  const missing = keys(cycle, "F3");
  assert.ok(!missing.includes("metric"));
  assert.ok(!missing.includes("sizeAndDuration"));
  assert.ok(!missing.includes("stopCriteria"));
  assert.ok(!missing.includes("outcomeMetric"));
});

test("F3 gate: con test_elegido='wizard_of_oz' (>= umbral) y supuesto declarado, el gate se cumple", () => {
  const cycle = baseF3Cycle({
    experiment: { supuesto_mas_riesgoso: "el seller confía en el checklist", test_elegido: "wizard_of_oz" },
  });
  assert.deepStrictEqual(keys(cycle, "F3"), []);
});

test("F3 gate: un test por debajo de Wizard of Oz (ej. guerrilla_5u) NO valida causalidad", () => {
  const cycle = baseF3Cycle({
    experiment: { supuesto_mas_riesgoso: "x", test_elegido: "guerrilla_5u" },
  });
  assert.ok(keys(cycle, "F3").includes("causalidadValidada"));
});

test("F3 gate: cuando test_elegido='ab', SÍ se exigen métrica/tamaño/duración/stop/outcome", () => {
  const cycle = baseF3Cycle({
    experiment: { supuesto_mas_riesgoso: "x", test_elegido: "ab" },
  });
  const missing = keys(cycle, "F3");
  assert.ok(missing.includes("metric"));
  assert.ok(missing.includes("sizeAndDuration"));
  assert.ok(missing.includes("stopCriteria"));
  assert.ok(missing.includes("outcomeMetric"));
});

test("F3 gate: 'ab' con todos los campos A/B completos + causalidad (ab está al tope de la escalera) → gate cumplido", () => {
  const cycle = baseF3Cycle({
    experiment: {
      supuesto_mas_riesgoso: "x", test_elegido: "ab",
      metrica_primaria: { value: "conversión" }, metrica_tipo: "outcome",
      tamano_muestra: { value: "200" }, duracion: { value: "14 dias" }, criterio_stop: { value: "14 dias" },
    },
  });
  assert.deepStrictEqual(keys(cycle, "F3"), []);
});

test("F3 gate: un umbral_causalidad explícito por debajo de wizard_of_oz permite un test más barato", () => {
  const cycle = baseF3Cycle({
    experiment: { supuesto_mas_riesgoso: "x", test_elegido: "guerrilla_5u", umbral_causalidad: "guerrilla_5u" },
  });
  assert.ok(!keys(cycle, "F3").includes("causalidadValidada"));
});

function baseF4Cycle(extra = {}) {
  return { fase_actual: "F4", experiment: { tracking_eventos: ["evento_x"] }, ...extra };
}

test("F4 gate: sin spec_conductual, falta 'specConductual'", () => {
  assert.ok(keys(baseF4Cycle(), "F4").includes("specConductual"));
});

test("F4 gate: un loop incompleto (solo trigger) NO cumple el gate — el handoff a tech no puede ser parcial", () => {
  const cycle = baseF4Cycle({
    spec_conductual: {
      comportamiento_objetivo: "configura el 2º envío en 72h",
      loop_completo: { trigger: "push" },
      criterio_exito_conductual: "el seller configuró el 2º envío",
    },
  });
  assert.ok(keys(cycle, "F4").includes("specConductual"));
});

test("F4 gate: spec_conductual completo (comportamiento + loop + criterio) cumple el gate", () => {
  const cycle = baseF4Cycle({
    spec_conductual: {
      comportamiento_objetivo: "configura el 2º envío en 72h",
      loop_completo: { trigger: "push", action: "clic", reward: "confirmación visual", investment: "guarda preferencia" },
      criterio_exito_conductual: "el seller configuró el 2º envío, no solo abrió la app",
    },
  });
  assert.deepStrictEqual(keys(cycle, "F4"), []);
});

test("doctrina: normalizeSesgo acepta solo el enum cerrado", () => {
  assert.strictEqual(normalizeSesgo("present_bias"), "present_bias");
  assert.strictEqual(normalizeSesgo("PRESENT_BIAS"), "present_bias");
  assert.strictEqual(normalizeSesgo("inventado"), null);
});

test("doctrina: normalizeTestElegido + testCumpleUmbral respetan el orden de la escalera", () => {
  assert.strictEqual(normalizeTestElegido("Wizard_Of_Oz"), "wizard_of_oz");
  assert.strictEqual(testCumpleUmbral("ab"), true);
  assert.strictEqual(testCumpleUmbral("pre_mortem"), false);
  assert.strictEqual(testCumpleUmbral("fake_door", "guerrilla_5u"), true);
  assert.strictEqual(testCumpleUmbral("expert_review", "guerrilla_5u"), false);
});

test("doctrina: normalizeFaseLabel mapea los nombres viejos (Experimento/Despliegue) a los nuevos", () => {
  assert.strictEqual(normalizeFaseLabel("Experimento"), FASE_LABEL.F3);
  assert.strictEqual(normalizeFaseLabel("Despliegue"), FASE_LABEL.F4);
  assert.strictEqual(normalizeFaseLabel("Diagnóstico"), "Diagnóstico");
});
