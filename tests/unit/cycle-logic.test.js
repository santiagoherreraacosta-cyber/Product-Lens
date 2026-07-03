// Unit tests for the extracted core cycle logic (B7).
import assert from "node:assert/strict";
import { test } from "node:test";
import { deepMerge, looksLikeFeature, applyBriefUpdates } from "../../src/cycleLogic.js";

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
