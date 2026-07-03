// Unit tests for the pure helpers of contextStore (B1 · table docs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTable, withPendingCount } from "../../src/contextStore.js";

test("normalizeTable sanitizes a valid table and trims extra cells", () => {
  const t = normalizeTable({ columns: ["A", "B"], rows: [["1", "2", "extra"], [3, null]] });
  assert.deepEqual(t, { columns: ["A", "B"], rows: [["1", "2"], ["3", ""]] });
});

test("normalizeTable rejects invalid shapes", () => {
  assert.equal(normalizeTable(null), null);
  assert.equal(normalizeTable({}), null);
  assert.equal(normalizeTable({ columns: [], rows: [["x"]] }), null);
  assert.equal(normalizeTable({ columns: ["A"], rows: "no" }), null);
});

test("withPendingCount counts [CONFIRMAR] across title, content and table cells", () => {
  const doc = {
    title: "Doc [CONFIRMAR]",
    content: "texto [CONFIRMAR: dato]",
    table: { columns: ["Nivel"], rows: [["[CONFIRMAR: métrica]"], ["ok"]] },
  };
  assert.equal(withPendingCount(doc).pendingCount, 3);
});

test("withPendingCount works without a table", () => {
  assert.equal(withPendingCount({ title: "t", content: "sin pendientes" }).pendingCount, 0);
});
