// Capa de persistencia con backend intercambiable (JSON en Volume ↔ Postgres),
// elegido por DATABASE_URL. Objetivos:
//  - Escritura ATÓMICA en JSON (write a .tmp + rename) → sin corrupción por crash.
//  - Escrituras serializadas por colección → sin carreras entre `void persist...()`.
//  - Postgres opcional (cycles/patterns/decisions) con AUTO-IMPORT de los JSON
//    existentes la primera vez, y FALLBACK a JSON si Postgres falla (nunca cae).
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const HAS_PG = !!process.env.DATABASE_URL;

// Archivo JSON por colección (backend de archivo / fallback).
const FILES = {
  cycles: "cycles.json",
  patterns: "patterns.json",
  audit_events: "audit_events.json",
  decisions: "decisions.json",
};

// Colecciones que viven en Postgres cuando hay DATABASE_URL. Cada fila = id +
// columnas extraídas para consultar + `data` JSONB con el objeto completo (sin
// pérdida). audit_events se queda en JSON (append-heavy) por ahora.
const PG_TABLES = {
  cycles: {
    table: "cycles",
    extract: (c) => ({
      title: c.title ?? null,
      estado: c.estado ?? null,
      fase_actual: c.fase_actual ?? c.activePhase ?? null,
      causa: c.causa ?? null,
      sub_perfil: c.sub_perfil ?? null,
      updated_at: c.updatedAt ?? null,
    }),
  },
  patterns: {
    table: "patterns",
    extract: (p) => ({ tipo: p.tipo ?? null, causa: p.causa ?? null, sub_perfil: p.sub_perfil ?? null, transicion: p.transicion ?? null, test_elegido: p.test_elegido ?? null }),
  },
  decisions: {
    table: "decisions",
    extract: (d) => ({ cycle_id: d.cycleId ?? null, fecha: d.fecha ?? null, tipo: d.tipo ?? null, causa: d.causa ?? null, sub_perfil: d.sub_perfil ?? null, texto: d.texto ?? null, actor: d.actor ?? null }),
  },
};

let pool = null;
let pgReady = false;

// --- JSON backend (atómico + serializado) ---
const writeChains = new Map();
function queueWrite(file, fn) {
  const prev = writeChains.get(file) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeChains.set(file, next.catch(() => {}));
  return next;
}

async function jsonLoad(name) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, FILES[name]), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`No se pudo cargar ${name}:`, err.message);
    return [];
  }
}

async function jsonSave(name, arr) {
  const file = path.join(DATA_DIR, FILES[name]);
  return queueWrite(file, async () => {
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(arr, null, 2));
    await fs.rename(tmp, file); // rename es atómico en el mismo filesystem
  });
}

// --- Postgres backend ---
const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY, title TEXT, estado TEXT, fase_actual TEXT, causa TEXT,
  sub_perfil TEXT, updated_at TIMESTAMPTZ, data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY, tipo TEXT, causa TEXT, sub_perfil TEXT, transicion TEXT, test_elegido TEXT, data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, cycle_id TEXT, fecha TIMESTAMPTZ, tipo TEXT, causa TEXT,
  sub_perfil TEXT, texto TEXT, actor TEXT, data JSONB NOT NULL
);
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS test_elegido TEXT;
CREATE INDEX IF NOT EXISTS idx_cycles_estado ON cycles(estado);
CREATE INDEX IF NOT EXISTS idx_patterns_causa_sub ON patterns(causa, sub_perfil);
CREATE INDEX IF NOT EXISTS idx_patterns_test ON patterns(test_elegido);
CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(cycle_id);
`;

// Embeddings para búsqueda semántica (M3). Se intenta aparte: si la imagen de
// Postgres no trae pgvector, se omite sin tumbar el resto de la persistencia.
const VECTOR_SCHEMA = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL,
  content TEXT NOT NULL, embedding vector(1536)
);
`;

function pgSsl() {
  const url = process.env.DATABASE_URL || "";
  if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes(".railway.internal")) return false;
  return { rejectUnauthorized: false };
}

async function ensureSchema() {
  await pool.query(CORE_SCHEMA);
  try {
    await pool.query(VECTOR_SCHEMA);
  } catch (err) {
    console.warn("pgvector no disponible (búsqueda semántica M3 pospuesta):", err.message);
  }
}

async function pgLoad(name) {
  const { table } = PG_TABLES[name];
  const { rows } = await pool.query(`SELECT data FROM ${table}`);
  return rows.map((r) => r.data);
}

async function pgSave(name, arr) {
  const cfg = PG_TABLES[name];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of arr) {
      const ex = cfg.extract(item);
      const cols = ["id", ...Object.keys(ex), "data"];
      const values = [item.id, ...Object.values(ex), JSON.stringify(item)];
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const updates = cols.slice(1).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
      await client.query(
        `INSERT INTO ${cfg.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (id) DO UPDATE SET ${updates}`,
        values,
      );
    }
    const ids = arr.map((x) => x.id);
    if (ids.length) await client.query(`DELETE FROM ${cfg.table} WHERE id <> ALL($1::text[])`, [ids]);
    else await client.query(`DELETE FROM ${cfg.table}`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// --- API pública ---
// Inicializa el backend. Si hay DATABASE_URL: conecta, crea el schema y auto-importa
// los JSON existentes (una vez, si las tablas están vacías). Si algo falla → JSON.
export async function initStore() {
  if (!HAS_PG) return { backend: "json" };
  try {
    const pg = await import("pg");
    const Pool = pg.default?.Pool ?? pg.Pool;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: pgSsl() });
    await ensureSchema();
    for (const name of Object.keys(PG_TABLES)) {
      const existing = await pgLoad(name);
      if (existing.length === 0) {
        const fromJson = await jsonLoad(name);
        if (fromJson.length) {
          await pgSave(name, fromJson);
          console.log(`Importados ${fromJson.length} ${name}: JSON → Postgres`);
        }
      }
    }
    pgReady = true;
    return { backend: "postgres" };
  } catch (err) {
    console.error("Init de Postgres falló, usando JSON como respaldo:", err.message);
    pgReady = false;
    return { backend: "json-fallback" };
  }
}

export async function load(name) {
  if (pgReady && PG_TABLES[name]) {
    try { return await pgLoad(name); }
    catch (err) { console.error(`pgLoad ${name} falló, leyendo JSON:`, err.message); }
  }
  return jsonLoad(name);
}

export async function save(name, arr) {
  if (pgReady && PG_TABLES[name]) {
    try { return await pgSave(name, arr); }
    catch (err) { console.error(`pgSave ${name} falló, escribiendo JSON:`, err.message); }
  }
  return jsonSave(name, arr);
}

export function backendInfo() {
  return { hasPg: HAS_PG, pgReady };
}
