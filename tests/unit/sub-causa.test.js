// Sub-causa (doctrina §1): opcional, validada contra el bucket de la causa.
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSubCausa } from "../../src/doctrina.js";
import { applyBriefUpdates } from "../../src/cycleLogic.js";

test("normalizeSubCausa acepta solo sub-causas del bucket de la causa", () => {
  assert.equal(normalizeSubCausa("friccion", "A"), "friccion");
  assert.equal(normalizeSubCausa("Friccion", "A"), "friccion"); // case-insensitive
  assert.equal(normalizeSubCausa("friccion", "M"), null);       // fuera del bucket
  assert.equal(normalizeSubCausa("timing", "P"), "timing");
  assert.equal(normalizeSubCausa("inexistente", "A"), null);
  assert.equal(normalizeSubCausa("friccion", null), null);      // sin causa
});

test("applyBriefUpdates guarda sub_causa solo si pertenece a la causa sugerida", () => {
  const r1 = applyBriefUpdates({ brief: {} }, { causa: "A", sub_causa: "friccion" });
  assert.equal(r1.cycle.sub_causa, "friccion");
  assert.ok(r1.changed.includes("sub_causa"));

  const r2 = applyBriefUpdates({ brief: {} }, { causa: "M", sub_causa: "friccion" });
  assert.equal(r2.cycle.sub_causa, undefined); // fuera del bucket → descartada

  const r3 = applyBriefUpdates({ brief: {}, causa: "P" }, { sub_causa: "timing" });
  assert.equal(r3.cycle.sub_causa, "timing"); // usa la causa existente
});

test("applyBriefUpdates no pisa una sub_causa ya existente", () => {
  const r = applyBriefUpdates({ brief: {}, causa: "A", sub_causa: "claridad" }, { sub_causa: "friccion" });
  assert.equal(r.cycle.sub_causa, "claridad");
});
