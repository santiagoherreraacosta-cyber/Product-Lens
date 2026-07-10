// Unit tests del backend JSON de la persistencia (escritura atómica + serializada).
// Sin DATABASE_URL → siempre usa JSON, así que el test no toca Postgres.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let dir;
let store;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "persist-"));
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_URL; // fuerza backend JSON
  store = await import("../../src/persistence.js");
});

after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

test("save/load round-trip por colección (backend JSON)", async () => {
  await store.save("cycles", [{ id: "c1", title: "Ciclo 1", estado: "activo" }]);
  const loaded = await store.load("cycles");
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].title, "Ciclo 1");
});

test("load de colección inexistente devuelve []", async () => {
  const out = await store.load("patterns");
  assert.deepEqual(out, []);
});

test("la escritura es atómica: no deja archivo .tmp", async () => {
  await store.save("patterns", [{ id: "p1", tipo: "patron" }]);
  const files = await fs.readdir(dir);
  assert.ok(files.includes("patterns.json"));
  assert.ok(!files.some((f) => f.endsWith(".tmp")), "no debe quedar un .tmp");
});

test("escrituras concurrentes a la misma colección no se corrompen", async () => {
  await Promise.all([
    store.save("decisions", [{ id: "d1", texto: "a" }]),
    store.save("decisions", [{ id: "d1", texto: "b" }, { id: "d2", texto: "c" }]),
    store.save("decisions", [{ id: "d3", texto: "d" }]),
  ]);
  const out = await store.load("decisions"); // debe ser un JSON válido (no corrupto)
  assert.ok(Array.isArray(out));
});
