// BUG-1 FIX: Unified server.js merging PRs #12 (JWT/auth/audit) + #14 (CORS/rate-limit/validation)
// + #20 (pattern CRUD) + #11 (context API) + original static serving.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getContextDocuments, updateContextDocument } from "./src/contextStore.js";
import { assembleSystemContext } from "./src/memory.js";
import { initStore, load as storeLoad, save as storeSave } from "./src/persistence.js";
import { getMissingGateRequirements, getGateRequirements, acceptRisk, PHASES } from "./src/phaseEngine.js";
import { deepMerge, looksLikeFeature, applyBriefUpdates, resolveRisk } from "./src/cycleLogic.js";
import { patternTypeFromDecision, FASE_LABEL, PHASES as DOCTRINE_PHASES, normalizeSubPerfil, normalizeTransition, normalizeSubCausa, TRANSITIONS, SUB_CAUSA, normalizeTestElegido } from "./src/doctrina.js";

// Default phase seed (stepper UI) with canonical Spanish labels from the doctrine.
// `startPhase` supports cold-start (doctrina §4): a cycle can be created
// directly in F3 (Validar) when there's no prior diagnosis — e.g. a new
// feature with no historical data, straight to Fake Door / Wizard of Oz.
// Phases before `startPhase` are marked "skipped" (not "done" — they were
// never actually walked), so the risk trail stays honest.
const defaultPhases = (startPhase = "F0") => {
  const startIdx = Math.max(0, DOCTRINE_PHASES.indexOf(startPhase));
  return DOCTRINE_PHASES.map((key, i) => ({
    key,
    label: FASE_LABEL[key],
    state: i === startIdx ? "active" : "todo",
    ...(i < startIdx ? { skipped: true, note: "cold-start: ciclo arrancó en " + startPhase } : {}),
  }));
};

const PORT = process.env.PORT || 8000;
const ROOT = process.cwd();
// Persistence dir. Override with DATA_DIR to point at a Railway persistent
// volume (e.g. DATA_DIR=/data) so cycles/patterns survive redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:8000,http://localhost:3000").split(",").map((s) => s.trim());
const MAX_BODY_BYTES = 512 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// --- In-memory stores ---
const cycles = new Map();
const rateBuckets = new Map();
let auditEvents = [];
let patterns = [];
let decisions = []; // PR-M2 · ledger durable de decisiones y aprendizajes
let systemPrompt = "";

// Seed DATA_DIR from the bundled data/ on first boot. When DATA_DIR points at a
// fresh persistent volume it starts empty; copy any missing seed files (esp.
// context_documents.json, which the context store requires) so the app is
// functional immediately and then persists across redeploys.
async function seedDataDir() {
  const bundled = path.join(ROOT, "data");
  if (path.resolve(DATA_DIR) === path.resolve(bundled)) return; // no volume override
  const seedFiles = ["context_documents.json", "cycles.json", "patterns.json", "audit_events.json"];
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    for (const name of seedFiles) {
      const dest = path.join(DATA_DIR, name);
      try {
        await fs.access(dest);
      } catch {
        try {
          await fs.copyFile(path.join(bundled, name), dest);
          console.log(`Seeded ${name} into DATA_DIR`);
        } catch (err) {
          if (err.code !== "ENOENT") console.warn(`Could not seed ${name}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.warn("Could not seed DATA_DIR:", err.message);
  }
}

// Load persisted data at startup, via the persistence layer (JSON o Postgres,
// según DATABASE_URL). seedDataDir sigue sembrando los JSON del Volume (incluye
// context_documents) y sirve de fuente para el auto-import a Postgres.
async function loadData() {
  await seedDataDir();
  const info = await initStore();
  console.log("Persistencia:", info.backend);
  try {
    auditEvents = await storeLoad("audit_events");
    patterns = await storeLoad("patterns");
    decisions = await storeLoad("decisions");
    (await storeLoad("cycles")).forEach((c) => cycles.set(c.id, c));
  } catch (err) {
    console.warn("Could not load persisted data:", err.message);
  }
  try {
    systemPrompt = await fs.readFile(path.join(ROOT, "00_Orquestador.md"), "utf8");
  } catch {
    systemPrompt = "Eres Dropi, un asistente de producto experto en metodología B=MAP.";
  }
}

async function persistAuditEvents() {
  try {
    await storeSave("audit_events", auditEvents);
  } catch (err) {
    console.warn("Could not persist audit_events:", err.message);
  }
}

async function persistPatterns() {
  try {
    await storeSave("patterns", patterns);
  } catch (err) {
    console.warn("Could not persist patterns:", err.message);
  }
}

async function persistDecisions() {
  try {
    await storeSave("decisions", decisions);
  } catch (err) {
    console.warn("Could not persist decisions:", err.message);
  }
}

// PR-M2 · registra una entrada en el ledger durable (captura estructurada).
// El LLM no escribe libre: solo el cierre de ciclo (auto) y el PM (manual) llaman aquí.
function recordDecision({ cycleId = null, tipo = "aprendizaje", causa = null, sub_perfil = null, texto, actor = null }) {
  const entry = {
    id: `dec-${crypto.randomUUID()}`,
    cycleId,
    fecha: new Date().toISOString(),
    tipo,
    causa,
    sub_perfil,
    texto: String(texto ?? "").trim(),
    actor,
  };
  decisions.push(entry);
  void persistDecisions();
  return entry;
}

async function persistCycles() {
  try {
    await storeSave("cycles", Array.from(cycles.values()));
  } catch (err) {
    console.warn("Could not persist cycles.json:", err.message);
  }
}

// Deep-merge plain objects (arrays and scalars from source override target).
// Used by PATCH /api/cycles/:id so partial brief/experiment updates don't wipe
// sibling fields (journey coherence hotfix).
// --- LLM structured extraction (Fase 1) ---
// After a chat turn, ask the model to extract Intervention Brief fields from the
// conversation as a forced tool call, returning the LIVE cycle schema directly.
// Only fields the model can infer are returned; the rest are omitted.
const BRIEF_EXTRACTION_TOOL = {
  name: "update_brief",
  description:
    "Extrae campos del Intervention Brief a partir de la conversación de producto (metodología B=MAP). " +
    "Devuelve SOLO los campos que se puedan inferir con evidencia de la conversación; omite los que no.",
  input_schema: {
    type: "object",
    properties: {
      behavior_statement: { type: "string", description: "Comportamiento objetivo: quién hace qué, cuándo, y no hace qué hoy." },
      // sub_perfil NO es un campo extraíble: doctrina §3 prohíbe la auto-sugerencia
      // por texto (el eje es volumen de órdenes/mes, no algo que se infiera de la
      // conversación) — el PM lo elige a mano en el <select> del Brief.
      transicion: { type: "string", enum: TRANSITIONS, description: "Transición cognitiva objetivo (par adyacente de la escala de 5 niveles)." },
      segmento_objetivo: { type: "string", description: "Segmento: cohorte conductual concreta (ej. 'sellers inactivos 30d', 'registrados sin 1ª orden en 7d'). NO es el arquetipo." },
      causa: { type: "string", enum: ["M", "A", "P"], description: "Causa B=MAP: M=Motivación, A=Ability, P=Prompt." },
      sub_causa: { type: "string", enum: [...SUB_CAUSA.M, ...SUB_CAUSA.A, ...SUB_CAUSA.P], description: "Sub-causa opcional que refina la causa (debe pertenecer al bucket de la causa): M=motivacion/confianza/incentivo · A=claridad/capacidad/friccion · P=timing/visibilidad/ausencia." },
      evidencia_primaria: { type: "string", description: "Evidencia cuantitativa primaria del comportamiento." },
      segunda_fuente: { type: "string", description: "Segunda fuente de evidencia (triangulación)." },
      intervencion: { type: "string", description: "La intervención: el cambio mínimo diseñado para atacar la causa confirmada (F2)." },
      hipotesis: { type: "string", description: "Hipótesis de intervención falsable." },
      senal_cuantitativa: { type: "string", description: "Métrica de éxito / señal cuantitativa objetivo." },
    },
  },
};

async function extractBriefUpdates(apiKey, model, cycle, userMessage, reply) {
  try {
    const context = JSON.stringify({
      fase: cycle.fase_actual ?? cycle.activePhase,
      brief_actual: cycle.brief ?? {},
      sub_perfil: cycle.sub_perfil, transicion: cycle.transicion, causa: cycle.causa,
    });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        tools: [BRIEF_EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: "update_brief" },
        messages: [{
          role: "user",
          content:
            `Contexto del ciclo:\n${context}\n\n` +
            `Último turno de la conversación:\nUsuario: ${userMessage}\nAsistente: ${reply}\n\n` +
            `Extrae los campos del brief que se puedan inferir con evidencia. No inventes.`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const toolUse = (data.content ?? []).find((b) => b.type === "tool_use");
    return toolUse?.input ?? null;
  } catch (err) {
    console.warn("Brief extraction failed:", err.message);
    return null;
  }
}

// Resumen ejecutivo (F5): se genera UNA vez al cerrar el ciclo, con el
// contexto completo (comportamiento, causa, hipótesis, experimento, decisión,
// aprendizaje) — no un mock. Sin ANTHROPIC_API_KEY, se omite (null) y la UI
// lo trata como [CONFIRMAR], nunca inventa el texto localmente.
async function generateExecutiveSummary(apiKey, model, cycle, closeMeta) {
  try {
    const b = cycle.brief ?? {};
    const context = JSON.stringify({
      titulo: cycle.title,
      comportamiento: b.behavior_statement?.value ?? null,
      segmento: cycle.segmento_objetivo ?? null,
      sub_perfil: cycle.sub_perfil ?? null,
      causa: cycle.causa ?? null,
      evidencia: [b.evidencia_primaria?.value, b.segunda_fuente?.value].filter(Boolean),
      intervencion: b.intervencion?.value ?? null,
      hipotesis: b.hipotesis?.value ?? null,
      experimento: cycle.experiment ?? null,
      decision: closeMeta.decision,
      aprendizaje: closeMeta.learning,
      delta_metrica: closeMeta.delta,
    });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{
          role: "user",
          content:
            "Escribe un resumen ejecutivo de 4 a 6 frases para este ciclo de producto cerrado " +
            "(metodología B=MAP), en español, dirigido a un stakeholder que no participó en el " +
            "ciclo. Prosa corrida, sin bullets ni encabezados. Cubre: qué comportamiento se " +
            "atacó y en quién, por qué no ocurría (causa), qué se probó, qué resultó y qué se " +
            "decidió. No inventes datos que no estén en el contexto.\n\n" +
            `Datos del ciclo:\n${context}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content ?? []).find((b2) => b2.type === "text")?.text?.trim();
    return text || null;
  } catch (err) {
    console.warn("Executive summary generation failed:", err.message);
    return null;
  }
}

// --- Chat helpers shared by /api/chat and /api/chat/stream (B3) ---
function anthropicHeaders(apiKey) {
  return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
}

// Conversation history (last 20 messages) + full layered context (PR-M1): método
// + contexto de negocio + memoria del equipo (patrones) + portafolio de ciclos +
// ciclo activo. `system` is an array of blocks (prompt caching on the stable prefix).
async function buildChatContext(cycle) {
  const history = (cycle?.messages ?? []).slice(-20).map((m) => ({ role: m.role, content: m.content }));
  const system = await assembleSystemContext({
    systemPrompt,
    cycle,
    patterns,
    cycles: Array.from(cycles.values()),
    decisions,
  });
  return { history, system };
}

// Extracts the text delta from one SSE data line, or null when the line is
// not a text_delta event (malformed lines are ignored).
function extractTextDelta(line) {
  if (!line.startsWith("data: ")) return null;
  try {
    const evt = JSON.parse(line.slice(6));
    const isTextDelta = evt.type === "content_block_delta" && evt.delta?.type === "text_delta";
    return isTextDelta ? (evt.delta.text || null) : null;
  } catch {
    return null;
  }
}

// Parses an Anthropic streaming (SSE) response body and yields text deltas.
async function* anthropicTextDeltas(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const rawEvent = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of rawEvent.split("\n")) {
        const text = extractTextDelta(line);
        if (text) yield text;
      }
    }
  }
}

// Persist the chat turn on the cycle + run structured brief extraction (Fase 1).
async function persistChatTurn({ cycle, cycleId, message, reply, apiKey, actor }) {
  if (!cycle) return { updatedCycle: null, extractionChanged: [] };
  const now = new Date().toISOString();
  const msgs = cycle.messages ?? [];
  msgs.push({ id: crypto.randomUUID(), role: "user", content: message, fase: cycle.fase_actual ?? cycle.activePhase, created_at: now });
  msgs.push({ id: crypto.randomUUID(), role: "assistant", content: reply, fase: cycle.fase_actual ?? cycle.activePhase, created_at: now });
  let next = { ...cycle, messages: msgs, last_activity_at: now };

  let extractionChanged = [];
  if (apiKey) {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    const updates = await extractBriefUpdates(apiKey, model, next, message, reply);
    const applied = applyBriefUpdates(next, updates);
    next = { ...applied.cycle };
    extractionChanged = applied.changed;
  }
  next = { ...next, updatedAt: now };

  cycles.set(cycleId, next);
  void persistCycles();
  if (extractionChanged.length) logAudit(actor || "anon", "brief_extracted", cycleId, { fields: extractionChanged });
  return { updatedCycle: next, extractionChanged };
}

// --- JWT (HMAC-SHA256, no external deps) ---
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const sig = b64url(crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = b64url(crypto.createHmac("sha256", AUTH_SECRET).update(`${parts[0]}.${parts[1]}`).digest());
  try {
    const expBuf = Buffer.from(expected);
    const actBuf = Buffer.from(parts[2]);
    if (expBuf.length !== actBuf.length) return null;
    if (!crypto.timingSafeEqual(expBuf, actBuf)) return null;
  } catch { return null; }
  try { return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")); } catch { return null; }
}

// --- Users (demo in-memory; replace with DB in production) ---
// Passwords loaded from env vars. Each hash uses a random 16-byte salt (S2053: unpredictable salts).
// Format stored: "<saltHex>:<hashHex>" so salt travels with the hash.
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = crypto.scryptSync(password, salt, 64);
  const actual = Buffer.from(hashHex, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function makeUser(id, emailEnv, emailDefault, passwordEnv, role) {
  const password = process.env[passwordEnv];
  if (!password) return null; // login disabled when env var not set
  return { id, email: process.env[emailEnv] || emailDefault, passwordHash: hashPassword(password), role };
}

// Herramienta de un solo usuario: un login que hace todo (rol "admin").
const USERS = [
  makeUser("u1", "ADMIN_EMAIL", "admin@dropi.co", "ADMIN_PASSWORD", "admin"),
].filter(Boolean);

function findUser(email, password) {
  const user = USERS.find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

// --- Route permissions ---
// null = public (no token required); array = allowed roles; undefined = default-deny
// Herramienta de un solo usuario: null = público; AUTH = requiere sesión válida
// (el único rol es "admin", que hace todo). Sin escalas de rol.
const AUTH = ["admin"];
const routePermissions = {
  "GET /api/auth/me": AUTH,
  "POST /api/auth/login": null,
  // Context: lectura pública; escritura requiere sesión
  "GET /api/context": null,
  "PATCH /api/context": AUTH,
  // Chat: público (aplica rate limiting)
  "POST /api/chat": null,
  "POST /api/chat/stream": null,
  // Health check: público
  "GET /health": null,
  "GET /api/cycles": AUTH,
  "POST /api/cycles": AUTH,
  "PATCH /api/cycles": AUTH,
  "PUT /api/cycles": AUTH,
  "DELETE /api/cycles": AUTH,
  "GET /api/patterns": AUTH,
  "POST /api/patterns": AUTH,
  "PATCH /api/patterns": AUTH,
  "POST /api/patterns/reuse": AUTH,
  "GET /api/audit-events": AUTH,
  "GET /api/analytics": AUTH,
  "GET /api/analytics/drill": AUTH,
  "POST /api/analytics/event": AUTH,
  "GET /api/decisions": AUTH,
  "POST /api/decisions": AUTH,
};

function getRouteKey(method, pathname) {
  if (pathname.startsWith("/api/cycles/")) return `${method} /api/cycles`;
  if (pathname.startsWith("/api/context/")) return `${method} /api/context`;
  if (pathname.startsWith("/api/patterns/")) return `${method} /api/patterns`;
  return `${method} ${pathname}`;
}

// --- Rate limiting ---
function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + RATE_LIMIT_WINDOW_MS; }
  bucket.count++;
  rateBuckets.set(ip, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
}

// --- Audit logging ---
function logAudit(actor, action, resource, meta = {}) {
  const event = { id: `evt-${crypto.randomUUID()}`, actor, action, resource, meta, timestamp: new Date().toISOString() };
  auditEvents.push(event);
  if (auditEvents.length > 10000) auditEvents = auditEvents.slice(-10000);
  // Fire-and-forget: explicitly void to satisfy linters
  void persistAuditEvents();
  return event;
}

// --- HTTP helpers ---
function cors(res, origin) {
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

function json(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("Payload too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

// --- Security headers (B7) ---
// CSP allows self + Google Fonts (used by the SPA) and inline styles/scripts
// (the app sets inline style attributes and ships small inline handlers /
// printable-export windows). connect-src is self-only: the browser never talks
// to the LLM directly — all model calls go through the server.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
function securityHeaders(res) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}


// 2D - no-peeking: parsea la duracion declarada ("14 dias", "14d", "2 semanas")
// a milisegundos; null si no es parseable (entonces no se puede evaluar peeking).
function parseDurationMs(duracion) {
  const raw = typeof duracion === "string" ? duracion : duracion?.value;
  if (typeof raw !== "string") return null;
  const m = raw.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(dias?|d\b|semanas?|sem\b|horas?|h\b)?/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ?? "d";
  const DAY = 24 * 60 * 60 * 1000;
  if (unit.startsWith("sem")) return n * 7 * DAY;
  if (unit.startsWith("h")) return n * 60 * 60 * 1000;
  return n * DAY;
}

// --- Request handler ---
async function handle(req, res) {
  const origin = req.headers["origin"] || "";
  cors(res, origin);
  securityHeaders(res);

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const ip = getIp(req);
  if (!checkRateLimit(ip)) return json(res, { error: "Rate limit exceeded" }, 429);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Auth check
  const routeKey = getRouteKey(req.method, pathname);
  const requiredRoles = routePermissions[routeKey];
  let currentUser = null;

  if (requiredRoles !== undefined && requiredRoles !== null) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const claims = verifyToken(token);
    if (!claims) return json(res, { error: "Unauthorized" }, 401);
    if (!requiredRoles.includes(claims.role)) return json(res, { error: "Forbidden" }, 403);
    currentUser = claims;
  }

  // --- Auth routes ---
  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    if (!body.email || !body.password) return json(res, { error: "email and password required" }, 400);
    const user = findUser(String(body.email), String(body.password));
    if (!user) { logAudit("anonymous", "login_failed", body.email); return json(res, { error: "Invalid credentials" }, 401); }
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    logAudit(user.email, "login", user.email);
    return json(res, { token, user: { id: user.id, email: user.email, role: user.role } });
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    return json(res, { id: currentUser.sub, email: currentUser.email, role: currentUser.role });
  }

  // --- Context routes (PR #11) ---
  if (req.method === "GET" && pathname === "/api/context") {
    return json(res, await getContextDocuments());
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/context/")) {
    const id = decodeURIComponent(pathname.split("/").pop());
    const body = await readBody(req);
    const updated = await updateContextDocument(id, body, currentUser?.role);
    logAudit(currentUser?.email || "system", "context_updated", id);
    return json(res, updated);
  }

  // --- Cycles routes (PR #12) ---
  if (req.method === "GET" && pathname === "/api/cycles") {
    return json(res, Array.from(cycles.values()));
  }

  if (req.method === "POST" && pathname === "/api/cycles") {
    const body = await readBody(req);
    if (!body.title) return json(res, { error: "title required" }, 400);
    // Cold-start (doctrina §4): un ciclo puede arrancar directo en F3 (Validar)
    // cuando no hay diagnóstico previo — feature nueva sin datos, baja derecho
    // a Fake Door/Wizard of Oz en vez de forzar F0→F1→F2 lineal.
    const coldStart = body.fase_actual === "F3" && body.cold_start === true;
    let startPhase = "F0";
    if (coldStart) startPhase = "F3";
    else if (DOCTRINE_PHASES.includes(body.fase_actual)) startPhase = body.fase_actual;
    // F0 validation (Fase 2): reject solution/feature framing — a cycle must
    // start from a behavior ("quién hace/no hace qué"), not a feature to build.
    // No aplica en cold-start: F3 arranca directo de un supuesto a validar, no
    // de un behavior statement.
    const featureFramed = !coldStart && looksLikeFeature(body.title);
    if (!body.force && featureFramed) {
      logAudit(currentUser?.email, "behavior_rejected", "new", { reason: "feature", title: body.title });
      return json(res, {
        error: "Eso es una solución, no un comportamiento.",
        reason: "feature",
        hint: "Describe qué seller, haciendo qué, no está haciendo qué. Empieza por el comportamiento, no por la feature.",
      }, 422);
    }
    const now = new Date().toISOString();
    let cycle = {
      id: `cycle-${crypto.randomUUID()}`,
      title: body.title,
      sub_perfil: normalizeSubPerfil(body.sub_perfil),
      segmento_objetivo: body.segmento_objetivo ?? null,
      transicion: normalizeTransition(body.transicion),
      sub_causa: normalizeSubCausa(body.sub_causa, body.causa),
      causa: body.causa ?? null,
      causa_source: body.causa_source ?? null,
      sesgo: null,
      proxy_y_segunda_senal: null,
      fase_actual: startPhase,
      cold_start: coldStart,
      estado: "activo",
      resultado_cierre: null,
      // "risks" (no "riesgos"): acceptRisk()/resolveRisk() y la UI leen y
      // escriben cycle.risks — "riesgos" era un campo paralelo que nadie
      // más tocaba después de la creación (ver fix en src/memory.js).
      risks: [],
      brief: body.brief ?? {},
      experiment: body.experiment ?? {},
      spec_conductual: null,
      cierre: null,
      messages: [],
      // legacy fields (stepper UI still uses these)
      phases: body.phases ?? defaultPhases(startPhase),
      activePhase: startPhase,
      riskAccepted: false,
      createdAt: now,
      updatedAt: now,
      last_activity_at: now,
      createdBy: currentUser?.sub,
    };
    if (coldStart) {
      cycle = acceptRisk(cycle, "F3", "Ciclo cold-start: arrancó directo en F3 (Validar) sin diagnóstico previo (F0–F2). El supuesto a validar no viene de una causa B=MAP confirmada.", { id: currentUser?.sub, name: currentUser?.email });
      cycle.riskAccepted = true;
      logAudit(currentUser?.email, "cycle_cold_started", cycle.id, { title: body.title });
    }
    // Escape hatch: the PM overrode the feature-vs-behavior guard. Not free —
    // record a risk on the cycle (surfaced in the risk log + Métricas).
    if (featureFramed && body.force) {
      cycle = acceptRisk(cycle, "F0", "Ciclo creado con encuadre de feature (guardrail conducta-vs-feature anulado). El comportamiento a intervenir no quedó explícito de entrada.", { id: currentUser?.sub, name: currentUser?.email });
      cycle.riskAccepted = true;
      logAudit(currentUser?.email, "behavior_override", cycle.id, { title: body.title });
    }
    cycles.set(cycle.id, cycle);
    void persistCycles();
    logAudit(currentUser?.email, "cycle_created", cycle.id);
    return json(res, cycle, 201);
  }

  if (pathname.startsWith("/api/cycles/")) {
    const parts = pathname.split("/");
    const cycleId = parts[3];
    const rest = parts.slice(4).join("/");

    // Gate status for a phase: { ok, missing:[{key,message}] } (Fase 2)
    if (req.method === "GET" && rest === "gate") {
      const cycle = cycles.get(cycleId);
      if (!cycle) return json(res, { error: "Not found" }, 404);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const phase = url.searchParams.get("phase") || cycle.fase_actual || cycle.activePhase || "F0";
      if (!PHASES.includes(phase)) return json(res, { error: "Invalid phase" }, 400);
      const missing = getMissingGateRequirements(cycle, phase);
      return json(res, { phase, ok: missing.length === 0, missing, requirements: getGateRequirements(cycle, phase) });
    }

    // Advance a phase with server-side gate validation (Fase 2).
    // Body: { risk?: boolean, riskText?: string }. If the current phase gate is
    // not met and risk!==true → 422 {missing}. With risk → record the accepted
    // risk, mark the phase skipped, and advance.
    if (req.method === "POST" && rest === "advance") {
      let cycle = cycles.get(cycleId);
      if (!cycle) return json(res, { error: "Not found" }, 404);
      if (cycle.estado && cycle.estado !== "activo") return json(res, { error: "Cycle is closed" }, 409);
      const body = await readBody(req);
      const current = cycle.fase_actual ?? cycle.activePhase ?? "F0";
      const idx = PHASES.indexOf(current);
      if (idx < 0 || idx >= PHASES.length - 1) return json(res, { error: "Cannot advance from this phase" }, 400);
      const next = PHASES[idx + 1];
      const missing = getMissingGateRequirements(cycle, current);
      const withRisk = body.risk === true;
      if (missing.length && !withRisk) {
        return json(res, { error: "Gate not met", phase: current, missing }, 422);
      }
      const now = new Date().toISOString();
      let riskAccepted = cycle.riskAccepted ?? false;
      if (missing.length && withRisk) {
        const riskText = body.riskText?.trim() || `Avance de ${current} con gate incompleto: ${missing.map((m) => m.message).join(" ")}`;
        cycle = acceptRisk(cycle, current, riskText, { id: currentUser?.sub, name: currentUser?.email });
        riskAccepted = true;
      }
      const phases = (cycle.phases ?? []).map((p) => {
        if (p.key === current) return { ...p, state: "done", skipped: missing.length > 0 && withRisk ? true : p.skipped, note: missing.length && withRisk ? "riesgo aceptado" : "completo" };
        if (p.key === next) return { ...p, state: "active" };
        return p;
      });
      const updated = { ...cycle, fase_actual: next, activePhase: next, phases, riskAccepted, updatedAt: now, last_activity_at: now };
      // 2D - no-peeking: al entrar a F4 (Despliegue) se marca el inicio del
      // experimento; contra esto se mide un cierre temprano.
      if (next === "F4" && !updated.experiment?.started_at) {
        updated.experiment = { ...(updated.experiment ?? {}), started_at: now };
      }
      cycles.set(cycleId, updated);
      void persistCycles();
      logAudit(currentUser?.email, missing.length && withRisk ? "gate_skipped_with_risk" : "gate_passed", cycleId, { from: current, to: next });
      return json(res, { cycle: updated, advancedTo: next, skippedWithRisk: missing.length > 0 && withRisk });
    }

    if (req.method === "POST" && rest === "close") {
      let cycle = cycles.get(cycleId);
      if (!cycle) return json(res, { error: "Not found" }, 404);
      const body = await readBody(req);
      // Iteration loop (Fase 2): closing with "iterar" does NOT close the
      // cycle — it loops back to F1 (Diagnóstico) to re-diagnose, keeping history.
      const resultado = body.resultado_cierre ?? body.decision;
      if (resultado === "iterar") {
        const now = new Date().toISOString();
        const phases = (cycle.phases ?? []).map((p) =>
          p.key === "F1" ? { ...p, state: "active", note: "iteración" } : { ...p, state: p.key === "F0" ? "done" : "todo" });
        const iterated = {
          ...cycle,
          fase_actual: "F1",
          activePhase: "F1",
          phases,
          iterated: true,
          iterationCount: (cycle.iterationCount ?? 1) + 1,
          riskAccepted: true,
          updatedAt: now,
          last_activity_at: now,
        };
        cycles.set(cycleId, iterated);
        void persistCycles();
        recordDecision({ cycleId, tipo: "decision", causa: cycle.causa, sub_perfil: cycle.sub_perfil,
          texto: `Iterar (iteración ${iterated.iterationCount}) en "${cycle.title}": de vuelta a F1 para re-diagnosticar.`, actor: currentUser?.email });
        logAudit(currentUser?.email, "cycle_iterated", cycleId, { iterationCount: iterated.iterationCount });
        return json(res, { cycle: iterated, iterated: true });
      }
      if (!body.learning?.trim() || !body.pattern_name?.trim()) {
        return json(res, { error: "learning and pattern_name required" }, 400);
      }
      const now = new Date().toISOString();
      const decision = String(body.decision ?? body.resultado_cierre ?? "").trim() || null;
      // 2D - no-peeking: cerrar en F4 antes de que corra la duracion declarada
      // = leer el experimento antes de tiempo. Advertencia + risk tag, no bloqueo.
      let peeking = false;
      const currentPhase = cycle.fase_actual ?? cycle.activePhase;
      const durMs = parseDurationMs(cycle.experiment?.duracion);
      const startedAt = cycle.experiment?.started_at ? Date.parse(cycle.experiment.started_at) : null;
      if (currentPhase === "F4" && durMs && startedAt && (Date.now() - startedAt) < durMs) {
        const elapsedD = Math.floor((Date.now() - startedAt) / 86400000);
        const totalD = Math.round(durMs / 86400000);
        peeking = true;
        cycle = acceptRisk(cycle, "F4", `Cierre temprano (peeking): experimento leido en el dia ${elapsedD} de ${totalD} declarados. La decision puede estar contaminada por ruido.`, { id: currentUser?.sub, name: currentUser?.email });
        logAudit(currentUser?.email, "experiment_peeked", cycleId, { elapsedDays: elapsedD, declaredDays: totalD });
      }
      // Decisión obligatoria para cerrar (F5): si falta, no bloquea pero deja
      // [CONFIRMAR] + un tag de riesgo persistente (decisión 5 · doctrina §4).
      let baseCycle = decision
        ? cycle
        : acceptRisk(cycle, "F5", "Ciclo cerrado sin decisión explícita (escalar/matar/iterar) — pendiente [CONFIRMAR].", { id: currentUser?.sub, name: currentUser?.email });
      // Patrón nace en F5 tras recorrer el método: si al cerrar quedan gates
      // previos (F1–F4) sin cumplir, no se bloquea pero se deja rastro de riesgo.
      const skippedGates = ["F1", "F2", "F3", "F4"]
        .filter((ph) => getMissingGateRequirements(baseCycle, ph).length > 0);
      if (skippedGates.length) {
        baseCycle = acceptRisk(baseCycle, "F5", `Cierre sin completar gates previos: ${skippedGates.join(", ")}. El patrón se destila de un recorrido incompleto.`, { id: currentUser?.sub, name: currentUser?.email });
        logAudit(currentUser?.email, "cycle_closed_skipping_gates", cycleId, { skipped: skippedGates });
      }
      const patternId = `pat-${crypto.randomUUID()}`;
      // Tipo derivado de la decisión (matar→anti_patron, escalar→patron),
      // editable con body.tipo (decisión 9). Campos filtrables no nulos:
      // sub_perfil "sin_clasificar" si falta (decisión 8).
      const newPattern = {
        id: patternId,
        tipo: body.tipo ?? patternTypeFromDecision(decision) ?? "patron",
        nombre: body.pattern_name.trim(),
        causa: cycle.causa ?? null,
        sub_perfil: (cycle.sub_perfil && String(cycle.sub_perfil).trim()) || "sin_clasificar",
        transicion: cycle.transicion ?? null,
        // Qué test (escalera de validación §8) mató o confirmó el supuesto —
        // filtrable en la Biblioteca (Cambio 4).
        test_elegido: normalizeTestElegido(cycle.experiment?.test_elegido) ?? null,
        aprendizaje: body.learning.trim(),
        delta_metrica: body.delta?.trim() || null,
        evidencia: body.evidencia?.trim() || null,
        ciclo_origen_id: cycleId,
        veces_reutilizado: 0,
        createdAt: now,
        createdBy: currentUser?.sub,
      };
      const closedPhases = (baseCycle.phases ?? []).map((p) => ({
        ...p,
        state: p.key === "F5" ? "done" : p.state === "active" ? "done" : p.state,
      }));
      // Resumen ejecutivo: se genera una sola vez, aquí, con el ciclo ya
      // cerrado — nunca se re-genera después. Sin API key configurada queda
      // null y el entregable lo trata como [CONFIRMAR], no un texto inventado.
      const closeMeta = { decision: decision ?? "[CONFIRMAR]", learning: body.learning.trim(), delta: body.delta ?? null };
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      const resumenEjecutivo = ANTHROPIC_API_KEY
        ? await generateExecutiveSummary(ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", baseCycle, closeMeta)
        : null;
      const closedCycle = {
        ...baseCycle,
        estado: "cerrado",
        fase_actual: "F5",
        activePhase: "F5",
        phases: closedPhases,
        resultado_cierre: decision,
        cierre: {
          metric_result: body.metric_result ?? null,
          delta: body.delta ?? null,
          // Actividad ≠ outcome (doctrina §6): nunca fundidos, nunca uno como
          // proxy del otro sin evidencia.
          actividad: body.actividad?.trim() || null,
          outcome: body.outcome?.trim() || null,
          transicion_cognitiva: body.transicion_cognitiva ?? cycle.proxy_y_segunda_senal ?? null,
          churn_por_nivel: body.churn_por_nivel?.trim() || null,
          decision: decision ?? "[CONFIRMAR]",
          learning: body.learning.trim(),
          pattern_id: patternId,
          resumen_ejecutivo: resumenEjecutivo,
        },
        updatedAt: now,
        last_activity_at: now,
      };
      cycles.set(cycleId, closedCycle);
      patterns.push(newPattern);
      void persistCycles();
      void persistPatterns();
      // Captura estructurada: la decisión + aprendizaje entran al ledger durable
      // (además del patrón) para que el asistente lo lea en todos los ciclos.
      recordDecision({ cycleId, tipo: "decision", causa: cycle.causa, sub_perfil: cycle.sub_perfil,
        texto: `${decision ?? "[CONFIRMAR]"} "${cycle.title}": ${body.learning.trim()}${body.delta?.trim() ? ` (${body.delta.trim()})` : ""}`, actor: currentUser?.email });
      logAudit(currentUser?.email, "cycle_closed", cycleId, { patternId });
      logAudit(currentUser?.email, "pattern_created", patternId, { type: newPattern.tipo, cause: newPattern.causa });
      return json(res, { cycle: closedCycle, pattern: newPattern, peeking });
    }

    // Marca un riesgo puntual como resuelto (no lo borra: queda en cycle.risks
    // con resolvedAt, y pasa de "Riesgos asumidos" a "Riesgos resueltos" en
    // el entregable exportado — nunca desaparece del rastro).
    const riskResolveMatch = rest.match(/^risks\/([^/]+)\/resolve$/);
    if (req.method === "POST" && riskResolveMatch) {
      const cycle = cycles.get(cycleId);
      if (!cycle) return json(res, { error: "Not found" }, 404);
      const riskId = decodeURIComponent(riskResolveMatch[1]);
      const now = new Date().toISOString();
      const { cycle: resolvedCycle, found } = resolveRisk(cycle, riskId, { id: currentUser?.sub, name: currentUser?.email }, now);
      if (!found) return json(res, { error: "Risk not found" }, 404);
      const updated = { ...resolvedCycle, updatedAt: now, last_activity_at: now };
      cycles.set(cycleId, updated);
      void persistCycles();
      logAudit(currentUser?.email, "risk_resolved", cycleId, { riskId });
      return json(res, updated);
    }

    if (req.method === "GET" && !rest) {
      const cycle = cycles.get(cycleId);
      if (!cycle) return json(res, { error: "Not found" }, 404);
      return json(res, cycle);
    }
    if ((req.method === "PATCH" || req.method === "PUT") && !rest) {
      const cycle = cycles.get(cycleId);
      if (!cycle) return json(res, { error: "Not found" }, 404);
      const body = await readBody(req);
      const now = new Date().toISOString();
      // Un PATCH plano solo puede mover fase_actual hacia atrás (o dejarla igual).
      // Avanzar SIEMPRE pasa por POST .../advance, que aplica el gate y deja el
      // tag de riesgo si se salta — si no, el gate asesora-no-bloquea es evadible.
      if ("fase_actual" in body || "activePhase" in body) {
        const requested = body.fase_actual ?? body.activePhase;
        const currentIdx = PHASES.indexOf(cycle.fase_actual ?? cycle.activePhase ?? "F0");
        const requestedIdx = PHASES.indexOf(requested);
        if (requestedIdx > currentIdx) {
          return json(res, { error: "No se puede avanzar de fase por PATCH directo — usa POST /api/cycles/:id/advance (aplica el gate)." }, 422);
        }
      }
      // Enums de doctrina: normaliza alias a keys canónicas; valor no mapeable
      // → null (el gate lo pedirá — asesora, no bloquea).
      if ("sub_perfil" in body) body.sub_perfil = normalizeSubPerfil(body.sub_perfil);
      if ("transicion" in body) body.transicion = normalizeTransition(body.transicion);
      if ("sub_causa" in body) body.sub_causa = normalizeSubCausa(body.sub_causa, body.causa ?? cycle.causa);
      // Deep-merge nested objects (brief/experiment/cierre) so a partial patch of
      // one field does not wipe the others. Scalars/arrays override normally.
      const updated = { ...deepMerge(cycle, body), id: cycleId, updatedAt: now, last_activity_at: now };
      cycles.set(cycleId, updated);
      void persistCycles();
      logAudit(currentUser?.email, "cycle_updated", cycleId);
      return json(res, updated);
    }
    if (req.method === "DELETE" && !rest) {
      if (!cycles.has(cycleId)) return json(res, { error: "Not found" }, 404);
      cycles.delete(cycleId);
      void persistCycles();
      logAudit(currentUser?.email, "cycle_deleted", cycleId);
      return json(res, { ok: true });
    }
  }

  // --- Patterns routes (PR #20) ---
  if (req.method === "GET" && pathname === "/api/patterns") {
    return json(res, patterns);
  }

  if (req.method === "POST" && pathname === "/api/patterns") {
    const body = await readBody(req);
    if (!body.name) return json(res, { error: "name required" }, 400);
    const pattern = { id: `pat-${crypto.randomUUID()}`, ...body, createdAt: new Date().toISOString(), createdBy: currentUser?.sub };
    patterns.push(pattern);
    await persistPatterns();
    logAudit(currentUser?.email, "pattern_created", pattern.id, { name: pattern.name });
    return json(res, pattern, 201);
  }

  if (pathname.startsWith("/api/patterns/")) {
    const patId = pathname.split("/")[3];
    const rest = pathname.split("/").slice(4).join("/");

    if (req.method === "PATCH" && !rest) {
      const idx = patterns.findIndex((p) => p.id === patId);
      if (idx === -1) return json(res, { error: "Not found" }, 404);
      const body = await readBody(req);
      patterns[idx] = { ...patterns[idx], ...body, id: patId, updatedAt: new Date().toISOString() };
      await persistPatterns();
      logAudit(currentUser?.email, "pattern_updated", patId);
      return json(res, patterns[idx]);
    }

    if (req.method === "POST" && rest === "reuse") {
      const pattern = patterns.find((p) => p.id === patId);
      if (!pattern) return json(res, { error: "Not found" }, 404);
      // Increment reuse count
      const idx = patterns.findIndex((p) => p.id === patId);
      patterns[idx] = { ...pattern, veces_reutilizado: (pattern.veces_reutilizado ?? 0) + 1 };
      const now = new Date().toISOString();
      const newCycle = {
        id: `cycle-${crypto.randomUUID()}`,
        title: `[Reuso] ${pattern.nombre ?? pattern.name}`,
        sub_perfil: pattern.sub_perfil ?? null,
        segmento_objetivo: null,
        transicion: pattern.transicion ?? null,
        causa: pattern.causa ?? null,
        causa_source: "llm_suggested",
        fase_actual: "F0",
        estado: "activo",
        resultado_cierre: null,
        risks: [],
        brief: { hipotesis: { value: pattern.aprendizaje ?? "", confirmed: false } },
        experiment: {},
        cierre: null,
        messages: [],
        phases: defaultPhases(),
        activePhase: "F0",
        riskAccepted: false,
        reusedFromPattern: patId,
        createdAt: now,
        updatedAt: now,
        last_activity_at: now,
        createdBy: currentUser?.sub,
      };
      cycles.set(newCycle.id, newCycle);
      void persistCycles();
      void persistPatterns();
      logAudit(currentUser?.email, "pattern_reused", patId, { newCycleId: newCycle.id });
      return json(res, { pattern: patterns[idx], newCycle }, 201);
    }
  }

  // --- Chat endpoint (LLM via Anthropic API) ---
  if (req.method === "POST" && pathname === "/api/chat") {
    const body = await readBody(req);
    const { message, cycleId } = body;
    if (!message?.trim()) return json(res, { error: "message required" }, 400);

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      // Static notice — never echo the request body back into the response.
      return json(res, { reply: "[LLM no configurado — agrega ANTHROPIC_API_KEY al .env] Recibí tu mensaje y quedó guardado en el ciclo." });
    }

    const cycle = cycleId ? cycles.get(cycleId) : null;
    const { history, system } = await buildChatContext(cycle);

    const llmRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(ANTHROPIC_API_KEY),
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1024,
        system,
        messages: [...history, { role: "user", content: message }],
      }),
    });

    if (!llmRes.ok) {
      const err = await llmRes.json().catch(() => ({}));
      console.error("Anthropic API error, status:", llmRes.status);
      return json(res, { error: "LLM request failed", detail: err?.error?.message ?? llmRes.status }, 502);
    }

    const data = await llmRes.json();
    const reply = data.content?.[0]?.text ?? "Sin respuesta del modelo.";

    const { extractionChanged } = await persistChatTurn({ cycle, cycleId, message, reply, apiKey: ANTHROPIC_API_KEY, actor: currentUser?.email });
    logAudit(currentUser?.email || "anon", "chat_message", cycleId || "global");
    // Return only the model reply + which brief fields changed. The persisted
    // cycle (which embeds the user message) is re-fetched by the client over
    // GET /api/cycles, so no request input is reflected into this response.
    return json(res, { reply, changed: extractionChanged });
  }

  // --- Chat streaming (B3, spec §5.8): SSE with token events + final done ---
  if (req.method === "POST" && pathname === "/api/chat/stream") {
    const body = await readBody(req);
    const { message, cycleId } = body;
    if (!message?.trim()) return json(res, { error: "message required" }, 400);

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const cycle = cycleId ? cycles.get(cycleId) : null;
    let reply = "";
    try {
      if (!ANTHROPIC_API_KEY) {
        // No key: stream a static fallback notice word-by-word so the UI path
        // is identical with and without a configured model. (Static on purpose
        // — no reflection of user input into the response.)
        reply = "[LLM no configurado — agrega ANTHROPIC_API_KEY al .env] Recibí tu mensaje y quedó guardado en el ciclo.";
        for (const word of reply.split(/(?<=\s)/)) {
          send("token", { t: word });
          await new Promise((r) => setTimeout(r, 15));
        }
      } else {
        const { history, system } = await buildChatContext(cycle);
        const llmRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: anthropicHeaders(ANTHROPIC_API_KEY),
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
            max_tokens: 1024,
            stream: true,
            system,
            messages: [...history, { role: "user", content: message }],
          }),
        });
        if (!llmRes.ok) {
          const err = await llmRes.json().catch(() => ({}));
          // Log only the status code — never the raw error body (may echo
          // user/model content → log injection).
          console.error("Anthropic API error, status:", llmRes.status);
          send("error", { error: "LLM request failed", detail: err?.error?.message ?? llmRes.status });
          return res.end();
        }
        for await (const text of anthropicTextDeltas(llmRes.body)) {
          reply += text;
          send("token", { t: text });
        }
        if (!reply) reply = "Sin respuesta del modelo.";
      }

      const { extractionChanged } = await persistChatTurn({ cycle, cycleId, message, reply, apiKey: ANTHROPIC_API_KEY, actor: currentUser?.email });
      logAudit(currentUser?.email || "anon", "chat_message", cycleId || "global");
      // Deliberately minimal payload: no user/LLM content is reflected into
      // the SSE response. The client already accumulated the reply from the
      // token events and re-fetches the updated cycle over the JSON API.
      send("done", { ok: true, changed: extractionChanged });
    } catch (error) {
      console.error("Chat stream error:", error);
      send("error", { error: "Stream interrumpido", detail: error.message });
    }
    return res.end();
  }

  // --- Health check ---
  if (req.method === "GET" && pathname === "/health") {
    return json(res, { status: "ok", uptime: Math.floor(process.uptime()) });
  }

  // --- Audit events (PR #12) ---
  if (req.method === "GET" && pathname === "/api/audit-events") {
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    return json(res, auditEvents.slice(-limit).reverse());
  }

  // --- Decisions ledger (PR-M2) ---
  if (req.method === "GET" && pathname === "/api/decisions") {
    return json(res, decisions.slice().reverse());
  }
  if (req.method === "POST" && pathname === "/api/decisions") {
    const body = await readBody(req);
    const texto = String(body.texto ?? "").trim();
    if (!texto) return json(res, { error: "texto required" }, 400);
    const entry = recordDecision({
      cycleId: body.cycleId ?? null,
      tipo: body.tipo ?? "aprendizaje",
      causa: body.causa ?? null,
      sub_perfil: body.sub_perfil ?? null,
      texto,
      actor: currentUser?.email,
    });
    logAudit(currentUser?.email, "decision_recorded", entry.cycleId || "global", { tipo: entry.tipo });
    return json(res, entry, 201);
  }

  // --- Analytics: aggregate the process metrics from the audit log (Fase 5) ---
  if (req.method === "GET" && pathname === "/api/analytics") {
    const count = (action) => auditEvents.filter((e) => e.action === action).length;
    const all = Array.from(cycles.values());
    const gatesPassed = count("gate_passed");
    const gatesSkipped = count("gate_skipped_with_risk");
    return json(res, {
      cycles: {
        total: all.length,
        active: all.filter((c) => (c.estado ?? "activo") === "activo").length,
        closed: all.filter((c) => c.estado === "cerrado").length,
        iterated: all.filter((c) => c.iterated).length,
      },
      gates: {
        passed: gatesPassed,
        skippedWithRisk: gatesSkipped,
        rigor: gatesPassed + gatesSkipped ? Math.round((gatesPassed / (gatesPassed + gatesSkipped)) * 100) : null,
      },
      patterns: { created: count("pattern_created"), reused: count("pattern_reused"), total: patterns.length },
      behavior: { rejected: count("behavior_rejected"), overridden: count("behavior_override") },
      chat: { messages: count("chat_message"), briefExtractions: count("brief_extracted") },
      exports: {
        attempted: count("export_attempted"),
        withAssumptions: auditEvents.filter((e) => e.action === "export_attempted" && e.meta?.missingCount > 0).length,
      },
      iterations: count("cycle_iterated"),
      generatedAt: new Date().toISOString(),
    });
  }

  // --- Analytics drill-down: qué ciclos/patrones/eventos componen cada métrica ---
  if (req.method === "GET" && pathname === "/api/analytics/drill") {
    const metric = String(url.searchParams.get("metric") ?? "").trim();
    const all = Array.from(cycles.values());
    const cycleTitle = (id) => cycles.get(id)?.title ?? id ?? "(ciclo eliminado)";
    const estadoLabel = (c) => (c.estado === "cerrado" ? "Cerrado" : "En curso");
    const cycleItem = (c, subtitle) => ({ type: "cycle", id: c.id, title: c.title ?? "(sin título)", subtitle });
    const eventItems = (action, toItem) =>
      auditEvents.filter((e) => e.action === action).map((e) => toItem(e)).reverse();
    let label = metric;
    let items = [];
    switch (metric) {
      case "ciclos_totales":
        label = "Ciclos totales";
        items = all.map((c) => cycleItem(c, `${estadoLabel(c)} · ${FASE_LABEL[c.fase_actual] ?? c.fase_actual ?? "F0"}`));
        break;
      case "rigor_gates":
        label = "Gates cruzados con riesgo aceptado";
        items = eventItems("gate_skipped_with_risk", (e) => ({
          type: "cycle", id: e.resource, title: cycleTitle(e.resource),
          subtitle: `Avanzó ${e.meta?.from ?? "?"} → ${e.meta?.to ?? "?"} sin cumplir el gate`,
        }));
        break;
      case "iteraciones":
        label = "Iteraciones (ciclos que re-diagnosticaron)";
        items = all.filter((c) => c.iterated).map((c) => cycleItem(c, `${c.iterationCount ?? 1} iteración(es)`));
        break;
      case "patrones":
        label = "Patrones destilados";
        items = patterns.map((p) => ({ type: "pattern", id: p.id, title: p.nombre ?? p.name ?? "(sin nombre)", subtitle: `${p.tipo ?? "patron"} · ${p.veces_reutilizado ?? 0} reúso(s)` }));
        break;
      case "rechazos_f0":
        label = "Rechazos F0 (arranques por feature evitados)";
        items = eventItems("behavior_rejected", (e) => ({ type: "event", id: e.id, title: e.meta?.title ?? "(propuesta sin título)", subtitle: "Rechazado: era una solución, no un comportamiento" }));
        break;
      case "mensajes_chat":
        label = "Ciclos con conversación";
        items = all.filter((c) => (c.messages?.length ?? 0) > 0).map((c) => cycleItem(c, `${c.messages.length} mensaje(s)`));
        break;
      case "exports":
        label = "Exports de entregable";
        items = eventItems("export_attempted", (e) => ({ type: "event", id: e.id, title: cycleTitle(e.resource), subtitle: e.meta?.missingCount > 0 ? `${e.meta.missingCount} supuesto(s) sin confirmar` : "Sin supuestos pendientes" }));
        break;
      default:
        return json(res, { error: "Métrica no reconocida" }, 400);
    }
    return json(res, { metric, label, items });
  }

  // Client-emitted analytics event (e.g. export_attempted) → append to audit log.
  if (req.method === "POST" && pathname === "/api/analytics/event") {
    const body = await readBody(req);
    const type = String(body.type ?? "").trim();
    const ALLOWED = ["export_attempted", "pattern_reused"];
    if (!ALLOWED.includes(type)) return json(res, { error: "Unsupported event type" }, 400);
    logAudit(currentUser?.email || "anon", type, body.resource ?? "global", body.meta ?? {});
    return json(res, { ok: true });
  }

  // --- Static file serving ---
  if (req.method !== "GET") return json(res, { error: "Method not allowed" }, 405);
  const staticRoot = path.resolve(ROOT);
  const relativePart = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  // Only serve files with known safe extensions — prevents leaking .env, data files, etc.
  const reqExt = path.extname(relativePart).toLowerCase();
  if (!TYPES[reqExt]) return json(res, { error: "Not found" }, 404);
  // path.resolve canonicalizes the path (resolves ..), then we verify it stays inside staticRoot
  const filePath = path.resolve(staticRoot, relativePart);
  if (!filePath.startsWith(staticRoot + path.sep)) {
    return json(res, { error: "Forbidden" }, 403);
  }
  const content = await fs.readFile(filePath);
  res.writeHead(200, { "Content-Type": TYPES[reqExt] });
  res.end(content);
}

loadData()
  .then(() => {
    http.createServer(async (req, res) => {
      try {
        await handle(req, res);
      } catch (error) {
        if (error.code === "ENOENT") return json(res, { error: "Not found" }, 404);
        if (error instanceof SyntaxError) return json(res, { error: "Invalid JSON" }, 400);
        json(res, { error: error.message }, error.statusCode || 500);
      }
    }).listen(PORT, "0.0.0.0", () => console.log(`Dropi Product Assistant en http://0.0.0.0:${PORT}`));
  })
  .catch((err) => { console.error("Failed to start server:", err); process.exit(1); });
