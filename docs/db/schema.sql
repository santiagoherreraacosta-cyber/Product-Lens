-- Schema de persistencia (Postgres) del Product Lens.
-- NOTA: la app APLICA este schema automáticamente al arrancar con DATABASE_URL
-- (ver src/persistence.js → CORE_SCHEMA / VECTOR_SCHEMA). Este archivo documenta
-- la forma real. Modelo pragmático "documento en Postgres": una fila por entidad
-- con columnas extraídas para consultar + `data` JSONB con el objeto completo
-- (mapea 1:1 con el modelo en memoria del server, migración sin pérdida).

-- Ciclos de decisión (F0–F5): brief, experimento, mensajes y riesgos viven en `data`.
CREATE TABLE IF NOT EXISTS cycles (
  id           TEXT PRIMARY KEY,
  title        TEXT,
  estado       TEXT,           -- activo | cerrado | descartado
  fase_actual  TEXT,           -- F0..F5
  causa        TEXT,           -- M | A | P
  sub_perfil   TEXT,
  updated_at   TIMESTAMPTZ,
  data         JSONB NOT NULL
);

-- Memoria del equipo: patrones y anti-patrones destilados al cerrar ciclos.
CREATE TABLE IF NOT EXISTS patterns (
  id          TEXT PRIMARY KEY,
  tipo        TEXT,            -- patron | anti_patron
  causa       TEXT,
  sub_perfil  TEXT,
  transicion  TEXT,
  data        JSONB NOT NULL
);

-- Ledger de decisiones y aprendizajes durables (PR-M2: captura estructurada).
CREATE TABLE IF NOT EXISTS decisions (
  id          TEXT PRIMARY KEY,
  cycle_id    TEXT,
  fecha       TIMESTAMPTZ,
  tipo        TEXT,            -- decision | aprendizaje | supuesto_validado | supuesto_invalidado
  causa       TEXT,
  sub_perfil  TEXT,
  texto       TEXT,
  actor       TEXT,
  data        JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cycles_estado ON cycles(estado);
CREATE INDEX IF NOT EXISTS idx_patterns_causa_sub ON patterns(causa, sub_perfil);
CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(cycle_id);

-- Búsqueda semántica de la memoria (PR-M3). Requiere pgvector; si la imagen no lo
-- trae, la app omite esta parte y sigue funcionando (search semántico pospuesto).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS memory_embeddings (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,    -- pattern | decision | cycle
  ref_id     TEXT NOT NULL,
  content    TEXT NOT NULL,
  embedding  vector(1536)
);

-- audit_events y context_documents permanecen en JSON sobre el Volume por ahora
-- (curados / append-heavy). Migración de esos: follow-up.
