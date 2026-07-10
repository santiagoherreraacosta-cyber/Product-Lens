// Unit tests for the context assembler (PR-M1 · Contexto total).
import assert from "node:assert/strict";
import { test } from "node:test";
import { patternDigest, cyclesIndex, assembleSystemContext } from "../../src/memory.js";

test("patternDigest renders one line per pattern with tipo/causa/sub-perfil/aprendizaje", () => {
  const out = patternDigest([
    { tipo: "patron", causa: "A", sub_perfil: "rebuscador_digital", transicion: "aha_habit", nombre: "Checklist 72h", aprendizaje: "El default sube recompra", delta_metrica: "+21pp", veces_reutilizado: 4 },
    { tipo: "anti_patron", causa: "M", sub_perfil: "empleado_aspirante", nombre: "Badge motivacional", aprendizaje: "Subir motivación no movió nada" },
  ]);
  assert.match(out, /\[PATRÓN\]/);
  assert.match(out, /\[ANTI-PATRÓN\]/);
  assert.match(out, /Checklist 72h/);
  assert.match(out, /\+21pp/);
  assert.match(out, /usado 4×/);
  assert.match(out, /Motivación/); // causa M label
});

test("patternDigest handles the empty library", () => {
  assert.match(patternDigest([]), /Aún no hay patrones/);
});

test("cyclesIndex lists other cycles and excludes the active one", () => {
  const cycles = [
    { id: "a", title: "Recompra día 7", fase_actual: "F1", causa: "M", estado: "activo" },
    { id: "b", title: "Activación post-Aha", activePhase: "F5", causa: "A", estado: "cerrado", resultado_cierre: "escalado" },
  ];
  const out = cyclesIndex(cycles, "a");
  assert.doesNotMatch(out, /Recompra día 7/); // active excluded
  assert.match(out, /Activación post-Aha/);
  assert.match(out, /cerrado → escalado/);
});

test("assembleSystemContext orders blocks stable→volatile and caches the stable prefix", async () => {
  const blocks = await assembleSystemContext({
    systemPrompt: "MÉTODO ESTÁTICO",
    cycle: { id: "z", title: "Ciclo Z", fase_actual: "F1", causa: "A", brief: {} },
    patterns: [{ tipo: "patron", causa: "A", nombre: "P1", aprendizaje: "x" }],
    cycles: [{ id: "z", title: "Ciclo Z" }, { id: "y", title: "Otro" }],
    businessContext: "NEGOCIO DROPI", // injected → no disk read
  });
  // Block 0 = método; block 1 = negocio (cacheado); último = memoria volátil.
  assert.equal(blocks[0].text, "MÉTODO ESTÁTICO");
  assert.match(blocks[1].text, /CONTEXTO DE NEGOCIO/);
  assert.deepEqual(blocks[1].cache_control, { type: "ephemeral" });
  const memoria = blocks[blocks.length - 1].text;
  assert.match(memoria, /MEMORIA DEL EQUIPO/);
  assert.match(memoria, /"P1"/);
  assert.match(memoria, /OTROS CICLOS/);
  assert.match(memoria, /Otro/);
  assert.match(memoria, /CICLO ACTIVO/);
});

test("assembleSystemContext caches block 0 when there is no business context", async () => {
  const blocks = await assembleSystemContext({ systemPrompt: "M", businessContext: "" });
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
});
