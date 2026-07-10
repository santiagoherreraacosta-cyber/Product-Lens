#!/usr/bin/env node
// Migra los JSON del Volume a Postgres. En realidad `initStore()` ya auto-importa
// al arrancar (si las tablas están vacías); este script es el disparador manual
// —correlo dentro de Railway donde DATABASE_URL y el Volume son alcanzables:
//   railway run node scripts/migrate-json-to-pg.mjs
import { initStore, backendInfo } from "../src/persistence.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no está seteada. Nada que migrar (backend = JSON).");
  process.exit(1);
}

const info = await initStore();
console.log("Backend:", info.backend, backendInfo());
if (info.backend === "postgres") {
  console.log("✅ Migración/auto-import completado (o ya estaba en Postgres).");
  process.exit(0);
} else {
  console.error("❌ No se pudo inicializar Postgres. Revisa DATABASE_URL / conectividad. Se quedó en JSON.");
  process.exit(2);
}
