// Core cycle logic extracted from server.js so it can be unit-tested in
// isolation (B7 — closes the "untested core logic" debt). These functions are
// pure: no I/O, no globals.

// Recursively merges `source` into `target`. Plain objects merge key-by-key;
// arrays and primitives replace. This is what fixes the brief-wipe bug: a
// partial PATCH of `brief.<field>` no longer wipes sibling brief fields.
export function deepMerge(target, source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...(target && typeof target === "object" && !Array.isArray(target) ? target : {}) };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv)) {
      out[key] = deepMerge(out[key], sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

// --- F0 behavior validation (Fase 2) ---
// Heuristic: reject titles framed as a solution/feature instead of a behavior.
export const FEATURE_TERMS = [
  "construir", "crear", "agregar", "añadir", "implementar", "desarrollar", "lanzar",
  "botón", "boton", "pantalla", "wizard", "modal", "banner", "popup", "feature",
  "funcionalidad", "onboarding", "dashboard", "notificación", "notificacion",
  "rediseñar", "rediseno", "integrar", "flujo nuevo", "nueva sección", "nueva seccion",
];

export function looksLikeFeature(title) {
  const t = String(title || "").toLowerCase();
  return FEATURE_TERMS.some((term) => t.includes(term));
}

export const BRIEF_FIELD_KEYS = ["behavior_statement", "evidencia_primaria", "segunda_fuente", "hipotesis", "senal_cuantitativa"];
export const CYCLE_TOP_KEYS = ["sub_perfil", "transicion", "causa"];

// Applies LLM-extracted brief updates without ever overriding user-confirmed
// fields or existing top-level cycle values. Returns { cycle, changed }.
export function applyBriefUpdates(cycle, updates) {
  if (!updates || typeof updates !== "object") return { cycle, changed: [] };
  const brief = { ...(cycle.brief ?? {}) };
  const changed = [];
  for (const key of BRIEF_FIELD_KEYS) {
    const val = updates[key];
    if (typeof val !== "string" || !val.trim()) continue;
    if (brief[key]?.confirmed) continue; // never override a user-confirmed field
    brief[key] = { value: val.trim(), confirmed: false, source: "llm_suggested" };
    changed.push(`brief.${key}`);
  }
  const patch = { brief };
  for (const key of CYCLE_TOP_KEYS) {
    const val = updates[key];
    if (typeof val !== "string" || !val.trim()) continue;
    if (cycle[key]) continue; // don't override an existing top-level value
    patch[key] = val.trim();
    if (key === "causa") patch.causa_source = "llm_suggested";
    changed.push(key);
  }
  return { cycle: { ...cycle, ...patch }, changed };
}
