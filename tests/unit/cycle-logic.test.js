// Unit tests for the extracted core cycle logic (B7).
import assert from "node:assert/strict";
import { test } from "node:test";
import { deepMerge, looksLikeFeature, applyBriefUpdates, resolveRisk } from "../../src/cycleLogic.js";

test("deepMerge merges nested objects without wiping sibling keys (brief-wipe fix)", () => {
  const cycle = { brief: { a: { value: "1", confirmed: true }, b: { value: "2" } } };
  const patch = { brief: { a: { confirmed: false } } };
  const merged = deepMerge(cycle, patch);
  // Sibling b survives; a is merged, not replaced.
  assert.deepEqual(merged.brief.b, { value: "2" });
  assert.equal(merged.brief.a.value, "1");
  assert.equal(merged.brief.a.confirmed, false);
});

test("deepMerge replaces arrays and primitives wholesale", () => {
  assert.deepEqual(deepMerge({ tags: [1, 2, 3] }, { tags: [9] }), { tags: [9] });
  assert.equal(deepMerge({ x: 1 }, 5), 5);
  assert.equal(deepMerge({ x: 1 }, null), null);
});

test("deepMerge does not mutate the original target", () => {
  const target = { brief: { a: { value: "1" } } };
  deepMerge(target, { brief: { a: { value: "2" } } });
  assert.equal(target.brief.a.value, "1");
});

test("looksLikeFeature flags solution/feature framing", () => {
  assert.equal(looksLikeFeature("Construir un nuevo dashboard de envíos"), true);
  assert.equal(looksLikeFeature("Agregar un banner de onboarding"), true);
});

test("looksLikeFeature accepts behavior statements", () => {
  assert.equal(looksLikeFeature("El seller no configura su 2º envío en 72h"), false);
  assert.equal(looksLikeFeature(""), false);
  assert.equal(looksLikeFeature(null), false);
});

test("applyBriefUpdates fills empty brief fields as unconfirmed suggestions", () => {
  const { cycle, changed } = applyBriefUpdates({ brief: {} }, { behavior_statement: "  hace X  " });
  assert.deepEqual(cycle.brief.behavior_statement, { value: "hace X", confirmed: false, source: "llm_suggested" });
  assert.deepEqual(changed, ["brief.behavior_statement"]);
});

test("applyBriefUpdates never overrides a user-confirmed field", () => {
  const base = { brief: { behavior_statement: { value: "original", confirmed: true } } };
  const { cycle, changed } = applyBriefUpdates(base, { behavior_statement: "nuevo" });
  assert.equal(cycle.brief.behavior_statement.value, "original");
  assert.deepEqual(changed, []);
});

test("applyBriefUpdates sets top-level causa + source and skips existing top-level values", () => {
  const { cycle, changed } = applyBriefUpdates({ brief: {}, sub_perfil: "Ya existe" }, { causa: "A", sub_perfil: "Otro" });
  assert.equal(cycle.causa, "A");
  assert.equal(cycle.causa_source, "llm_suggested");
  assert.equal(cycle.sub_perfil, "Ya existe");
  assert.ok(changed.includes("causa"));
  assert.ok(!changed.includes("sub_perfil"));
});

test("applyBriefUpdates tolerates missing updates", () => {
  const base = { brief: { x: { value: "1" } } };
  const { cycle, changed } = applyBriefUpdates(base, null);
  assert.equal(cycle, base);
  assert.deepEqual(changed, []);
});

test("resolveRisk marks the matching risk resolved without touching others", () => {
  const base = {
    riskAccepted: true,
    risks: [
      { id: "r1", phase: "F1", text: "1 sola fuente", resolvedAt: null },
      { id: "r2", phase: "F3", text: "peeking", resolvedAt: null },
    ],
  };
  const { cycle, found } = resolveRisk(base, "r1", { id: "u1", name: "pm@dropi.co" }, "2026-01-01T00:00:00.000Z");
  assert.equal(found, true);
  assert.equal(cycle.risks[0].resolvedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(cycle.risks[0].resolvedBy, { id: "u1", name: "pm@dropi.co" });
  // r2 untouched
  assert.equal(cycle.risks[1].resolvedAt, null);
  // r2 still open -> riskAccepted stays true (Home card badge must stay accurate)
  assert.equal(cycle.riskAccepted, true);
});

test("resolveRisk clears riskAccepted once the last open risk is resolved", () => {
  const base = { riskAccepted: true, risks: [{ id: "r1", phase: "F1", text: "1 sola fuente", resolvedAt: null }] };
  const { cycle } = resolveRisk(base, "r1", { id: "u1" }, "2026-01-01T00:00:00.000Z");
  assert.equal(cycle.riskAccepted, false);
});

test("resolveRisk returns found:false for an unknown riskId, cycle unchanged", () => {
  const base = { risks: [{ id: "r1", phase: "F1", text: "x" }] };
  const { cycle, found } = resolveRisk(base, "does-not-exist");
  assert.equal(found, false);
  assert.equal(cycle, base);
});

test("resolveRisk on a cycle with no risks returns found:false", () => {
  const { found } = resolveRisk({}, "r1");
  assert.equal(found, false);
});
