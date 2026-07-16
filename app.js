import { getGateRequirements } from "./src/phaseEngine.js";
import { markdownToPdfHtml } from "./src/exportService.js";
import { PHASES, FASE_LABEL, COGNITIVE_LABEL, COGNITIVE_LEVELS, SUB_PERFILES, SUB_PERFIL_LABEL, TRANSITIONS, transitionLabel, subPerfilLabel, SUB_CAUSA, SUB_CAUSA_LABEL, SESGOS, SESGO_LABEL, TIPOS_SUPUESTO, TEST_ESCALERA, TEST_ELEGIDO_LABEL, DECISIONS_F3 } from "./src/doctrina.js";

// <option> lists derived from the doctrine enums (2B).
const subPerfilOptions = (cur = "") =>
  ['<option value="">Sub-perfil…</option>']
    .concat(SUB_PERFILES.filter((s) => s !== "sin_clasificar").map((s) => `<option value="${s}"${s === cur ? " selected" : ""}>${SUB_PERFIL_LABEL[s]}</option>`))
    .join("");
const transitionOptions = (cur = "") =>
  ['<option value="">Transición…</option>']
    .concat(TRANSITIONS.map((t) => `<option value="${t}"${t === cur ? " selected" : ""}>${transitionLabel(t)}</option>`))
    .join("");
const sesgoOptions = (cur = "") =>
  ['<option value="">Sesgo…</option>']
    .concat(SESGOS.map((s) => `<option value="${s}"${s === cur ? " selected" : ""}>${SESGO_LABEL[s]}</option>`))
    .join("");
const tipoSupuestoOptions = (cur = "") =>
  ['<option value="">Tipo de supuesto…</option>']
    .concat(TIPOS_SUPUESTO.map((t) => `<option value="${t}"${t === cur ? " selected" : ""}>${t[0].toUpperCase()}${t.slice(1)}</option>`))
    .join("");
const testElegidoOptions = (cur = "") =>
  ['<option value="">Test (escalera §8)…</option>']
    .concat(TEST_ESCALERA.map((t) => `<option value="${t}"${t === cur ? " selected" : ""}>${TEST_ELEGIDO_LABEL[t]}</option>`))
    .join("");
const decisionF3Labels = { avanzar_f4: "Avanzar a F4", re_diagnosticar: "Re-diagnosticar", matar: "Matar" };
const decisionF3Options = (cur = "") =>
  ['<option value="">Decisión…</option>']
    .concat(DECISIONS_F3.map((d) => `<option value="${d}"${d === cur ? " selected" : ""}>${decisionF3Labels[d]}</option>`))
    .join("");

// --- Constants ---
const THEME_KEY = "dropi-workspace-theme";
const TOKEN_KEY = "dropi-token";

// --- DOM refs ---
const loginView = document.querySelector("#loginView");
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const loginError = document.querySelector("#loginError");

const workspace = document.querySelector("#workspace");
const phaseStepper = document.querySelector("#phaseStepper");
const activePhaseLabel = document.querySelector("#activePhaseLabel");
const activePhaseNote = document.querySelector("#activePhaseNote");
const activeCycleName = document.querySelector("#activeCycleName");
const activeCycleCard = document.querySelector("#activeCycleCard");
const messageStream = document.querySelector("#messageStream");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const chatInput = document.querySelector(".chat-input");
const placeholder = document.querySelector("#rotatingPlaceholder");
const themeToggle = document.querySelector("#themeToggle");
const commandButton = document.querySelector("#commandButton");
const commandPalette = document.querySelector("#commandPalette");
const exportBrief = document.querySelector("#exportBrief");
const progressFill = document.querySelector("#briefProgressFill");
const progressText = document.querySelector("#briefProgressText");
const riskTag = document.querySelector("#riskTag");
const secondSource = document.querySelector("#secondSource");
const hypothesisField = document.querySelector("#hypothesisField");
const metricField = document.querySelector("#metricField");
const briefCycleTitle = document.querySelector("#briefCycleTitle");
const viewButtons = document.querySelectorAll("[data-view-target]");
const homeView = document.querySelector("#homeView");
const workspaceView = document.querySelector("#workspaceView");
const libraryView = document.querySelector("#libraryView");
const contextView = document.querySelector("#contextView");
const analyticsView = document.querySelector("#analyticsView");
const analyticsGrid = document.querySelector("#analyticsGrid");
const contextDocuments = document.querySelector("#contextDocuments");
const contextPendingBanner = document.querySelector("#contextPendingBanner");
const newCycleButton = document.querySelector("#newCycleButton");
const newCycleEmpty = document.querySelector("#newCycleEmpty");
const emptyCycles = document.querySelector("#emptyCycles");
const cyclesList = document.querySelector("#cyclesList");
const patternsList = document.querySelector("#patternsList");
const briefSwitch = document.querySelector("#briefSwitch");
const experimentSwitch = document.querySelector("#experimentSwitch");
const specSwitch = document.querySelector("#specSwitch");
const deliverableTitle = document.querySelector("#deliverableTitle");
const briefBody = document.querySelector("#briefBody");
const experimentBody = document.querySelector("#experimentBody");
const specBody = document.querySelector("#specBody");
const paletteSearch = document.querySelector("#paletteSearch");
const logoutButton = document.querySelector("#logoutButton");
const userEmailEl = document.querySelector("#userEmail");

// --- Phase seed (template for new cycles) ---
const phaseSeed = [
  { key: "F0", label: FASE_LABEL.F0, state: "active" },
  { key: "F1", label: FASE_LABEL.F1, state: "todo" },
  { key: "F2", label: FASE_LABEL.F2, state: "todo" },
  { key: "F3", label: FASE_LABEL.F3, state: "todo" },
  { key: "F4", label: FASE_LABEL.F4, state: "todo" },
  { key: "F5", label: FASE_LABEL.F5, state: "todo" },
];

const prompts = [
  "¿Qué comportamiento debe ocurrir, y por qué no ocurre hoy?",
  "Trae la evidencia: ¿qué dato sostiene la causa Ability?",
  "Si avanzas sin gate, ¿qué riesgo aceptas explícitamente?",
  "¿Cuál sería el cambio mínimo para mover el comportamiento?",
];

// --- App state ---
let currentUser = null;
let currentCycleId = null;
let cycles = [];
let patterns = [];
let filled = 0;
let currentView = "workspace";
let deliverable = "brief";
let contextLoaded = false;
let promptIndex = 0;

// --- Auth helpers ---
function getToken() { return localStorage.getItem(TOKEN_KEY); }

function authHeaders() {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` };
}

// Global fetch wrapper — catches 401 mid-session and forces re-login
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    showToast("Sesión expirada. Inicia sesión de nuevo.", true);
    setTimeout(logout, 1500);
    throw new Error("Unauthorized");
  }
  return res;
}

function getCurrentCycle() {
  return cycles.find((c) => c.id === currentCycleId) ?? null;
}

// Derived state from current cycle
function getPhases() {
  return getCurrentCycle()?.phases ?? structuredClone(phaseSeed);
}

function getActivePhase() {
  return getCurrentCycle()?.activePhase ?? "F0";
}

// --- Auth flow ---
function showLogin() {
  loginView.hidden = false;
  workspace.hidden = true;
}

function showApp() {
  loginView.hidden = true;
  workspace.hidden = false;
  const overlay = document.getElementById("appLoadingOverlay");
  if (overlay) overlay.hidden = false;
  userEmailEl.textContent = currentUser?.email ?? "";
}

async function checkAuth() {
  const token = getToken();
  if (!token) { showLogin(); return; }
  try {
    const res = await fetch("/api/auth/me", { headers: authHeaders() });
    if (!res.ok) { localStorage.removeItem(TOKEN_KEY); showLogin(); return; }
    currentUser = await res.json();
    showApp();
    await loadInitialData();
  } catch {
    showLogin();
  }
}

async function login(email, password) {
  loginError.hidden = true;
  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando…";
  loginEmail.disabled = true;
  loginPassword.disabled = true;
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      loginError.textContent = "Credenciales incorrectas. Revisa email y contraseña.";
      loginError.hidden = false;
      return;
    }
    const { token, user } = await res.json();
    localStorage.setItem(TOKEN_KEY, token);
    currentUser = user;
    showApp();
    await loadInitialData();
  } catch {
    loginError.textContent = "No se pudo conectar con el servidor.";
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar";
    loginEmail.disabled = false;
    loginPassword.disabled = false;
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  currentCycleId = null;
  cycles = [];
  patterns = [];
  contextLoaded = false;
  showLogin();
}

// --- Init ---
async function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  applyRailCollapsed(localStorage.getItem(RAIL_KEY) === "1");
  rotatePlaceholder();
  setInterval(rotatePlaceholder, 4200);
  await checkAuth();
}

async function loadInitialData() {
  await Promise.all([loadCycles(), loadPatterns()]);
  renderStepper();
  if (currentCycleId) {
    loadMessages(currentCycleId);
  } else {
    renderMessages([]);
  }
  // Land on Home when no cycles exist so the CTA is the first thing the user sees
  setView(cycles.length ? "workspace" : "home");
  renderBriefState();
  const overlay = document.getElementById("appLoadingOverlay");
  if (overlay) overlay.hidden = true;
}

// --- Cycles ---
// B6 · loading skeletons — placeholder cards while a list is fetching.
function skeletonCards(n = 3) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton-card" aria-hidden="true"><span class="sk-line sk-w40"></span><span class="sk-line sk-w80"></span><span class="sk-line sk-w60"></span></div>`
  ).join("");
}

async function loadCycles() {
  cyclesList.innerHTML = skeletonCards(3);
  try {
    const res = await apiFetch("/api/cycles", { headers: authHeaders() });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    cycles = await res.json();
    if (cycles.length && !currentCycleId) {
      currentCycleId = cycles[cycles.length - 1].id;
    }
    renderCyclesList();
    renderActiveCycle();
  } catch {
    // No usar onclick="loadCycles()" inline: app.js es un módulo, sus
    // funciones no son visibles en scope global — el botón lanzaba
    // "loadCycles is not defined" en vez de reintentar.
    cyclesList.innerHTML = `<p class="error-state">No se pudieron cargar los ciclos. <button type="button" data-retry="cycles">Reintentar</button></p>`;
    cyclesList.querySelector("[data-retry]")?.addEventListener("click", () => loadCycles());
  }
}

// A5 · Onboarding: styled "Nuevo ciclo" modal (replaces window.prompt).
// Shared modal helper (P0): removes duplication across the modal builders.
// Creates a .export-modal overlay mounted in .workspace, closes on backdrop
// click and Esc, and returns the overlay for the caller to wire its buttons.
function openModal(id, innerHtml) {
  document.getElementById(id)?.remove();
  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = "export-modal";
  overlay.innerHTML = innerHtml;
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  overlay.close = close;
  workspace.appendChild(overlay);
  return overlay;
}

function openNewCycleModal() {
  const overlay = openModal("newCycleModal", `
    <div class="export-modal-card newcycle-card">
      <p class="eyebrow">Nuevo ciclo · F0 ${FASE_LABEL.F0}</p>
      <h2 class="pd-title">Empieza por un comportamiento, no por una feature.</h2>
      <label class="nc-label" for="ncBehavior">¿Qué seller, haciendo qué, no está haciendo qué?</label>
      <textarea id="ncBehavior" class="nc-textarea" rows="3" placeholder="El seller Explorador no configura su 2º envío dentro de las 72h tras el primer pedido…"></textarea>
      <div class="nc-grid">
        <div>
          <label class="nc-label" for="ncSub">Sub-perfil (opcional)</label>
          <select id="ncSub" class="nc-input">${subPerfilOptions()}</select>
        </div>
        <div><label class="nc-label" for="ncTrans">Transición (opcional)</label><select id="ncTrans" class="nc-input">${transitionOptions()}</select></div>
      </div>
      <div id="ncTransPreview" class="nc-trans-preview" hidden></div>
      <label class="nc-label" for="ncSegment">Segmento (cohorte conductual, opcional)</label>
      <input id="ncSegment" class="nc-input" placeholder="ej. sellers inactivos 30d / registrados sin 1ª orden en 7d" />
      <p id="ncError" class="login-error" hidden></p>
      <div id="ncEscape" class="nc-escape" hidden>
        <button type="button" class="link-action" data-nc="force">Crear de todas formas (registra riesgo)</button>
      </div>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-nc="cancel">Cancelar</button>
        <button type="button" class="primary-action" data-nc="create">Crear ciclo · abrir F0</button>
      </div>
    </div>`);
  const q = (sel) => overlay.querySelector(sel);
  q('[data-nc="cancel"]')?.addEventListener("click", overlay.close);

  // CognitiveTransition mini-preview once a transition is chosen.
  const preview = q("#ncTransPreview");
  q("#ncTrans")?.addEventListener("change", (e) => {
    const t = e.target.value;
    if (t && preview) { preview.innerHTML = cognitivePathHtml(t); preview.hidden = false; }
    else if (preview) { preview.hidden = true; preview.innerHTML = ""; }
  });

  const extraFrom = () => ({
    sub_perfil: q("#ncSub")?.value || null,
    transicion: q("#ncTrans")?.value || null,
    segmento_objetivo: (q("#ncSegment")?.value ?? "").trim() || null,
  });
  const submit = async (force = false) => {
    const behavior = (q("#ncBehavior")?.value ?? "").trim();
    if (!behavior) { const err = q("#ncError"); if (err) { err.textContent = "Describe el comportamiento para empezar."; err.hidden = false; } return; }
    const rejection = await createCycle(behavior, { ...extraFrom(), force });
    if (rejection?.feature) {
      // Keep the modal open and offer the logged escape hatch.
      const err = q("#ncError"); const esc = q("#ncEscape");
      if (err) { err.textContent = rejection.error || "Eso es una solución, no un comportamiento."; err.hidden = false; }
      if (esc) esc.hidden = false;
      return;
    }
    overlay.close();
  };
  q('[data-nc="create"]')?.addEventListener("click", () => submit(false));
  q('[data-nc="force"]')?.addEventListener("click", () => submit(true));
  q("#ncBehavior")?.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(false); });
  setTimeout(() => q("#ncBehavior")?.focus(), 30);
}

async function createCycle(title, extra = {}) {
  try {
    const res = await fetch("/api/cycles", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        title,
        sub_perfil: extra.sub_perfil || null,
        transicion: extra.transicion || null,
        segmento_objetivo: extra.segmento_objetivo || null,
        force: extra.force || false,
        phases: structuredClone(phaseSeed),
        activePhase: "F0",
        riskAccepted: false,
      }),
    });
    if (res.status === 422) {
      // F0 validation: the title reads like a feature, not a behavior.
      const err = await res.json().catch(() => ({}));
      // The New Cycle modal handles this inline (escape hatch); other entry
      // points (empty-state chips, ⌘K) fall back to the workspace rejection.
      if (document.getElementById("newCycleModal")) {
        return { feature: true, error: err.error, hint: err.hint };
      }
      setView("workspace");
      addFeatureRejection(err.error ?? "Eso es una solución, no un comportamiento.", err.hint);
      return { feature: true, error: err.error, hint: err.hint };
    }
    if (!res.ok) return;
    const cycle = await res.json();
    cycles.push(cycle);
    currentCycleId = cycle.id;
    renderCyclesList();
    renderActiveCycle();  // also calls loadBriefFromCycle internally
    renderStepper();
    renderBriefState();
    addAiNote(`Nuevo ciclo "${escapeHtml(cycle.title)}" en F0 · ${FASE_LABEL.F0}. Empecemos: ¿qué seller, haciendo qué, no está haciendo qué?`);
    setView("workspace");
  } catch {
    console.warn("No se pudo crear el ciclo.");
  }
}

// F0: red bubble when the input is a feature/solution instead of a behavior.
function addFeatureRejection(message, hint) {
  const inner = messageStream.querySelector(".stream-inner") || messageStream;
  inner.insertAdjacentHTML(
    "beforeend",
    `<div class="feature-reject"><strong>${escapeHtml(message)}</strong>${hint ? `<p>${escapeHtml(hint)}</p>` : ""}</div>`
  );
  messageStream.scrollTop = messageStream.scrollHeight;
}

async function updateCycle(patch) {
  if (!currentCycleId) return;
  try {
    const res = await apiFetch(`/api/cycles/${currentCycleId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const updated = await res.json();
    cycles = cycles.map((c) => (c.id === currentCycleId ? updated : c));
    renderCyclesList();
  } catch {
    console.warn("No se pudo actualizar el ciclo.");
  }
}

let statusFilter = "all"; // all | activo | cerrado
let causeFilter = "all"; // all | M | A | P

// Cognitive ladder for the transition path on cards (A3).
// Renders the 5-level cognitive scale highlighting the cycle's transition.
// Accepts canonical keys ("aha_habit") and legacy aliases ("Setup_Aha").
function cognitivePathHtml(transicion) {
  if (!transicion) return "";
  const LEGACY = { habito: "habit" };
  const parts = String(transicion).toLowerCase().split(/[_→-]/)
    .map((s) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .map((s) => LEGACY[s] ?? s);
  const from = parts[0], to = parts[1];
  return `<div class="cognitive-path">${COGNITIVE_LEVELS.map((lvl) =>
    (lvl === from || lvl === to) ? `<strong>${escapeHtml(COGNITIVE_LABEL[lvl])}</strong>` : `<span class="muted-step">${escapeHtml(COGNITIVE_LABEL[lvl])}</span>`
  ).join('<span>›</span>')}</div>`;
}

function cycleCardHtml(cycle) {
  const phases = cycle.phases ?? phaseSeed;
  const active = cycle.fase_actual ?? cycle.activePhase ?? "F0";
  const activePhaseObj = phases.find((p) => p.key === active) ?? phases[0];
  const miniDots = phases.map((p) => `<span class="${p.state}"></span>`).join("");
  const since = new Date(cycle.updatedAt ?? cycle.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  const causeLabel = cycle.causa === "M" ? "Motivación" : cycle.causa === "A" ? "Ability" : cycle.causa === "P" ? "Prompt" : null;
  const chips = [
    cycle.sub_perfil ? `<span class="chip">${escapeHtml(subPerfilLabel(cycle.sub_perfil))}</span>` : "",
    causeLabel ? `<span class="chip cause-chip ${escapeHtml(cycle.causa)}">${escapeHtml(causeLabel)}</span>` : "",
  ].join("");
  const statusPill = cycle.estado === "cerrado"
    ? `<span class="status-pill closed">${cycle.resultado_cierre === "matar" ? "✗ Matado" : cycle.resultado_cierre === "iterar" ? "↻ Iterando" : "✓ Escalado"}</span>`
    : cycle.estado === "descartado"
      ? '<span class="status-pill discarded">Descartado</span>'
      : '<span class="status-pill live">En curso</span>';
  const isClosed = cycle.estado && cycle.estado !== "activo";
  return `
    <article class="dashboard-card ${isClosed ? "is-closed" : ""} ${cycle.id === currentCycleId ? "is-active" : ""}" data-cycle-id="${escapeHtml(cycle.id)}">
      <div class="card-topline">${statusPill}<span>${escapeHtml(since)}</span></div>
      <h2>${escapeHtml(cycle.title)}</h2>
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      ${cognitivePathHtml(cycle.transicion)}
      <div class="mini-stepper" aria-label="Fases F0 a F5">${miniDots}</div>
      <footer><strong>${escapeHtml(activePhaseObj.key)} · ${escapeHtml(activePhaseObj.label)}</strong>${cycle.riskAccepted ? '<span class="risk-count">riesgo abierto</span>' : ""}</footer>
    </article>`;
}

// Status and cause are independent controls that compose with AND.
function matchesStatusFilter(cycle) {
  if (statusFilter === "all") return true;
  if (statusFilter === "activo") return (cycle.estado ?? "activo") === "activo";
  return cycle.estado === "cerrado" || cycle.estado === "descartado"; // cerrado
}

function matchesCauseFilter(cycle) {
  if (causeFilter === "all") return true;
  return cycle.causa === causeFilter; // M/A/P
}

function matchesCycleFilter(cycle) {
  return matchesStatusFilter(cycle) && matchesCauseFilter(cycle);
}

function activeFilterCount() {
  return (statusFilter !== "all" ? 1 : 0) + (causeFilter !== "all" ? 1 : 0);
}

function syncClearFiltersButton() {
  const btn = document.querySelector("#clearCyclesFilters");
  if (!btn) return;
  const n = activeFilterCount();
  btn.hidden = n === 0;
  btn.textContent = `Limpiar filtros (${n})`;
}

function renderCyclesList() {
  syncClearFiltersButton();
  if (!cycles.length) {
    cyclesList.innerHTML = "";
    emptyCycles.hidden = false;
    return;
  }
  emptyCycles.hidden = true;
  const filtered = cycles.filter(matchesCycleFilter);
  const open = filtered.filter((c) => (c.estado ?? "activo") === "activo");
  const closed = filtered.filter((c) => c.estado === "cerrado" || c.estado === "descartado");
  const section = (label, list) => list.length
    ? `<div class="cycle-section"><p class="section-label">${label} · ${list.length}</p><div class="cycle-grid">${list.map(cycleCardHtml).join("")}</div></div>`
    : "";
  const body = `${section("En curso", open)}${section("Cerrados", closed)}`;
  cyclesList.innerHTML = body || `<p class="loading-state">Ningún ciclo coincide con esta combinación de filtros.</p>`;

  cyclesList.querySelectorAll("[data-cycle-id]").forEach((card) => {
    card.addEventListener("click", () => {
      currentCycleId = card.dataset.cycleId;
      renderCyclesList();
      renderActiveCycle();
      renderStepper();
      renderBriefState();
      loadMessages(currentCycleId);
      setView("workspace");
    });
  });
}

// A1 · Phase guide: pinned block above the chat with the active phase's
// objective and a live checklist of its gate requirements.
const PHASE_META = {
  F0: { label: FASE_LABEL.F0, goal: "Detecta un comportamiento anómalo: ¿qué seller, haciendo qué, no está haciendo qué? Añade una señal cuantitativa y el segmento." },
  F1: { label: FASE_LABEL.F1, goal: "Encuentra la causa raíz con B=MAP. Necesitas ≥2 fuentes confirmadas y la causa (Motivación / Ability / Prompt) confirmada por ti." },
  F2: { label: FASE_LABEL.F2, goal: "Diseña la intervención sobre la causa detectada y formula una hipótesis falsable." },
  F3: { label: FASE_LABEL.F3, goal: "Dimensiona el experimento: métrica de éxito (outcome), tamaño/duración y criterio de stop." },
  F4: { label: FASE_LABEL.F4, goal: "Despliega y observa: experimento corriendo y tracking confirmado. No leas resultados antes del criterio de stop." },
  F5: { label: FASE_LABEL.F5, goal: "Mide, decide (escalar/matar/iterar) y destila el patrón nombrado." },
};

function renderPhaseGuide(cycle) {
  const el = document.getElementById("phaseGuide");
  if (!el) return;
  if (!cycle || (cycle.estado && cycle.estado !== "activo")) { el.hidden = true; el.innerHTML = ""; return; }
  const phase = cycle.fase_actual ?? cycle.activePhase ?? "F0";
  const meta = PHASE_META[phase];
  if (!meta) { el.hidden = true; return; }
  let reqs = [];
  try { reqs = getGateRequirements(cycle, phase); } catch { reqs = []; }
  const done = reqs.filter((r) => r.met).length;
  const items = reqs.map((r) =>
    `<li class="${r.met ? "is-met" : ""}"><span class="pg-check">${r.met ? "✓" : "○"}</span>${escapeHtml(r.message.replace(/^Falta (la |el |confirmar el )?/i, ""))}</li>`
  ).join("");
  // F1 needs ≥2 convergent evidence sources; offer a shortcut into the fields.
  const evidenceAction = phase === "F1"
    ? `<button type="button" class="pg-action" id="pgAddEvidence">+ Adjuntar evidencia</button>`
    : "";
  el.hidden = false;
  el.innerHTML = `
    <div class="pg-head"><strong>${escapeHtml(phase)} · ${escapeHtml(meta.label)}</strong><span class="pg-count">${done}/${reqs.length} para cerrar el gate</span></div>
    <p class="pg-goal">${escapeHtml(meta.goal)}</p>
    ${reqs.length ? `<ul class="pg-checklist">${items}</ul>` : ""}
    ${evidenceAction}`;
  document.getElementById("pgAddEvidence")?.addEventListener("click", focusEvidenceField);
}

// F1 evidence shortcut: switch to the Brief, then scroll + focus + highlight the
// first of the two evidence fields that still needs action — empty, or filled
// by la IA but pending confirmación humana (el gate exige ambas cosas).
function focusEvidenceField() {
  setDeliverable("brief");
  const primary = document.getElementById("briefEvidence");
  const second = document.getElementById("secondSource");
  const needsAction = (el) => !el || !(el.dataset.value || "").trim() || el.classList.contains("is-pending-confirm");
  const target = needsAction(primary) ? primary : (needsAction(second) ? second : primary);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  restartAnimation(target, "fillpop");
  target.focus?.();
}

function renderActiveCycle() {
  const cycle = getCurrentCycle();
  const closePanel = document.getElementById("closePanel");
  if (!cycle) {
    activeCycleCard.innerHTML = `<p class="muted">Sin ciclo activo</p>`;
    activeCycleName.textContent = "Sin ciclo activo";
    activePhaseLabel.textContent = "—";
    activePhaseNote.textContent = "";
    briefCycleTitle.textContent = "[CONFIRMAR]";
    if (closePanel) closePanel.hidden = true;
    renderPhaseGuide(null);
    return;
  }
  const phases = cycle.phases ?? phaseSeed;
  const active = cycle.fase_actual ?? cycle.activePhase ?? "F0";
  const activePhaseObj = phases.find((p) => p.key === active) ?? phases[0];
  const isClosed = cycle.estado !== "activo";
  activeCycleCard.innerHTML = `<h2>${escapeHtml(cycle.title)}</h2>${isClosed ? `<span class="cycle-closed-badge">${escapeHtml(cycle.estado === "cerrado" ? "Cerrado" : "Descartado")}</span>` : ""}`;
  activeCycleName.textContent = cycle.title;
  activePhaseLabel.textContent = `${activePhaseObj.key} · ${activePhaseObj.label}`;
  activePhaseNote.textContent = activePhaseObj.note || "gate abierto";
  briefCycleTitle.textContent = cycle.title;
  // Show close panel only in F5 and only for active cycles
  if (closePanel) closePanel.hidden = !(active === "F5" && cycle.estado === "activo");
  // Advance button: shown in any active phase F0–F4 (F5 uses the close panel).
  // The server validates the gate; label points to the next phase.
  const advanceBtn = document.querySelector("#advancePhaseBtn");
  if (advanceBtn) {
    const order = ["F0", "F1", "F2", "F3", "F4", "F5"];
    const idx = order.indexOf(active);
    const showAdvance = cycle.estado === "activo" && idx >= 0 && idx < 5;
    advanceBtn.hidden = !showAdvance;
    if (showAdvance) advanceBtn.textContent = `Avanzar a ${order[idx + 1]} →`;
  }
  // Populate brief panel from real cycle data
  loadBriefFromCycle(cycle);
  renderPhaseGuide(cycle);
  syncDeliverableToPhase(cycle, active);
  renderExperimentStatus(cycle, active);
  // Grey out chat input for closed/discarded cycles
  chatInput?.classList.toggle("is-readonly", isClosed);
  if (messageInput) messageInput.placeholder = isClosed ? "Ciclo cerrado — solo lectura" : "";
  if (placeholder) placeholder.style.display = isClosed ? "none" : "";
  // Show CTA when cycle is closed and message stream has no closed-note yet
  const readonlyBanner = document.getElementById("readonlyBanner");
  if (readonlyBanner) readonlyBanner.hidden = !isClosed;
  renderClosedCycleNote(cycle);
}

// PR-4 · Reuse confirmation. Reusing a pattern seeds a brand-new F0 cycle with
// the pattern's sub-perfil/causa/hipótesis pre-filled but UNCONFIRMED — reuse
// never skips a phase or a gate. Make that explicit before creating the cycle.
function openReuseConfirm(patternId) {
  const p = patterns.find((x) => x.id === patternId);
  if (!p) return;
  const overlay = openModal("reuseConfirm", `
    <div class="export-modal-card reuse-confirm-card">
      <p class="eyebrow">Reutilizar patrón</p>
      <h2 class="pd-title">${escapeHtml(p.nombre ?? "Sin nombre")}</h2>
      <p class="reuse-confirm-msg">Esto crea un <strong>ciclo nuevo en F0</strong>, sembrado con el sub-perfil, la causa y la hipótesis de este patrón — pero <strong>sin confirmar</strong>. Reutilizar no salta ninguna fase ni gate: tendrás que re-confirmar el contexto antes de avanzar.</p>
      <p class="reuse-confirm-note">No se puede deshacer, pero puedes borrar el ciclo después.</p>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-reuse="cancel">Cancelar</button>
        <button type="button" class="primary-action" data-reuse="create">Crear ciclo</button>
      </div>
    </div>`);
  overlay.querySelector('[data-reuse="cancel"]')?.addEventListener("click", overlay.close);
  overlay.querySelector('[data-reuse="create"]')?.addEventListener("click", () => { overlay.close(); reusePattern(p.id); });
}

async function reusePattern(patternId) {
  try {
    const res = await apiFetch(`/api/patterns/${patternId}/reuse`, { method: "POST", headers: authHeaders() });
    if (!res.ok) return;
    const { newCycle } = await res.json();
    // Refresh patterns to get updated veces_reutilizado
    await loadPatterns();
    cycles.push(newCycle);
    currentCycleId = newCycle.id;
    renderCyclesList();
    renderActiveCycle();
    renderStepper();
    renderBriefState();
    renderMessages([]);
    renderReuseBanner(newCycle);
    addAiNote(`Reutilizando patrón: "${escapeHtml(newCycle.title)}". Confirma el contexto y ajusta la hipótesis antes de avanzar.`);
    setView("workspace");
  } catch {
    console.warn("No se pudo reutilizar el patrón.");
  }
}

async function closeCycle() {
  const closureDecision = document.getElementById("closureDecision");
  const closureLearning = document.getElementById("closureLearning");
  const closureDelta = document.getElementById("closureDelta");
  const closureActividad = document.getElementById("closureActividad");
  const closureOutcome = document.getElementById("closureOutcome");
  const closureChurn = document.getElementById("closureChurn");
  const patternName = document.getElementById("patternName");
  const patternType = document.getElementById("patternType");
  const learning = closureLearning?.value.trim() ?? "";
  const pattern_name = patternName?.value.trim() ?? "";
  if (!learning || !pattern_name) {
    alert("Completa el aprendizaje y el nombre del patrón para cerrar el ciclo.");
    return;
  }
  if (!confirm(`¿Cerrar el ciclo y crear el patrón "${pattern_name}"? Esta acción no se puede deshacer.`)) return;
  const closeCycleBtn = document.getElementById("closeCycleButton");
  if (closeCycleBtn) { closeCycleBtn.disabled = true; closeCycleBtn.textContent = "Guardando…"; }
  try {
    const res = await apiFetch(`/api/cycles/${currentCycleId}/close`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        resultado_cierre: closureDecision?.value ?? "escalar",
        decision: closureDecision?.value ?? "escalar",
        learning,
        delta: closureDelta?.value.trim() ?? null,
        actividad: closureActividad?.value.trim() || null,
        outcome: closureOutcome?.value.trim() || null,
        churn_por_nivel: closureChurn?.value.trim() || null,
        pattern_name,
        tipo: patternType?.value ?? "patron",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Error al cerrar el ciclo.");
      return;
    }
    const data = await res.json();
    const { cycle, pattern, iterated, peeking } = data;
    if (peeking) showToast("Cierre temprano (peeking): leíste el experimento antes del criterio de stop. Quedó registrado como riesgo.", true);
    cycles = cycles.map((c) => (c.id === cycle.id ? cycle : c));
    if (iterated) {
      // Iteration loop: cycle went back to F1 instead of closing.
      renderCyclesList();
      renderActiveCycle();
      renderStepper();
      renderIterationBanner(cycle.iterationCount ?? 2);
      addAiNote(`Iteración ${cycle.iterationCount ?? 2} — de vuelta en F1 · ${FASE_LABEL.F1} para re-diagnosticar.`);
      return;
    }
    patterns.push(pattern);
    renderCyclesList();
    renderPatternsList();
    renderActiveCycle();
    renderStepper();
    addAiNote(`Ciclo cerrado. Patrón "${escapeHtml(pattern.nombre)}" creado en la Biblioteca.`);
    showToast(`Patrón "${pattern.nombre}" guardado en la Biblioteca.`);
    setView("home");
  } catch {
    showToast("No se pudo cerrar el ciclo. Intenta de nuevo.", true);
  } finally {
    // Siempre restaura el botón — antes, un error del servidor (res.ok===false,
    // ej. 409 por ciclo ya cerrado en otra pestaña) lo dejaba atascado en
    // "Guardando…" y deshabilitado para siempre, sin forma de reintentar.
    if (closeCycleBtn) { closeCycleBtn.disabled = false; closeCycleBtn.textContent = "Cerrar ciclo y crear patrón"; }
  }
}

// --- Patterns ---
async function loadPatterns() {
  if (currentView === "library") patternsList.innerHTML = skeletonCards(3);
  try {
    const res = await apiFetch("/api/patterns", { headers: authHeaders() });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    patterns = await res.json();
    if (currentView === "library") renderPatternsList();
  } catch {
    if (currentView === "library") {
      // No usar onclick="loadPatterns()" inline: ver nota en loadCycles().
      patternsList.innerHTML = `<p class="error-state">No se pudieron cargar los patrones. <button type="button" data-retry="patterns">Reintentar</button></p>`;
      patternsList.querySelector("[data-retry]")?.addEventListener("click", () => loadPatterns());
    }
  }
}

const causeLabelEs = (c) => c === "M" ? "Motivación" : c === "A" ? "Ability" : c === "P" ? "Prompt" : c;

// A4 · unified library filtering state + facets
const libFilters = { tipoCausa: "all", sub: "", level: "", test: "", search: "" };
function populateLibraryFacets() {
  const subs = [...new Set(patterns.map((p) => p.sub_perfil).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const levels = [...new Set(patterns.map((p) => p.transicion).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const tests = [...new Set(patterns.map((p) => p.test_elegido).filter(Boolean))]
    .sort((a, b) => TEST_ESCALERA.indexOf(a) - TEST_ESCALERA.indexOf(b));
  // Rebuild options fully (placeholder + values) — no querySelector, so no
  // possible null dereference.
  const fill = (sel, placeholder, values, cur, labelFn) => {
    if (!sel) return;
    const opts = [`<option value="">${placeholder}</option>`].concat(
      values.map((v) => `<option value="${escapeHtml(v)}"${v === cur ? " selected" : ""}>${escapeHtml(labelFn(v))}</option>`)
    );
    sel.innerHTML = opts.join("");
  };
  fill(document.getElementById("patternSubProfile"), "Sub-perfil", subs, libFilters.sub, subPerfilLabel);
  fill(document.getElementById("patternLevel"), "Nivel cognitivo", levels, libFilters.level, transitionLabel);
  fill(document.getElementById("patternTest"), "Test (F3)", tests, libFilters.test, (v) => TEST_ELEGIDO_LABEL[v] ?? v);
}
function applyLibraryFilters() {
  const { tipoCausa, sub, level, test, search } = libFilters;
  let list = patterns;
  if (tipoCausa === "patron" || tipoCausa === "anti_patron") list = list.filter((p) => p.tipo === tipoCausa);
  else if (["m", "a", "p"].includes(tipoCausa)) list = list.filter((p) => (p.causa ?? "").toUpperCase() === tipoCausa.toUpperCase());
  if (sub) list = list.filter((p) => p.sub_perfil === sub);
  if (level) list = list.filter((p) => p.transicion === level);
  if (test) list = list.filter((p) => p.test_elegido === test);
  if (search) list = list.filter((p) =>
    [p.nombre, p.aprendizaje, p.sub_perfil, p.causa, p.transicion, p.test_elegido].some((x) => (x ?? "").toLowerCase().includes(search)));
  renderPatternsList(list);
}

function renderPatternsList(list = patterns) {
  populateLibraryFacets();
  if (!list.length) {
    patternsList.innerHTML = `<p class="empty-library">${patterns.length ? "Sin patrones para este filtro." : `Aquí aparecerán los aprendizajes del equipo. Para crear el primero, lleva un ciclo hasta F5 · ${FASE_LABEL.F5} y ciérralo con un aprendizaje.`}</p>`;
    return;
  }
  patternsList.innerHTML = list
    .map((p) => {
      const isAnti = p.tipo === "anti_patron";
      const since = p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "";
      const chips = [
        p.causa ? `<span class="chip cause-chip ${escapeHtml(p.causa)}">${escapeHtml(causeLabelEs(p.causa))}</span>` : "",
        p.sub_perfil ? `<span class="chip">${escapeHtml(subPerfilLabel(p.sub_perfil))}</span>` : "",
        p.transicion ? `<span class="chip">${escapeHtml(transitionLabel(p.transicion))}</span>` : "",
      ].join("");
      return `
        <article class="pattern-card" data-pattern-open="${escapeHtml(p.id)}" role="button" tabindex="0">
          <span class="pattern-badge ${isAnti ? "anti_patron" : "patron"}">${isAnti ? "Anti-patrón" : "Patrón"}</span>
          <h2>${escapeHtml(p.nombre ?? p.name ?? "Sin nombre")}</h2>
          ${p.aprendizaje ? `<p class="pattern-learning">${escapeHtml(p.aprendizaje)}</p>` : ""}
          ${chips ? `<div class="chips">${chips}</div>` : ""}
          ${p.delta_metrica ? `<span class="delta">${escapeHtml(p.delta_metrica)}</span>` : ""}
          <footer>
            <span class="reuse-count">${p.veces_reutilizado ?? 0}× reutilizado</span>
            <span>${escapeHtml(since)}</span>
            <button class="reuse-btn" type="button" data-pattern-id="${escapeHtml(p.id)}">Reusar →</button>
          </footer>
        </article>`;
    })
    .join("");

  patternsList.querySelectorAll(".reuse-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openReuseConfirm(btn.dataset.patternId); });
  });
  patternsList.querySelectorAll("[data-pattern-open]").forEach((card) => {
    card.addEventListener("click", () => openPatternDetail(card.dataset.patternOpen));
  });
}

// A4 · pattern detail modal
function openPatternDetail(id) {
  const p = patterns.find((x) => x.id === id);
  if (!p) return;
  const isAnti = p.tipo === "anti_patron";
  const row = (label, val) => val ? `<div class="pd-row"><span class="section-label">${escapeHtml(label)}</span><p>${escapeHtml(val)}</p></div>` : "";
  const overlay = openModal("patternDetail", `
    <div class="export-modal-card pattern-detail-card">
      <span class="pattern-badge ${isAnti ? "anti_patron" : "patron"}">${isAnti ? "Anti-patrón" : "Patrón"}</span>
      <h2 class="pd-title">${escapeHtml(p.nombre ?? "Sin nombre")}</h2>
      <div class="chips">
        ${p.causa ? `<span class="chip cause-chip ${escapeHtml(p.causa)}">${escapeHtml(causeLabelEs(p.causa))}</span>` : ""}
        ${p.sub_perfil ? `<span class="chip">${escapeHtml(subPerfilLabel(p.sub_perfil))}</span>` : ""}
        ${p.transicion ? `<span class="chip">${escapeHtml(transitionLabel(p.transicion))}</span>` : ""}
      </div>
      ${row("Qué aprendimos", p.aprendizaje)}
      ${row("Delta de métrica", p.delta_metrica)}
      ${row("Evidencia", p.evidencia)}
      <div class="pd-meta"><span>${p.veces_reutilizado ?? 0}× reutilizado</span>${p.ciclo_origen_id ? `<button class="inline-link" type="button" data-pd-origin="${escapeHtml(p.ciclo_origen_id)}">Ver ciclo de origen →</button>` : ""}</div>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-pd="close">Cerrar</button>
        <button type="button" class="primary-action" data-pd="reuse">Reusar patrón</button>
      </div>
    </div>`);
  overlay.querySelector('[data-pd="close"]')?.addEventListener("click", overlay.close);
  overlay.querySelector('[data-pd="reuse"]')?.addEventListener("click", () => { overlay.close(); openReuseConfirm(p.id); });
  const origin = overlay.querySelector("[data-pd-origin]");
  if (origin) origin.addEventListener("click", () => {
    overlay.close();
    const c = cycles.find((x) => x.id === p.ciclo_origen_id);
    if (c) { currentCycleId = c.id; renderActiveCycle(); renderStepper(); loadMessages(c.id); setView("workspace"); }
    else showToast("El ciclo de origen no está disponible.");
  });
}

// --- View ---
function setView(view) {
  currentView = view;
  workspace.dataset.view = view;
  homeView.hidden = view !== "home";
  workspaceView.hidden = view !== "workspace";
  libraryView.hidden = view !== "library";
  contextView.hidden = view !== "context";
  if (analyticsView) analyticsView.hidden = view !== "analytics";
  if (view === "context" && !contextLoaded) loadContextDocuments();
  if (view === "context") loadDecisions();
  if (view === "library") renderPatternsList();
  if (view === "analytics") loadAnalytics();
}

// --- PR-M2 · Ledger de decisiones y aprendizajes ---
async function loadDecisions() {
  const list = document.getElementById("decisionsList");
  if (!list) return;
  try {
    const res = await apiFetch("/api/decisions", { headers: authHeaders() });
    if (!res.ok) return;
    const items = await res.json();
    list.innerHTML = items.length
      ? items.map((d) => {
          const fecha = d.fecha ? new Date(d.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "";
          return `<div class="decision-item"><span class="decision-meta"><span class="decision-tipo">${escapeHtml(d.tipo ?? "aprendizaje")}</span>${escapeHtml(fecha)}</span><p>${escapeHtml(d.texto ?? "")}</p></div>`;
        }).join("")
      : `<p class="loading-state">Aún no hay decisiones ni aprendizajes. Se registran al cerrar ciclos o con "Guardar aprendizaje".</p>`;
  } catch { /* silencioso */ }
}

function openLearningModal() {
  const overlay = openModal("learningModal", `
    <div class="export-modal-card">
      <p class="eyebrow">Guardar aprendizaje</p>
      <h2 class="pd-title">Añadir a la memoria del equipo</h2>
      <p class="reuse-confirm-msg">Queda en el ledger durable y el asistente lo lee en todos los ciclos. Úsalo para aprendizajes o decisiones que no vienen de cerrar un ciclo.</p>
      <label class="nc-label" for="learningTipo">Tipo</label>
      <select id="learningTipo" class="nc-input">
        <option value="aprendizaje">Aprendizaje</option>
        <option value="decision">Decisión</option>
        <option value="supuesto_validado">Supuesto validado</option>
        <option value="supuesto_invalidado">Supuesto invalidado</option>
      </select>
      <label class="nc-label" for="learningTexto">¿Qué aprendimos / decidimos?</label>
      <textarea id="learningTexto" class="nc-textarea" rows="4" placeholder="Ej: El Empleado Aspirante necesita prueba social antes de la 1ª compra — la fricción no era el problema."></textarea>
      <p id="learningError" class="login-error" hidden></p>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-lm="cancel">Cancelar</button>
        <button type="button" class="primary-action" data-lm="save">Guardar</button>
      </div>
    </div>`);
  const q = (s) => overlay.querySelector(s);
  q('[data-lm="cancel"]')?.addEventListener("click", overlay.close);
  q('[data-lm="save"]')?.addEventListener("click", async () => {
    const texto = (q("#learningTexto")?.value ?? "").trim();
    if (!texto) { const e = q("#learningError"); if (e) { e.textContent = "Escribe el aprendizaje."; e.hidden = false; } return; }
    try {
      const res = await apiFetch("/api/decisions", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ texto, tipo: q("#learningTipo")?.value || "aprendizaje", cycleId: currentCycleId || null }),
      });
      if (!res.ok) throw new Error();
      overlay.close();
      showToast("Aprendizaje guardado en la memoria del equipo ✓");
      loadDecisions();
    } catch { showToast("No se pudo guardar el aprendizaje.", true); }
  });
  setTimeout(() => q("#learningTexto")?.focus(), 30);
}

// --- Analytics (Fase 5) ---
async function loadAnalytics() {
  if (!analyticsGrid) return;
  analyticsGrid.innerHTML = `<p class="loading-state">Cargando métricas…</p>`;
  try {
    const res = await apiFetch("/api/analytics", { headers: authHeaders() });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    renderAnalytics(await res.json());
  } catch {
    // No usar onclick="loadAnalytics()" inline: ver nota en loadCycles().
    analyticsGrid.innerHTML = `<p class="error-state">No se pudieron cargar las métricas. <button type="button" data-retry="analytics">Reintentar</button></p>`;
    analyticsGrid.querySelector("[data-retry]")?.addEventListener("click", () => loadAnalytics());
  }
}

function renderAnalytics(a) {
  // DOM APIs (sin innerHTML) para no disparar el sink de "código arbitrario".
  const span = (cls, text) => { const s = document.createElement("span"); s.className = cls; s.textContent = String(text); return s; };
  const tile = (drill, label, value, hint) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stat-tile";
    btn.dataset.drill = drill;
    btn.setAttribute("aria-expanded", "false");
    btn.append(span("stat-value", value), span("stat-label", label));
    if (hint) btn.append(span("stat-hint", hint));
    btn.append(span("stat-drill-hint", "Ver detalle"));
    btn.addEventListener("click", () => openDrill(drill, btn));
    return btn;
  };
  analyticsGrid.replaceChildren(
    tile("ciclos_totales", "Ciclos totales", a.cycles?.total ?? 0, `${a.cycles?.active ?? 0} en curso · ${a.cycles?.closed ?? 0} cerrados`),
    tile("rigor_gates", "Rigor de gates", a.gates?.rigor != null ? `${a.gates.rigor}%` : "—", `${a.gates?.passed ?? 0} limpios · ${a.gates?.skippedWithRisk ?? 0} con riesgo`),
    tile("iteraciones", "Iteraciones", a.iterations ?? 0, "ciclos que re-diagnosticaron"),
    tile("patrones", "Patrones", a.patterns?.total ?? 0, `${a.patterns?.reused ?? 0} reutilizados`),
    tile("rechazos_f0", "Rechazos F0", a.behavior?.rejected ?? 0, "arranques por feature evitados"),
    tile("mensajes_chat", "Mensajes de chat", a.chat?.messages ?? 0, `${a.chat?.briefExtractions ?? 0} extracciones de brief`),
    tile("exports", "Exports", a.exports?.attempted ?? 0, `${a.exports?.withAssumptions ?? 0} con supuestos`),
  );
  const panel = document.createElement("div");
  panel.id = "drillPanel";
  panel.className = "drill-panel";
  panel.hidden = true;
  analyticsGrid.append(panel);
}

let drillActiveKey = null;
async function openDrill(key, tile) {
  const panel = document.getElementById("drillPanel");
  if (!panel) return;
  const tiles = analyticsGrid.querySelectorAll("[data-drill]");
  // Toggle: segundo click en el mismo tile cierra.
  if (drillActiveKey === key) {
    drillActiveKey = null;
    panel.hidden = true;
    panel.replaceChildren();
    tiles.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-expanded", "false"); });
    return;
  }
  drillActiveKey = key;
  tiles.forEach((t) => {
    const on = t.dataset.drill === key;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-expanded", String(on));
  });
  // Mueve el panel justo debajo del tile clicado (misma fila visual).
  tile.after(panel);
  panel.hidden = false;
  panel.replaceChildren(buildDrillNode({ loading: true }));
  try {
    const res = await apiFetch(`/api/analytics/drill?metric=${encodeURIComponent(key)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    if (drillActiveKey !== key) return; // el usuario cambió de tile mientras cargaba
    panel.replaceChildren(buildDrillNode(data));
  } catch {
    panel.replaceChildren(buildDrillNode({ error: true }));
  }
}

// Construye el panel de drill con DOM APIs (sin innerHTML de datos dinámicos).
function buildDrillNode(data) {
  const wrap = document.createElement("div");
  wrap.className = "drill-inner";
  if (data.loading) {
    const p = document.createElement("p");
    p.className = "loading-state";
    p.textContent = "Cargando…";
    wrap.appendChild(p);
    return wrap;
  }
  if (data.error) {
    const p = document.createElement("p");
    p.className = "error-state";
    p.textContent = "No se pudo cargar el detalle.";
    wrap.appendChild(p);
    return wrap;
  }
  const head = document.createElement("p");
  head.className = "drill-title";
  head.textContent = data.label ?? "Detalle";
  wrap.appendChild(head);
  if (!data.items?.length) {
    const empty = document.createElement("p");
    empty.className = "drill-empty";
    empty.textContent = "Ningún ciclo compone este número todavía.";
    wrap.appendChild(empty);
    return wrap;
  }
  const list = document.createElement("ul");
  list.className = "drill-list";
  data.items.forEach((item) => {
    const li = document.createElement("li");
    const isClickable = item.type === "cycle" || item.type === "pattern";
    const row = document.createElement(isClickable ? "button" : "div");
    row.className = `drill-item drill-item--${item.type}`;
    if (isClickable) {
      row.type = "button";
      row.addEventListener("click", () => openDrillTarget(item));
    }
    const title = document.createElement("span");
    title.className = "drill-item-title";
    title.textContent = item.title ?? "";
    row.appendChild(title);
    if (item.subtitle) {
      const sub = document.createElement("span");
      sub.className = "drill-item-sub";
      sub.textContent = item.subtitle;
      row.appendChild(sub);
    }
    li.appendChild(row);
    list.appendChild(li);
  });
  wrap.appendChild(list);
  return wrap;
}

function openDrillTarget(item) {
  if (item.type === "cycle") {
    const c = cycles.find((x) => x.id === item.id);
    if (!c) { showToast("Ese ciclo ya no está disponible."); return; }
    currentCycleId = c.id;
    renderActiveCycle(); renderStepper(); loadMessages(c.id); setView("workspace");
  } else if (item.type === "pattern") {
    const p = patterns.find((x) => x.id === item.id);
    if (p) openPatternDetail(p.id);
    else { setView("library"); showToast("Abre el patrón desde la Biblioteca."); }
  }
}

// --- Context ---
async function loadContextDocuments() {
  contextPendingBanner.textContent = "Cargando contexto…";
  try {
    const response = await fetch("/api/context");
    if (!response.ok) throw new Error("No se pudo cargar el contexto.");
    const data = await response.json();
    contextLoaded = true;
    renderContextDocuments(data);
  } catch (error) {
    contextPendingBanner.textContent = `${error.message} Revisa que el backend Node esté corriendo.`;
  }
}

// B1 · editable table renderer for `kind: table` docs (cognitive evolution).
function contextTableHtml(doc) {
  const canEdit = true; // herramienta de un solo usuario
  const head = doc.table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = doc.table.rows.map((row, ri) => `
    <tr>${row.map((cell, ci) => {
      const pending = /\[CONFIRMAR[^\]]*\]/.test(cell) ? " is-pending" : "";
      if (ci === 0) return `<th scope="row" class="ct-level${pending}">${escapeHtml(cell)}</th>`;
      return `<td class="ct-cell${pending}"><div class="ct-editable" ${canEdit ? 'contenteditable="plaintext-only"' : ""} data-row="${ri}" data-col="${ci}">${escapeHtml(cell)}</div></td>`;
    }).join("")}</tr>`).join("");
  return `<div class="ct-scroll"><table class="cognitive-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderContextDocuments(data) {
  // Global pending counter with per-doc anchors (click → jump to the doc).
  const pendingDocs = data.documents.filter((doc) => doc.pendingCount > 0);
  contextPendingBanner.innerHTML = `
    <span>${data.pendingCount} campos pendientes [CONFIRMAR] — la IA los tratará como supuestos.</span>
    ${pendingDocs.map((doc) => `<button type="button" class="pending-chip" data-goto-doc="${escapeHtml(doc.id)}">${escapeHtml(doc.title)} · ${doc.pendingCount}</button>`).join("")}`;
  contextPendingBanner.querySelectorAll("[data-goto-doc]").forEach((chip) => {
    chip.addEventListener("click", () => document.getElementById(`doc-${chip.dataset.gotoDoc}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });

  // TOC with one anchor per section.
  const toc = document.getElementById("contextToc");
  if (toc) {
    toc.innerHTML = data.documents
      .map((doc) => `<a href="#doc-${escapeHtml(doc.id)}">${escapeHtml(doc.title)}${doc.pendingCount ? ` <span class="toc-pending">${doc.pendingCount}</span>` : ""}</a>`)
      .join("");
  }

  contextDocuments.innerHTML = data.documents
    .map((doc) => `
      <section class="context-document" id="doc-${escapeHtml(doc.id)}" data-context-id="${escapeHtml(doc.id)}">
        <header><h2>${escapeHtml(doc.title)}</h2><span>v${escapeHtml(String(doc.version))} · ${escapeHtml(String(doc.pendingCount))} pendientes</span></header>
        ${doc.table
          ? `<p class="ct-intro">${escapeHtml(doc.content)}</p>${contextTableHtml(doc)}`
          : `<textarea aria-label="Editar ${escapeHtml(doc.title)}">${escapeHtml(doc.content)}</textarea>`}
        <footer><span>Actualizado por ${escapeHtml(doc.updatedBy)} · ${escapeHtml(new Date(doc.updatedAt).toLocaleString("es-CO"))}</span><button class="secondary-action" type="button" data-save-context>Guardar ✓</button></footer>
      </section>`)
    .join("");
  contextDocuments.querySelectorAll("[data-save-context]").forEach((button) => {
    button.addEventListener("click", () => saveContextDocument(button.closest("[data-context-id]"), data));
  });
}

async function saveContextDocument(section, data) {
  const id = section.dataset.contextId;
  const button = section.querySelector("[data-save-context]");
  const doc = data?.documents?.find((x) => x.id === id);
  // Table docs: collect the edited cells back into { columns, rows }.
  let patch;
  if (doc?.table) {
    const rows = doc.table.rows.map((row) => [...row]);
    section.querySelectorAll(".ct-editable").forEach((cell) => {
      rows[Number(cell.dataset.row)][Number(cell.dataset.col)] = cell.textContent.trim();
    });
    patch = { table: { columns: doc.table.columns, rows }, reason: "Edición de la tabla de evolución cognitiva" };
  } else {
    patch = { content: section.querySelector("textarea")?.value ?? "", reason: "Edición desde Contexto Dropi" };
  }
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const response = await fetch(`/api/context/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error ${response.status}`);
    }
    contextLoaded = false;
    showToast("Contexto guardado.");
    await loadContextDocuments();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    // Restaura la etiqueta real del botón (index.html: "Guardar ✓"). Tras un
    // error, el botón se quedaba diciendo "Guardar como admin" — una acción
    // que no existe — en vez de volver a su estado normal.
    button.disabled = false;
    button.textContent = "Guardar ✓";
  }
}

// --- Brief / deliverable ---
// A2 · Auto-switch the deliverable panel by phase (Brief for F0–F2, Experiment
// Card for F3–F4). Only switches when the phase actually changes, so a manual
// toggle isn't fought on every re-render.
let _lastDeliverablePhase = null;
function syncDeliverableToPhase(cycle, phase) {
  if (!cycle) { _lastDeliverablePhase = null; return; }
  if (phase === _lastDeliverablePhase) return;
  _lastDeliverablePhase = phase;
  const wants = (phase === "F3" || phase === "F4") ? "experiment" : "brief";
  setDeliverable(wants);
}

// Extract a whole number of days from a free-text duration ("14 días",
// "2 semanas", "10 d"). Returns null if none can be read.
function parseDurationDays(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(sem|week|d[ií]a|d\b|d\s)/);
  if (!m) { const n = s.match(/\d+/); return n ? Number(n[0]) : null; }
  const n = Number(m[1].replace(",", "."));
  return /sem|week/.test(m[2]) ? Math.round(n * 7) : Math.round(n);
}

// A2 + PR-3 · F4 "live": a data-driven run block (día X/Y, muestra, treatment vs
// baseline) plus a "Confirmar tracking" action while the experiment runs.
function renderExperimentStatus(cycle, phase) {
  const el = document.getElementById("experimentStatus");
  if (!el) return;
  const exp = cycle?.experiment ?? {};
  const val = (v) => v?.value ?? (typeof v === "string" ? v : null);
  if (phase === "F4" && cycle?.estado === "activo") {
    el.classList.add("is-live");
    const sample = val(exp.tamano_muestra);
    const totalD = parseDurationDays(val(exp.duracion));
    const startedAt = cycle.experiment?.started_at ?? exp.started_at;
    let dayD = null;
    if (startedAt) dayD = Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000) + 1);
    const treatment = val(exp.treatment_pct);
    const baseline = val(exp.baseline_pct);
    // Fuente de verdad: el gate F4 real (mismo criterio que bloquea F4→F5), no
    // un flag propio — evita que el botón muestre "confirmado" mientras el
    // gate real sigue pidiéndolo.
    const tracking = getGateRequirements(cycle, "F4").find((r) => r.key === "trackingConfirmed")?.met ?? false;
    const bits = [
      dayD ? `día ${dayD}${totalD ? `/${totalD}` : ""}` : "",
      sample ? `muestra ${escapeHtml(sample)}` : "",
      (treatment != null && baseline != null) ? `${escapeHtml(String(treatment))} vs ${escapeHtml(String(baseline))} (baseline)` : "",
    ].filter(Boolean).join(" · ");
    el.innerHTML = `<div class="exp-live-head"><span></span>Corriendo${bits ? ` · ${bits}` : ""}</div>` +
      (tracking
        ? `<p class="exp-tracking-ok">✓ Tracking confirmado</p>`
        : `<button type="button" class="secondary-action" id="confirmTrackingBtn">Confirmar tracking</button>`);
    document.getElementById("confirmTrackingBtn")?.addEventListener("click", confirmTracking);
  } else if (phase === "F5" || cycle?.estado === "cerrado") {
    el.classList.remove("is-live");
    el.innerHTML = `<span></span>Concluido`;
  } else {
    el.classList.remove("is-live");
    el.innerHTML = `<span></span>Borrador · listo para F3`;
  }
}

// Escribe el campo que el gate F4 realmente lee (cycle.trackingConfirmed,
// top-level) — no un flag anidado en experiment que el gate ignora.
async function confirmTracking() {
  if (!currentCycleId) return;
  const patch = { trackingConfirmed: true };
  cycles = cycles.map((c) => c.id === currentCycleId ? { ...c, ...patch } : c);
  renderExperimentStatus(getCurrentCycle(), getActivePhase());
  await updateCycle(patch);
  showToast("Tracking confirmado. El experimento queda instrumentado.");
}

function setDeliverable(next) {
  deliverable = next;
  briefBody.hidden = next !== "brief";
  experimentBody.hidden = next !== "experiment";
  if (specBody) specBody.hidden = next !== "spec";
  briefSwitch.classList.toggle("active", next === "brief");
  experimentSwitch.classList.toggle("active", next === "experiment");
  specSwitch?.classList.toggle("active", next === "spec");
  const DELIVERABLE_TITLE = { brief: "Intervention Brief", experiment: "Experiment Card", spec: "Spec conductual" };
  deliverableTitle.textContent = DELIVERABLE_TITLE[next] ?? DELIVERABLE_TITLE.brief;
  progressText.textContent = next === "brief" ? `${filled} / 11 campos` : "0 / 9 campos";
  progressFill.style.width = next === "brief" ? `${Math.round((filled / 11) * 100)}%` : "0%";
}

function applyTheme(theme) {
  workspace.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  themeToggle.textContent = theme === "dark" ? "☀" : "☾";
}

// B6 · collapsible rail (icon-only 56px) with persisted state.
const RAIL_KEY = "dropi.rail.collapsed";
const railToggle = document.querySelector("#railToggle");
function applyRailCollapsed(collapsed) {
  workspace.classList.toggle("rail-collapsed", collapsed);
  if (railToggle) {
    railToggle.textContent = collapsed ? "»" : "«";
    railToggle.setAttribute("aria-pressed", String(collapsed));
    railToggle.setAttribute("aria-label", collapsed ? "Expandir navegación" : "Colapsar navegación");
    railToggle.title = railToggle.getAttribute("aria-label");
  }
}
railToggle?.addEventListener("click", () => {
  const collapsed = !workspace.classList.contains("rail-collapsed");
  localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0");
  applyRailCollapsed(collapsed);
});

// --- Stepper ---
function renderStepper(pulseKey = null) {
  const phases = getPhases();
  const active = getActivePhase();

  phaseStepper.innerHTML = phases
    .map((phase, index) => {
      const statusMark = phase.state === "done" ? "✓" : index;
      const skipped = phase.skipped ? '<span class="skipped-pin" aria-label="gate saltado"></span>' : "";
      const note = phase.note ? `<span class="phase-note">${escapeHtml(phase.note)}</span>` : "";
      const pulse = phase.key === pulseKey ? " just-advanced" : "";
      return `
        <button class="phase-row ${phase.state} ${phase.skipped ? "skipped" : ""}${pulse}" type="button" data-phase="${escapeHtml(phase.key)}">
          <span class="phase-dot">${statusMark}</span>
          <span class="phase-copy">
            <span class="phase-label-line"><strong>${escapeHtml(phase.key)} ${escapeHtml(phase.label)}</strong>${skipped}</span>
            ${note}
          </span>
        </button>`;
    })
    .join("");

  const selected = phases.find((p) => p.key === active) ?? phases[0];
  if (selected) {
    activePhaseLabel.textContent = `${selected.key} · ${selected.label}`;
    activePhaseNote.textContent = selected.note || "";
  }
  renderPhaseBar(phases, active, selected);
}

// Horizontal 6-dot PhaseBar in the conversation header. Jumping is back-only:
// past phases are clickable, the current one is marked, forward ones are inert
// (you advance forward only through the gate, never by skipping it).
function renderPhaseBar(phases, active, selected) {
  const bar = document.getElementById("phaseBar");
  if (!bar) return;
  const cycle = getCurrentCycle();
  if (!cycle) { bar.hidden = true; bar.replaceChildren(); return; }
  bar.hidden = false;
  bar.replaceChildren();
  const activeIdx = phases.findIndex((p) => p.key === active);

  const current = document.createElement("span");
  current.className = "pb-current";
  current.textContent = selected ? `${selected.key} · ${selected.label}` : "";
  bar.appendChild(current);

  phases.forEach((phase, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "pb-sep";
      bar.appendChild(sep);
    }
    const isActive = phase.key === active;
    const isPast = i < activeIdx || phase.state === "done";
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-selected", String(isActive));
    dot.className = ["pb-dot",
      isActive ? "is-active" : "",
      isPast && !isActive ? "is-past" : "",
      phase.skipped ? "is-skipped" : "",
      i > activeIdx ? "is-future" : "",
    ].filter(Boolean).join(" ");
    dot.title = `${phase.key} · ${phase.label}`;
    dot.textContent = phase.state === "done" ? "✓" : phase.key;
    if (i < activeIdx) dot.dataset.phasejump = phase.key; // back-only jump
    else dot.disabled = true;
    bar.appendChild(dot);
  });
}

// --- Messages ---
// Convert LLM Markdown output to safe HTML — no external dependencies
function renderMarkdown(text) {
  if (!text) return "";
  // 1. Escape HTML entities first (XSS protection)
  let s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Fenced code blocks: pull them out behind a placeholder so a code
  // sample that itself demonstrates markdown (a table, a heading, **bold**)
  // isn't re-interpreted as real markup by the steps below — restored
  // verbatim as the very last step.
  const codeBlocks = [];
  s = s.replace(/```\w*\n([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre><code>${code.trimEnd()}</code></pre>`);
    return ` CODEBLOCK${codeBlocks.length - 1} `;
  });

  // 3. Inline code
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // 4. Line-by-line pass for headings, lists, tables, blockquotes, HR
  const lines = s.split("\n");
  const out = [];
  let inUl = false, inOl = false;

  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  // GFM pipe tables (the LLM regularly answers with "| col | col |" style
  // comparisons — e.g. "Lectura | Causa | Intervención" — and without this
  // they fell through to a plain <p>, showing the raw pipes to the user).
  const isTableRow = (line) => line.includes("|") && line.trim().replaceAll("|", "").trim().length > 0;
  const isSeparatorRow = (line) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());
  // A `\|` escape or a pipe inside an (already-converted) <code> span must
  // not create a phantom extra column — e.g. "| `a | b` | ok |" or
  // "| a \| b | ok |". Shielding both behind placeholders before a plain
  // split("|") is simpler (and less error-prone) than scanning char-by-char.
  const ESCAPED_PIPE = String.raw`\|`;
  const splitRow = (line) => {
    let t = line.trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|") && !t.endsWith(ESCAPED_PIPE)) t = t.slice(0, -1);
    const codeSpans = [];
    t = t.replace(/<code>[\s\S]*?<\/code>/g, (m) => {
      codeSpans.push(m);
      return `@@CODE${codeSpans.length - 1}@@`;
    });
    t = t.replaceAll(ESCAPED_PIPE, "@@PIPE@@");
    return t.split("|").map((c) => c.trim()
      .replaceAll("@@PIPE@@", "|")
      .replace(/@@CODE(\d+)@@/g, (_, idx) => codeSpans[Number(idx)]));
  };
  const cellAlign = (sepCell) => {
    const left = sepCell.startsWith(":"), right = sepCell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      closeLists();
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(cellAlign);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && isTableRow(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      const cellStyle = (idx) => (aligns[idx] ? ` style="text-align:${aligns[idx]}"` : "");
      const renderCell = (tag) => (c, idx) => `<${tag}${cellStyle(idx)}>${c}</${tag}>`;
      const renderRow = (r) => `<tr>${r.map(renderCell("td")).join("")}</tr>`;
      const thead = header.map(renderCell("th")).join("");
      const tbody = rows.map(renderRow).join("");
      out.push(`<div class="md-table-wrap"><table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`);
      i = j;
      continue;
    }

    if (line.startsWith("### ")) { closeLists(); out.push(`<h4>${line.slice(4)}</h4>`); i++; continue; }
    if (line.startsWith("## "))  { closeLists(); out.push(`<h3>${line.slice(3)}</h3>`); i++; continue; }
    if (line.startsWith("# "))   { closeLists(); out.push(`<h3>${line.slice(2)}</h3>`); i++; continue; }
    if (line.startsWith("&gt; ")) { closeLists(); out.push(`<blockquote>${line.slice(5)}</blockquote>`); i++; continue; }
    if (/^---+$/.test(line))    { closeLists(); out.push("<hr>"); i++; continue; }
    const task = /^[-*] \[([ xX])\] (.*)$/.exec(line);
    if (task) {
      // Styling lives on the <li> (md-task), not the <ul> — a task item can
      // follow a plain bullet within the same list, and the parent <ul> is
      // only opened once (by whichever item — plain or task — comes first).
      if (!inUl) { if (inOl) { out.push("</ol>"); inOl = false; } out.push("<ul>"); inUl = true; }
      const checked = task[1].toLowerCase() === "x";
      out.push(`<li class="md-task"><label><input type="checkbox" disabled${checked ? " checked" : ""}> ${task[2]}</label></li>`);
      i++; continue;
    }
    if (/^[-*] /.test(line)) {
      if (!inUl) { if (inOl) { out.push("</ol>"); inOl = false; } out.push("<ul>"); inUl = true; }
      out.push(`<li>${line.slice(2)}</li>`); i++; continue;
    }
    if (/^\d+\. /.test(line)) {
      if (!inOl) { if (inUl) { out.push("</ul>"); inUl = false; } out.push("<ol>"); inOl = true; }
      out.push(`<li>${line.replace(/^\d+\. /, "")}</li>`); i++; continue;
    }
    closeLists();
    if (!line.trim()) { out.push(""); i++; continue; }
    out.push(line);
    i++;
  }
  closeLists();
  s = out.join("\n");

  // 5. Bold and italic (after line processing to avoid breaking list tags)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_\n]+)_/g, "<em>$1</em>");

  // 6. Wrap plain-text runs in <p>, convert single \n to <br> within paragraphs.
  // A lone code-block placeholder is left unwrapped too (restored to <pre> next).
  const isCodeBlockPlaceholder = (t) => /^CODEBLOCK\d+$/.test(t);
  const blocks = s.split(/\n{2,}/);
  s = blocks.map((block) => {
    const t = block.trim();
    if (!t) return "";
    if (/^<(h[2-4]|ul|ol|pre|hr|blockquote|div)/.test(t) || isCodeBlockPlaceholder(t)) return t;
    return `<p>${t.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  // 7. Restore fenced code blocks verbatim — nothing above (tables, headings,
  // bold/italic, inline code) ever saw their real content.
  s = s.replace(/CODEBLOCK(\d+)/g, (_, idx) => codeBlocks[Number(idx)]);

  return s;
}

function loadMessages(cycleId) {
  const cycle = cycles.find((c) => c.id === cycleId);
  const msgs = cycle?.messages ?? [];
  renderMessages(msgs);
  renderReuseBanner(cycle);
}

function renderMessages(msgs) {
  messageStream.innerHTML = `<div class="stream-inner"></div>`;
  const inner = messageStream.querySelector(".stream-inner");
  if (!msgs || !msgs.length) {
    const cycle = getCurrentCycle();
    if (!cycle) {
      addAiNote("Bienvenido. Crea un nuevo ciclo desde Ciclos o usa /nuevo-ciclo para empezar.");
    } else {
      addAiNote(`Ciclo: "${escapeHtml(cycle.title)}" · ${escapeHtml(cycle.fase_actual ?? cycle.activePhase ?? "F0")}. ¿Cómo te puedo ayudar?`);
    }
    renderClosedCycleNote(getCurrentCycle());
    return;
  }
  msgs.forEach((m) => {
    if (m.role === "user") {
      inner.insertAdjacentHTML("beforeend", `<div class="user-message">${escapeHtml(m.content)}</div>`);
    } else {
      inner.insertAdjacentHTML("beforeend",
        `<article class="ai-message"><div class="ai-avatar">D</div><div class="ai-body">${renderMarkdown(m.content)}</div></article>`);
    }
  });
  messageStream.scrollTop = messageStream.scrollHeight;
  // loadMessages() no espera a renderActiveCycle() ni viceversa — cualquiera
  // de los dos puede ejecutar último. renderMessages() SIEMPRE reemplaza todo
  // #messageStream.innerHTML, así que el banner de cierre debe re-agregarse
  // aquí también o la carrera lo borra silenciosamente la mitad de las veces.
  renderClosedCycleNote(getCurrentCycle());
}

// Banner de ciclo cerrado. No usa onclick="..." inline: app.js es un módulo
// (type="module"), sus funciones no son visibles para atributos inline, que
// corren en scope global — un onclick así lanza "X is not defined" en clic.
function renderClosedCycleNote(cycle) {
  if (!cycle || cycle.estado === "activo") return;
  if (messageStream.querySelector(".closed-cycle-note")) return;
  const note = document.createElement("div");
  note.className = "closed-cycle-note ai-note";
  note.innerHTML = `Ciclo cerrado. Revisa el patrón en la <button class="inline-link" type="button" data-cta="library">Biblioteca de Patrones</button> o <button class="inline-link" type="button" data-cta="new-cycle">crea un nuevo ciclo</button>.`;
  messageStream.appendChild(note);
  note.querySelector('[data-cta="library"]')?.addEventListener("click", () => setView("library"));
  note.querySelector('[data-cta="new-cycle"]')?.addEventListener("click", () => document.getElementById("newCycleButton")?.click());
}

// --- Chat ---
// Slash commands handled locally (no LLM round-trip). Returns true if handled.
async function handleSlashCommand(text) {
  if (text.startsWith("/nuevo-ciclo")) {
    const title = text.replace("/nuevo-ciclo", "").trim();
    if (title) await createCycle(title); else openNewCycleModal();
    return true;
  }
  if (text.startsWith("/brief")) {
    downloadBrief();
    addAiNote("Brief exportado en Markdown. También queda vivo en el panel derecho.");
    return true;
  }
  if (text.startsWith("/experimento")) {
    setDeliverable("experiment");
    addAiNote("Cambiando a Experiment Card. Completa los campos de hipótesis, métrica y criterio de stop.");
    return true;
  }
  return false;
}

// Applies the chat result to local state after the reply is painted. Both the
// streaming and JSON endpoints return a content-free payload (only the model
// reply + changed brief fields), so we re-fetch the authoritative cycle
// (persisted messages + auto-extracted brief) over GET /api/cycles.
async function applyChatResult(data) {
  if (currentCycleId) await refreshCycleAfterChat(data.changed);
}

// Keep the stream pinned to the newest content while it grows, but don't fight
// the user if they've scrolled up to read (only follow when already near the end).
function scrollStreamToBottom(force = false) {
  if (!messageStream) return;
  const nearBottom = messageStream.scrollHeight - messageStream.scrollTop - messageStream.clientHeight < 120;
  if (force || nearBottom) messageStream.scrollTop = messageStream.scrollHeight;
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  // Closed/discarded cycles are read-only
  const activeCycleCheck = getCurrentCycle();
  if (activeCycleCheck && activeCycleCheck.estado !== "activo") {
    showToast("Este ciclo está cerrado. Crea uno nuevo o reutiliza el patrón desde la Biblioteca.");
    return;
  }
  const inner = messageStream.querySelector(".stream-inner");
  inner.insertAdjacentHTML("beforeend", `<div class="user-message">${escapeHtml(text)}</div>`);
  messageInput.value = "";
  chatInput.classList.remove("has-text");

  if (await handleSlashCommand(text)) return;

  // Real LLM call
  inner.insertAdjacentHTML(
    "beforeend",
    `<article class="ai-message"><div class="ai-avatar">D</div><div class="ai-body"><p class="thinking"><span class="thinking-dots" aria-label="Pensando"><span></span><span></span><span></span></span></p></div></article>`
  );
  scrollStreamToBottom(true);
  const thinkingEl = inner.querySelector(".ai-message:last-child .ai-body p");

  try {
    const data = await streamChat(text, thinkingEl);
    thinkingEl.classList.remove("thinking", "is-streaming");
    const reply = data.reply ?? data.error ?? "Sin respuesta.";
    thinkingEl.innerHTML = renderMarkdown(reply);
    await applyChatResult(data);
  } catch {
    thinkingEl.classList.remove("thinking", "is-streaming");
    thinkingEl.textContent = "Error de conexión con el asistente.";
  }
  scrollStreamToBottom(true);
}

// After a streamed chat turn, pull the updated cycle from the JSON API and
// refresh the brief panel (the SSE done event carries no cycle content).
async function refreshCycleAfterChat(changed) {
  try {
    const res = await apiFetch("/api/cycles", { headers: authHeaders() });
    if (!res.ok) return;
    cycles = await res.json();
    renderActiveCycle();
    renderBriefState();
    flashBriefFields(changed ?? []);
  } catch { /* keep local state; next load will sync */ }
}

// B3 · consume /api/chat/stream (SSE): paints tokens progressively into
// `liveEl` (typing effect) and resolves with the final payload {reply, cycle,
// changed}. Falls back to the JSON endpoint if streaming isn't available.
async function streamChat(text, liveEl) {
  const payload = { method: "POST", headers: authHeaders(), body: JSON.stringify({ message: text, cycleId: currentCycleId }) };
  const res = await apiFetch("/api/chat/stream", payload);
  if (!res.ok || !res.body || !(res.headers.get("content-type") || "").includes("text/event-stream")) {
    const fallback = await apiFetch("/api/chat", payload);
    return fallback.json();
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let reply = "";
  let finalData = null;
  let streamError = null;
  const handleEvent = (raw) => {
    let event = "message";
    let dataLine = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) dataLine += line.slice(6);
    }
    if (!dataLine) return;
    let data;
    try { data = JSON.parse(dataLine); } catch { return; }
    if (event === "token" && data.t) {
      if (!reply) liveEl.classList.remove("thinking");
      liveEl.classList.add("is-streaming");
      reply += data.t;
      // Plain text while streaming (no HTML sink on network data); the final
      // reply is Markdown-rendered once the stream completes.
      liveEl.textContent = reply;
      scrollStreamToBottom();
    } else if (event === "done") {
      finalData = data;
    } else if (event === "error") {
      streamError = data;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      handleEvent(buf.slice(0, sep));
      buf = buf.slice(sep + 2);
    }
  }
  if (streamError && !finalData) return { reply: reply || null, error: streamError.detail || streamError.error };
  return { reply, changed: finalData?.changed ?? [], streamed: true };
}

function addAiNote(content) {
  const inner = messageStream.querySelector(".stream-inner");
  if (!inner) return;
  inner.insertAdjacentHTML(
    "beforeend",
    `<article class="ai-message"><div class="ai-avatar">D</div><div class="ai-body"><p>${escapeHtml(content)}</p></div></article>`
  );
  messageStream.scrollTop = messageStream.scrollHeight;
}

// --- Phase actions ---
// Server-driven phase advance with gate validation (Fase 2).
// withRisk=false → if the gate is unmet the server returns 422 and we render a
// blocked GateCard; withRisk=true → the server records the risk and advances.
async function advancePhase(withRisk = false) {
  if (!currentCycleId) return;
  try {
    const res = await apiFetch(`/api/cycles/${currentCycleId}/advance`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(withRisk ? { risk: true } : {}),
    });
    if (res.status === 422) {
      const data = await res.json();
      renderGateCard(data.missing ?? [], data.phase);
      return;
    }
    if (!res.ok) { showToast("No se pudo avanzar de fase.", true); return; }
    const data = await res.json();
    cycles = cycles.map((c) => (c.id === currentCycleId ? data.cycle : c));
    removeGateCard();
    renderActiveCycle();
    renderStepper(data.advancedTo);
    renderBriefState();
    addAiNote(data.skippedWithRisk
      ? `Avanzamos a ${data.advancedTo} con riesgo explícito (gate incompleto). Queda registrado en "Riesgos asumidos".`
      : `Gate cumplido. Avanzamos a ${data.advancedTo}.`);
  } catch {
    showToast("Error de conexión al avanzar de fase.", true);
  }
}

// Blocked-gate card in the conversation: lists what's missing + two actions.
function renderGateCard(missing, phase) {
  removeGateCard();
  const inner = messageStream.querySelector(".stream-inner") || messageStream;
  const items = missing.map((m) => `<li>${escapeHtml(m.message ?? m.key ?? String(m))}</li>`).join("");
  const card = document.createElement("div");
  card.className = "gate-card is-blocked";
  card.innerHTML = `
    <div class="gate-head"><span class="gate-icon">!</span><strong>Gate de ${escapeHtml(phase ?? "")} bloqueado</strong></div>
    <p>No puedes avanzar todavía. Falta:</p>
    <ul class="gate-missing">${items}</ul>
    <div class="gate-actions">
      <button type="button" class="secondary-action" data-gate="dismiss">Completarlo primero</button>
      <button type="button" class="primary-action" data-gate="risk">Avanzar con riesgo</button>
    </div>`;
  card.querySelector('[data-gate="dismiss"]').addEventListener("click", removeGateCard);
  card.querySelector('[data-gate="risk"]').addEventListener("click", () => advancePhase(true));
  inner.appendChild(card);
  messageStream.scrollTop = messageStream.scrollHeight;
}

function removeGateCard() {
  messageStream.querySelector(".gate-card")?.remove();
}

// 2C - banner when the cycle was seeded from a library pattern (reuse flywheel).
function renderReuseBanner(cycle) {
  if (!cycle?.reusedFromPattern) return;
  const inner = messageStream.querySelector(".stream-inner") || messageStream;
  if (inner.querySelector(".reuse-banner")) return;
  const pat = patterns.find((p) => p.id === cycle.reusedFromPattern);
  const name = pat?.nombre ?? "patrón de la Biblioteca";
  inner.insertAdjacentHTML(
    "afterbegin",
    `<div class="reuse-banner">Sembrado desde el patrón: <strong>${escapeHtml(name)}</strong> — confirma contexto e hipótesis antes de avanzar.</div>`
  );
}

// Iteration loop banner (purple) shown when a cycle loops back to F1.
function renderIterationBanner(count) {
  const inner = messageStream.querySelector(".stream-inner") || messageStream;
  inner.insertAdjacentHTML(
    "beforeend",
    `<div class="iteration-banner">↻ Iteración ${escapeHtml(String(count))} — de vuelta en F1 · ${FASE_LABEL.F1}</div>`
  );
  messageStream.scrollTop = messageStream.scrollHeight;
}

function renderBriefState() {
  const cycle = getCurrentCycle();
  // "Riesgos asumidos" es plural: mostraba solo el último riesgo aceptado y
  // silenciaba los anteriores del mismo ciclo (un ciclo puede saltar varios
  // gates). Ahora lista todos los abiertos, igual que el brief exportado.
  const openRisks = (cycle?.risks ?? []).filter((r) => !r.resolvedAt);
  riskTag.classList.toggle("is-hidden", openRisks.length === 0);
  if (openRisks.length) {
    riskTag.innerHTML = openRisks.map((r) => {
      // Atribuye a quien realmente aceptó el riesgo (r.acceptedBy, grabado por
      // el server) — no al usuario con sesión activa ahora mismo, que puede
      // no ser la misma persona.
      const who = r.acceptedBy?.name || r.acceptedBy?.id || "usuario";
      const when = r.acceptedAt ? new Date(r.acceptedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "";
      return `<div class="risk-tag"><span>${escapeHtml(r.phase)}</span> <span class="risk-tag-text">${escapeHtml(r.text)} Riesgo aceptado por ${escapeHtml(who)} · ${escapeHtml(when)}.</span><button type="button" class="pending-chip risk-resolve-btn" data-resolve-risk="${escapeHtml(r.id)}">Marcar resuelto</button></div>`;
    }).join("");
    riskTag.querySelectorAll("[data-resolve-risk]").forEach((btn) => {
      btn.addEventListener("click", () => resolveRisk(btn.dataset.resolveRisk));
    });
  }
  setDeliverable(deliverable);
}

// Marca un riesgo como resuelto (no lo borra: pasa de "Riesgos asumidos" a
// "Riesgos resueltos" en el entregable exportado).
async function resolveRisk(riskId) {
  if (!currentCycleId || !riskId) return;
  try {
    const res = await apiFetch(`/api/cycles/${currentCycleId}/risks/${encodeURIComponent(riskId)}/resolve`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) { showToast("No se pudo marcar el riesgo como resuelto.", true); return; }
    const updated = await res.json();
    cycles = cycles.map((c) => (c.id === updated.id ? updated : c));
    renderBriefState();
    showToast("Riesgo marcado como resuelto.");
  } catch {
    showToast("Error de conexión al resolver el riesgo.", true);
  }
}

// 10 campos confirmables del Brief (sub_causa queda fuera: es opcional/secundaria
// por doctrina §1, "no maneja el filtro"). Debe coincidir con lo que cuenta
// loadBriefFromCycle más abajo.
const BRIEF_PROGRESS_TOTAL = 10;
function setBriefProgress(value) {
  filled = Math.min(value, BRIEF_PROGRESS_TOTAL);
  progressText.textContent = `${filled} / ${BRIEF_PROGRESS_TOTAL} campos`;
  progressText.title = "Campos con un valor confirmado. No necesitas todos para avanzar — cada gate pide solo los suyos.";
  progressFill.style.width = `${Math.round((filled / BRIEF_PROGRESS_TOTAL) * 100)}%`;
}

// --- Deep merge and path utilities ---
function deepMerge(target, source) {
  const out = { ...target };
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === "object" && !Array.isArray(source[k]) && target[k] && typeof target[k] === "object")
      out[k] = deepMerge(target[k], source[k]);
    else out[k] = source[k];
  }
  return out;
}

function setNestedPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = cur[keys[i]] ?? {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

const linesToArray = (text) => String(text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

// Wires a native input/select/checkbox/textarea (added for the F1–F5
// structured fields, doctrina §4.1) to PATCH the cycle on change/blur.
// Unlike makeFieldEditable (click-to-edit <p>), these elements are already
// editable controls — wire once (guarded by dataset.structBound) and patch.
function bindStructuredField(el, getPatch, evt = "change") {
  if (!el || el.dataset.structBound) return;
  el.dataset.structBound = "1";
  el.addEventListener(evt, async () => {
    if (!currentCycleId) return;
    const patch = getPatch(el);
    cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
    try {
      await updateCycle(patch);
    } catch {
      showToast("Error al guardar el campo.", true);
    }
    renderActiveCycle();
  });
}

// Plain-scalar structured fields (doctrina §4.1) written by makeFieldEditable
// without the {value,confirmed} wrapper the LLM-suggested brief.* fields use.
const PLAIN_SCALAR_PATHS = new Set([
  "proxy_y_segunda_senal.proxy", "proxy_y_segunda_senal.segunda_senal",
  "experiment.supuesto_mas_riesgoso", "experiment.por_que_este",
  "experiment.resultado_confirma", "experiment.resultado_refuta", "experiment.costo_de_equivocarse",
  "spec_conductual.comportamiento_objetivo", "spec_conductual.criterio_exito_conductual",
]);

// Make a brief/experiment panel field inline-editable. cyclePath is "brief.behavior_statement", "sub_perfil", etc.
function makeFieldEditable(el, cyclePath) {
  if (!el) return;
  if (el.dataset.editableRegistered) return;
  el.dataset.editableRegistered = "1";
  el.style.cursor = "pointer";
  el.title = "Clic para escribir o editar este campo";
  el.addEventListener("click", () => {
    if (el.dataset.editing) return;
    el.dataset.editing = "1";
    const isConfirm = el.classList.contains("confirm-field");
    // Prefiere el valor crudo guardado en dataset.value (setField/setConfirmableField
    // lo mantienen sincronizado) sobre el texto visible, que puede llevar un
    // badge decorativo ("IA · sin confirmar") que no debe colarse al editar.
    const current = isConfirm ? "" : (el.dataset.value ?? el.textContent.trim());
    const input = document.createElement("input");
    input.className = "brief-inline-input";
    input.value = current;
    input.placeholder = "Escribe aquí y presiona Enter…";
    el.replaceWith(input);
    input.focus();
    let saved = false;
    const save = async () => {
      if (saved) return; // guard: Enter blurs, which would fire save twice
      saved = true;
      const val = input.value.trim();
      // Restore the original <p> element so loadBriefFromCycle can find it by id
      // and render the value with proper styling (not leave a raw input behind).
      input.replaceWith(el);
      delete el.dataset.editing;
      const patch = {};
      if (cyclePath === "sub_perfil" || cyclePath === "segmento_objetivo") {
        // Top-level scalar cycle fields (server normalizes sub_perfil to enum).
        patch[cyclePath] = val || null;
      } else if (PLAIN_SCALAR_PATHS.has(cyclePath)) {
        // Plain-scalar structured fields (doctrina §4.1) — no {value,confirmed}
        // wrapper, unlike the LLM-suggested brief.* fields.
        setNestedPath(patch, cyclePath, val || null);
      } else {
        setNestedPath(patch, cyclePath, { value: val, confirmed: !!val });
      }
      if (currentCycleId) {
        cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
        try {
          await updateCycle(patch);
          if (val) showToast("Campo guardado ✓");
        } catch {
          showToast("Error al guardar el campo.", true);
        }
      }
      renderActiveCycle();
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { input.value = current; input.blur(); }
    });
  });
}

// Populate a brief panel DOM element with a real value or reset to [CONFIRMAR]
function setField(el, value) {
  if (!el) return;
  el.dataset.value = value ?? "";
  if (value) {
    el.textContent = value;
    el.classList.remove("confirm-field", "is-pending-confirm");
    el.classList.add("mono-value");
  } else {
    // Empty state: an actionable placeholder, not the "[CONFIRMAR]" jargon.
    el.innerHTML = '<span class="field-cta">Clic para escribir</span>';
    el.classList.add("confirm-field");
    el.classList.remove("mono-value", "is-pending-confirm");
  }
}

// Como setField(), pero para campos donde el gate exige confirmación humana
// explícita — hoy solo evidencia_primaria y segunda_fuente (gate F1, doctrina
// §1: "la causa la propone el LLM y la confirma el humano"). Sin esto, un
// valor sugerido por el LLM (confirmed:false) se veía IDÉNTICO a uno escrito
// por el PM, aunque el gate seguía bloqueado pidiendo la confirmación.
function setConfirmableField(el, field) {
  if (!el) return;
  const value = field?.value ?? null;
  if (!value) { setField(el, null); return; }
  el.dataset.value = value;
  if (field?.confirmed) {
    el.textContent = value;
    el.classList.remove("confirm-field", "is-pending-confirm");
    el.classList.add("mono-value");
  } else {
    el.innerHTML = `<span class="pending-confirm-badge">IA · sin confirmar</span>${escapeHtml(value)}`;
    el.classList.add("mono-value", "is-pending-confirm");
    el.classList.remove("confirm-field");
  }
}

// Flash the brief fields the LLM just auto-filled (Fase 1). `changed` is the list
// of keys returned by /api/chat, e.g. ["brief.behavior_statement", "causa"].
const BRIEF_FIELD_TO_EL = {
  "brief.behavior_statement": "briefBehavior",
  "brief.evidencia_primaria": "briefEvidence",
  "brief.segunda_fuente": "secondSource",
  "brief.intervencion": "briefIntervention",
  "brief.hipotesis": "hypothesisField",
  "brief.senal_cuantitativa": "metricField",
  // sub_perfil no está aquí: doctrina §3 prohíbe la auto-sugerencia por texto —
  // el LLM nunca lo devuelve, el PM lo elige a mano en el <select>.
  "transicion": "briefCogLevel",
  "causa": "briefCause",
  "segmento_objetivo": "briefSegment",
};
function flashBriefFields(changed) {
  if (!Array.isArray(changed) || !changed.length) return;
  for (const key of changed) {
    const el = document.getElementById(BRIEF_FIELD_TO_EL[key]);
    if (!el) continue;
    restartAnimation(el, "fillpop");
  }
  if (changed.length) showToast(`Brief actualizado: ${changed.length} campo(s) desde la conversación.`);
}

// Read cycle.brief{} and cycle top-level fields → populate all brief panel DOM elements
// Orchestrates the brief/experiment/spec panel refresh — split into one
// function per section (below) to keep each piece's cognitive complexity low.
function loadBriefFromCycle(cycle) {
  renderBriefCoreFields(cycle);
  renderBriefCauseSection(cycle);
  renderF1SesgoProxy(cycle);
  renderF2Guardrails(cycle);
  renderExperimentCard(cycle);
  renderSpecConductual(cycle);
  setBriefProgress(computeBriefProgress(cycle));
  applyPhaseGating(cycle);
}

// Comportamiento/segmento/evidencia/intervención/hipótesis/métrica — los
// campos base del brief (F0–F2), presentes desde el arranque del panel.
function renderBriefCoreFields(cycle) {
  const b = cycle?.brief ?? {};
  const briefBehavior = document.querySelector("#briefBehavior");
  const briefSubProfile = document.querySelector("#briefSubProfile");
  const briefCogLevel = document.querySelector("#briefCogLevel");
  const briefEvidence = document.querySelector("#briefEvidence");
  const briefIntervention = document.querySelector("#briefIntervention");
  const briefSegment = document.querySelector("#briefSegment");

  setField(briefBehavior, b.behavior_statement?.value ?? null);
  if (briefSubProfile) briefSubProfile.innerHTML = subPerfilOptions(cycle?.sub_perfil ?? "");
  if (briefCogLevel) briefCogLevel.innerHTML = transitionOptions(cycle?.transicion ?? "");
  setField(briefSegment, cycle?.segmento_objetivo ?? null);
  setConfirmableField(briefEvidence, b.evidencia_primaria);
  setConfirmableField(secondSource, b.segunda_fuente);
  setField(briefIntervention, b.intervencion?.value ?? null);
  setField(hypothesisField, b.hipotesis?.value ?? null);
  setField(metricField, b.senal_cuantitativa?.value ?? null);

  makeFieldEditable(briefBehavior, "brief.behavior_statement");
  makeFieldEditable(briefSegment, "segmento_objetivo");
  makeFieldEditable(briefEvidence, "brief.evidencia_primaria");
  makeFieldEditable(secondSource, "brief.segunda_fuente");
  makeFieldEditable(briefIntervention, "brief.intervencion");
  makeFieldEditable(hypothesisField, "brief.hipotesis");
  makeFieldEditable(metricField, "brief.senal_cuantitativa");
}

// B=MAP selector sync + estado de confirmación. El botón activo por sí solo
// no distingue "la IA lo sugirió" de "tú lo confirmaste" — pero el gate F1
// sí exige justo esa distinción (causa_source === "pm_confirmed"). Sin este
// texto, el botón resaltado podía hacer creer que la causa ya quedó
// confirmada cuando en realidad el gate seguía pidiendo el clic.
function renderBriefCauseSection(cycle) {
  const causeMap = { M: "Motivación", A: "Ability", P: "Prompt" };
  const activeCause = cycle?.causa;
  document.querySelectorAll(".bmap-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.cause === activeCause));
  const briefCauseEl = document.getElementById("briefCause");
  if (briefCauseEl) {
    const causaConfirmed = cycle?.causa_source === "pm_confirmed" || cycle?.brief?.causa?.confirmed === true;
    briefCauseEl.classList.toggle("confirm-field", !activeCause || !causaConfirmed);
    briefCauseEl.classList.toggle("mono-value", !!activeCause && causaConfirmed);
    if (!activeCause) {
      briefCauseEl.innerHTML = '<span class="field-cta">Elige una causa arriba</span>';
    } else if (causaConfirmed) {
      briefCauseEl.textContent = `Confirmada: ${causeMap[activeCause] ?? activeCause}`;
    } else {
      briefCauseEl.innerHTML = `<strong>Sugerida por la IA:</strong> ${causeMap[activeCause] ?? activeCause} — clic arriba para confirmarla`;
    }
  }
  renderSubCausa(cycle);
}

// F1 — sesgo + proxy/2ª señal (doctrina §4.1)
function renderF1SesgoProxy(cycle) {
  const briefSesgo = document.querySelector("#briefSesgo");
  if (briefSesgo) briefSesgo.innerHTML = sesgoOptions(cycle?.sesgo ?? "");
  const proxyData = cycle?.proxy_y_segunda_senal ?? {};
  const briefProxy = document.querySelector("#briefProxy");
  const briefSegundaSenal = document.querySelector("#briefSegundaSenal");
  setField(briefProxy, proxyData.proxy || null);
  setField(briefSegundaSenal, proxyData.segunda_senal || null);
  makeFieldEditable(briefProxy, "proxy_y_segunda_senal.proxy");
  makeFieldEditable(briefSegundaSenal, "proxy_y_segunda_senal.segunda_senal");
  bindStructuredField(briefSesgo, (el) => ({ sesgo: el.value || null }));
}

// Binds a group of DOM elements (checkbox/input/textarea) to nested cycle
// patch paths, populating the current value first. Shared by the SDT/hook/
// fricción loops below so each caller stays a flat, low-branching block.
function bindFieldGroup(els, readValue, applyValue, patchFor, evt) {
  for (const [key, el] of Object.entries(els)) {
    if (el) applyValue(el, key);
    bindStructuredField(el, (e) => patchFor(key, readValue(e)), evt);
  }
}

// F2 — guardrails SDT + jueves en la tarde + anti-roadmap + fricción + hook
function renderF2Guardrails(cycle) {
  const sdt = cycle?.brief?.sdt ?? {};
  for (const dim of ["autonomia", "mastery", "relatedness"]) {
    const label = dim[0].toUpperCase() + dim.slice(1);
    const checkEl = document.getElementById(`sdt${label}Check`);
    const notaEl = document.getElementById(`sdt${label}Nota`);
    if (checkEl) checkEl.checked = sdt[dim]?.check === true;
    if (notaEl) notaEl.value = sdt[dim]?.nota ?? "";
    bindStructuredField(checkEl, (el) => ({ brief: { sdt: { [dim]: { check: el.checked } } } }));
    bindStructuredField(notaEl, (el) => ({ brief: { sdt: { [dim]: { nota: el.value } } } }), "blur");
  }

  const juevesEl = document.getElementById("juevesTardeCheck");
  if (juevesEl) juevesEl.checked = cycle?.brief?.jueves_en_la_tarde?.check === true;
  bindStructuredField(juevesEl, (el) => ({ brief: { jueves_en_la_tarde: { check: el.checked } } }));
  const antiRoadmapEl = document.getElementById("antiRoadmapCheck");
  if (antiRoadmapEl) antiRoadmapEl.checked = cycle?.brief?.anti_roadmap?.check === true;
  bindStructuredField(antiRoadmapEl, (el) => ({ brief: { anti_roadmap: { check: el.checked } } }));

  const friccion = cycle?.brief?.friccion ?? {};
  const friccionEls = {
    eliminar: document.getElementById("friccionEliminar"),
    preservar: document.getElementById("friccionPreservar"),
    es_inversion: document.getElementById("friccionInversion"),
  };
  bindFieldGroup(friccionEls,
    (e) => linesToArray(e.value),
    (el, key) => { el.value = (friccion[key] ?? []).join("\n"); },
    (key, val) => ({ brief: { friccion: { [key]: val } } }),
    "blur");

  const hook = cycle?.brief?.hook ?? {};
  const hookEls = {
    trigger: document.getElementById("hookTrigger"),
    action: document.getElementById("hookAction"),
    variable_reward: document.getElementById("hookReward"),
    investment_phase: document.getElementById("hookInvestment"),
  };
  bindFieldGroup(hookEls,
    (e) => e.value,
    (el, key) => { el.value = hook[key] ?? ""; },
    (key, val) => ({ brief: { hook: { [key]: val } } }),
    "blur");
}

// Experiment Card — hipótesis/variable/tracking + escalera de validación F3
// (supuesto más riesgoso, test elegido, confianza, decisión) + A/B opcional.
function renderExperimentCard(cycle) {
  const exp = cycle?.experiment ?? {};
  const expStr = (v) => v?.value ?? (typeof v === "string" ? v : null);
  const fields = {
    experimentHypothesis: ["hipotesis", "experiment.hipotesis"],
    experimentVariable: ["variable", "experiment.variable"],
    experimentMetric: ["metrica_primaria", "experiment.metrica_primaria"],
    experimentStop: ["criterio_stop", "experiment.criterio_stop"],
    experimentSample: ["tamano_muestra", "experiment.tamano_muestra"],
    experimentDuration: ["duracion", "experiment.duracion"],
  };
  for (const [elId, [expKey, path]] of Object.entries(fields)) {
    const el = document.querySelector(`#${elId}`);
    setField(el, expStr(exp[expKey]));
    makeFieldEditable(el, path);
  }
  const expTracking = document.querySelector("#experimentTracking");
  const trackVal = Array.isArray(exp.tracking_eventos) && exp.tracking_eventos.length
    ? exp.tracking_eventos.join(", ") : expStr(exp.tracking_eventos);
  setField(expTracking, trackVal);
  makeFieldEditable(expTracking, "experiment.tracking_eventos");

  // 2D - honestidad: estado del toggle outcome/actividad + advertencia.
  const mType = exp.metrica_tipo ?? null;
  document.querySelectorAll("#metricTypeToggle .mt-btn").forEach((b) => b.classList.toggle("active", b.dataset.mtype === mType));
  const mWarn = document.getElementById("metricTypeWarn");
  if (mWarn) mWarn.hidden = mType !== "actividad";

  renderF3ValidationLadder(exp);
}

// F3 — escalera de validación (§8): supuesto más riesgoso, test elegido, etc.
function renderF3ValidationLadder(exp) {
  const textFields = {
    experimentSupuesto: ["supuesto_mas_riesgoso", "experiment.supuesto_mas_riesgoso"],
    experimentPorQueEste: ["por_que_este", "experiment.por_que_este"],
    experimentResultadoConfirma: ["resultado_confirma", "experiment.resultado_confirma"],
    experimentResultadoRefuta: ["resultado_refuta", "experiment.resultado_refuta"],
    experimentCostoEquivocarse: ["costo_de_equivocarse", "experiment.costo_de_equivocarse"],
  };
  for (const [elId, [expKey, path]] of Object.entries(textFields)) {
    const el = document.querySelector(`#${elId}`);
    setField(el, exp[expKey] || null);
    makeFieldEditable(el, path);
  }

  const expTipoSupuesto = document.getElementById("experimentTipoSupuesto");
  const expTestElegido = document.getElementById("experimentTestElegido");
  const expConfianza = document.getElementById("experimentConfianza");
  const expDecisionF3 = document.getElementById("experimentDecisionF3");
  if (expTipoSupuesto) expTipoSupuesto.innerHTML = tipoSupuestoOptions(exp.tipo_supuesto ?? "");
  if (expTestElegido) expTestElegido.innerHTML = testElegidoOptions(exp.test_elegido ?? "");
  if (expConfianza) expConfianza.value = exp.confianza != null ? String(exp.confianza) : "";
  if (expDecisionF3) expDecisionF3.innerHTML = decisionF3Options(exp.decision ?? "");
  bindStructuredField(expTipoSupuesto, (el) => ({ experiment: { tipo_supuesto: el.value || null } }));
  bindStructuredField(expTestElegido, (el) => ({ experiment: { test_elegido: el.value || null } }));
  bindStructuredField(expConfianza, (el) => ({ experiment: { confianza: el.value ? Number(el.value) : null } }));
  bindStructuredField(expDecisionF3, (el) => ({ experiment: { decision: el.value || null } }));
}

// F4 — spec conductual (el handoff a tech, doctrina §4.1)
function renderSpecConductual(cycle) {
  const spec = cycle?.spec_conductual ?? {};
  const specComportamiento = document.querySelector("#specComportamiento");
  const specCriterioExito = document.querySelector("#specCriterioExito");
  setField(specComportamiento, spec.comportamiento_objetivo || null);
  setField(specCriterioExito, spec.criterio_exito_conductual || null);
  makeFieldEditable(specComportamiento, "spec_conductual.comportamiento_objetivo");
  makeFieldEditable(specCriterioExito, "spec_conductual.criterio_exito_conductual");

  const loop = spec.loop_completo ?? {};
  const loopEls = {
    trigger: document.getElementById("specTrigger"), action: document.getElementById("specAction"),
    reward: document.getElementById("specReward"), investment: document.getElementById("specInvestment"),
  };
  bindFieldGroup(loopEls,
    (e) => e.value,
    (el, key) => { el.value = loop[key] ?? ""; },
    (key, val) => ({ spec_conductual: { loop_completo: { [key]: val } } }),
    "blur");

  const specFriccion = spec.friccion ?? {};
  const specFriccionEls = {
    elimina: document.getElementById("specFriccionElimina"),
    preserva: document.getElementById("specFriccionPreserva"),
    invierte: document.getElementById("specFriccionInvierte"),
  };
  bindFieldGroup(specFriccionEls,
    (e) => linesToArray(e.value),
    (el, key) => { el.value = (specFriccion[key] ?? []).join("\n"); },
    (key, val) => ({ spec_conductual: { friccion: { [key]: val } } }),
    "blur");

  const specCopy = document.getElementById("specCopyPorNivel");
  if (specCopy) specCopy.value = spec.copy_por_nivel_cognitivo ?? "";
  bindStructuredField(specCopy, (e) => ({ spec_conductual: { copy_por_nivel_cognitivo: e.value } }), "blur");
  const specAnti = document.getElementById("specAntiPatrones");
  if (specAnti) specAnti.value = (spec.anti_patrones ?? []).join("\n");
  bindStructuredField(specAnti, (e) => ({ spec_conductual: { anti_patrones: linesToArray(e.value) } }), "blur");
}

// Progress: cuenta sub-objetos confirmados del brief + escalares top-level
// llenos. causa cuenta UNA vez vía cycle.causa (no también vía
// brief.causa.confirmed, que se escribe en paralelo) para no duplicar el dato.
function computeBriefProgress(cycle) {
  const b = cycle?.brief ?? {};
  const confirmedFields = [b.behavior_statement, b.senal_cuantitativa, b.evidencia_primaria, b.segunda_fuente, b.intervencion, b.hipotesis];
  let cnt = confirmedFields.filter((f) => f?.confirmed).length;
  if (cycle?.segmento_objetivo) cnt++;
  if (cycle?.sub_perfil) cnt++;
  if (cycle?.transicion) cnt++;
  if (cycle?.causa) cnt++;
  return cnt;
}

// Hilo conductor: los campos de fases futuras quedan visibles pero bloqueados
// (atenuados + candado) hasta que el ciclo alcance esa fase — igual que el
// checklist del gate. El switch a Experiment Card se bloquea hasta F3.
function applyPhaseGating(cycle) {
  const active = cycle?.fase_actual ?? cycle?.activePhase ?? "F0";
  const activeIdx = Math.max(PHASES.indexOf(active), 0);
  document.querySelectorAll(".phase-gated").forEach((block) => {
    const unlockIdx = PHASES.indexOf(block.dataset.unlockPhase);
    const locked = unlockIdx > activeIdx;
    block.classList.toggle("is-locked", locked);
    block.querySelectorAll("input, select, button, [contenteditable]").forEach((el) => { el.disabled = locked; });
  });
  const expLocked = activeIdx < PHASES.indexOf("F3");
  if (experimentSwitch) {
    experimentSwitch.disabled = expLocked;
    experimentSwitch.title = expLocked ? `Se habilita en F3 · ${FASE_LABEL.F3}` : "";
    experimentSwitch.classList.toggle("is-locked", expLocked);
  }
  const specLocked = activeIdx < PHASES.indexOf("F4");
  if (specSwitch) {
    specSwitch.disabled = specLocked;
    specSwitch.title = specLocked ? `Se habilita en F4 · ${FASE_LABEL.F4}` : "";
    specSwitch.classList.toggle("is-locked", specLocked);
  }
  // A/B fields solo aplican cuando test_elegido = "ab" (doctrina §4.1 — el A/B
  // ya no es el default de F3).
  const abOnly = document.getElementById("experimentAbOnly");
  if (abOnly) abOnly.classList.toggle("is-locked", (cycle?.experiment?.test_elegido ?? null) !== "ab");
}

// Fields required for a complete Intervention Brief; those without a value are
// treated as [CONFIRMAR] (assumptions) and drive the export validation modal.
const REQUIRED_BRIEF_FIELDS = [
  { key: "behavior_statement", label: "Comportamiento objetivo" },
  { key: "causa", label: "Causa B=MAP", topLevel: true },
  { key: "evidencia_primaria", label: "Evidencia primaria" },
  { key: "segunda_fuente", label: "Segunda fuente de evidencia" },
  { key: "intervencion", label: "Intervención" },
  { key: "hipotesis", label: "Hipótesis de intervención" },
  { key: "senal_cuantitativa", label: "Métrica de éxito" },
];
function getMissingBriefFields(cycle) {
  const b = cycle?.brief ?? {};
  return REQUIRED_BRIEF_FIELDS.filter((f) => {
    const val = f.topLevel ? (cycle?.[f.key] ?? b[f.key]?.value) : b[f.key]?.value;
    return !(typeof val === "string" ? val.trim() : val);
  });
}

// Export flow with validation (Fase 3): if the brief has [CONFIRMAR] fields and
// the user hasn't forced, show a modal to complete them or export with assumptions.
function exportBriefFlow(force = false) {
  const cycle = getCurrentCycle();
  if (!cycle) { showToast("Selecciona un ciclo primero para exportar el brief."); return; }
  const missing = getMissingBriefFields(cycle);
  if (missing.length && !force) { openExportModal(missing); return; }
  closeExportModal();
  downloadBrief();
  // Analytics (Fase 5): fire-and-forget export event.
  fetch("/api/analytics/event", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type: "export_attempted", resource: cycle.id, meta: { missingCount: missing.length, forced: force } }),
  }).catch(() => {});
  showToast("Brief exportado en Markdown.");
}

function openExportModal(missing) {
  const items = missing.map((m) => `<li>${escapeHtml(m.label)}</li>`).join("");
  const overlay = openModal("exportModal", `
    <div class="export-modal-card">
      <p class="section-label">Exportar brief</p>
      <p class="export-modal-msg">Hay ${missing.length} campo(s) sin confirmar. La IA los trata como <strong>supuestos</strong>.</p>
      <ul class="export-missing">${items}</ul>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-export="complete">Completar campos</button>
        <button type="button" class="primary-action" data-export="force">Exportar con supuestos</button>
      </div>
    </div>`);
  overlay.querySelector('[data-export="complete"]')?.addEventListener("click", () => {
    overlay.close();
    focusMissingBriefField(missing[0]);
  });
  overlay.querySelector('[data-export="force"]')?.addEventListener("click", () => exportBriefFlow(true));
}

function closeExportModal() {
  document.getElementById("exportModal")?.remove();
}

// "Completar campos": jump the PM straight to the exact unresolved field —
// switch to the Brief, scroll it into view, focus it, and glow-highlight it.
const REQUIRED_FIELD_EL = {
  behavior_statement: "briefBehavior",
  causa: "briefCauseSelector",
  evidencia_primaria: "briefEvidence",
  segunda_fuente: "secondSource",
  intervencion: "briefIntervention",
  hipotesis: "hypothesisField",
  senal_cuantitativa: "metricField",
};
function focusMissingBriefField(field) {
  if (!field) return;
  setDeliverable("brief");
  const el = document.getElementById(REQUIRED_FIELD_EL[field.key]);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  restartAnimation(el, "fillpop");
  el.focus?.();
}

function downloadBrief() {
  const { markdown, title } = buildBriefMarkdown();
  openExportPreview(markdown, title);
}

// Riesgos reales del ciclo en dos listas — asumidos (abiertos) y resueltos —
// compartido por el brief y el resumen ejecutivo exportados.
function riskMarkdownSections(cycle, fallbackWho, fallbackWhen) {
  const risks = cycle?.risks ?? [];
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : fallbackWhen);
  const assumed = risks.filter((r) => !r.resolvedAt);
  const resolved = risks.filter((r) => r.resolvedAt);
  return {
    assumedLines: assumed.length
      ? assumed.map((r) => `- ${r.phase}: ${r.text} Riesgo aceptado por ${r.acceptedBy?.name || r.acceptedBy?.id || fallbackWho} · ${fmtDate(r.acceptedAt)}.`)
      : [`- Sin riesgos aceptados.`],
    resolvedLines: resolved.length
      ? resolved.map((r) => `- ${r.phase}: ${r.text} Resuelto por ${r.resolvedBy?.name || r.resolvedBy?.id || fallbackWho} · ${fmtDate(r.resolvedAt)}.`)
      : [`- Sin riesgos resueltos.`],
  };
}

// Builds the live Intervention Brief Markdown from the current cycle. Returns
// { markdown, title } so it can feed both the preview and the downloads.
function buildBriefMarkdown() {
  const cycle = getCurrentCycle();
  const b = cycle?.brief ?? {};
  const causeMap = { M: "Motivación", A: "Ability", P: "Prompt" };
  const title = cycle?.title ?? "[CONFIRMAR]";
  const behavior = b.behavior_statement?.value ?? "[CONFIRMAR]";
  const cause = b.causa?.value ?? (cycle?.causa ? `${cycle.causa} · ${causeMap[cycle.causa] ?? cycle.causa}` : "[CONFIRMAR]");
  const evidence = b.evidencia_primaria?.value ?? "[CONFIRMAR]";
  const source2 = b.segunda_fuente?.value ?? "[CONFIRMAR]";
  const intervention = b.intervencion?.value ?? "[CONFIRMAR]";
  const hypothesis = b.hipotesis?.value ?? "[CONFIRMAR]";
  const metric = b.senal_cuantitativa?.value ?? "[CONFIRMAR]";
  const who = currentUser?.email ?? "usuario";
  const when = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

  const exp = cycle?.experiment ?? {};
  const expStr2 = (v) => v?.value ?? (typeof v === "string" ? v : null);
  const hasExperiment = Object.keys(exp).some((k) => expStr2(exp[k]));

  const lines = [
    `# Intervention Brief`,
    ``,
    `## Ciclo`,
    title,
    ``,
    `## Comportamiento objetivo`,
    behavior,
    ``,
    `## Causa B=MAP`,
    cause,
    ``,
    `## Evidencia`,
    `- ${evidence}`,
    `- ${source2}`,
    ``,
    `## Intervención`,
    intervention,
    ``,
    `## Hipótesis de intervención`,
    hypothesis,
    ``,
    `## Métrica de éxito`,
    metric,
  ];

  if (hasExperiment) {
    lines.push(``, `## Experiment Card`);
    if (expStr2(exp.hipotesis)) lines.push(`**Hipótesis:** ${expStr2(exp.hipotesis)}`);
    if (expStr2(exp.variable)) lines.push(`**Variable:** ${expStr2(exp.variable)}`);
    if (expStr2(exp.metrica_primaria)) lines.push(`**Métrica primaria:** ${expStr2(exp.metrica_primaria)}`);
    if (expStr2(exp.criterio_stop)) lines.push(`**Criterio de stop:** ${expStr2(exp.criterio_stop)}`);
    if (expStr2(exp.tamano_muestra) || expStr2(exp.duracion))
      lines.push(`**Muestra:** ${expStr2(exp.tamano_muestra) || "—"} · **Duración:** ${expStr2(exp.duracion) || "—"}`);
    if (exp.tracking_eventos?.length)
      lines.push(`**Tracking:** ${Array.isArray(exp.tracking_eventos) ? exp.tracking_eventos.join(", ") : exp.tracking_eventos}`);
  }

  // Riesgos reales del ciclo (no un texto fijo): asumidos + resueltos,
  // compartido con el resumen ejecutivo.
  const { assumedLines, resolvedLines } = riskMarkdownSections(cycle, who, when);
  lines.push(
    ``,
    `## Riesgos asumidos`,
    ...assumedLines,
    ``,
    `## Riesgos resueltos`,
    ...resolvedLines,
    ``,
    `---`,
    `*Exportado por ${who} · ${when}*`,
  );

  return { markdown: lines.join("\n"), title };
}

// Resumen ejecutivo: solo existe una vez el ciclo cierra en F5 — el server lo
// genera con el LLM al cerrar (cierre.resumen_ejecutivo), no se re-genera
// desde el cliente. Si el ciclo cerró sin ANTHROPIC_API_KEY configurada,
// queda [CONFIRMAR] en vez de inventar un texto.
function buildExecutiveSummaryMarkdown() {
  const cycle = getCurrentCycle();
  const title = cycle?.title ?? "[CONFIRMAR]";
  const who = currentUser?.email ?? "usuario";
  const when = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  const cierre = cycle?.cierre ?? {};
  const summary = cierre.resumen_ejecutivo?.trim() || "[CONFIRMAR] Este ciclo no tiene resumen ejecutivo generado.";
  const decisionLabel = { escalar: "Escalar", matar: "Matar", iterar: "Iterar" }[cierre.decision] ?? (cierre.decision || "[CONFIRMAR]");
  const { assumedLines, resolvedLines } = riskMarkdownSections(cycle, who, when);
  const lines = [
    `# Resumen ejecutivo`,
    ``,
    `## Ciclo`,
    title,
    ``,
    summary,
    ``,
    `## Decisión`,
    `${decisionLabel}${cierre.delta ? ` (${cierre.delta})` : ""}`,
    ``,
    `## Aprendizaje`,
    cierre.learning || "[CONFIRMAR]",
    ``,
    `## Riesgos`,
    `### Asumidos`,
    ...assumedLines,
    ``,
    `### Resueltos`,
    ...resolvedLines,
    ``,
    `---`,
    `*Exportado por ${who} · ${when}*`,
  ];
  return { markdown: lines.join("\n"), title };
}

function exportExecutiveSummaryFlow() {
  const cycle = getCurrentCycle();
  if (!cycle) { showToast("Selecciona un ciclo primero para exportar el resumen ejecutivo."); return; }
  if (cycle.estado !== "cerrado") { showToast("El resumen ejecutivo se genera al cerrar el ciclo en F5."); return; }
  const { markdown, title } = buildExecutiveSummaryMarkdown();
  openExportPreview(markdown, title);
}

const briefSlug = (title) => (title || "brief").toLowerCase().replace(/\s+/g, "-").slice(0, 40);

function downloadMarkdownFile(markdown, title) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `intervention-brief-${briefSlug(title)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Opens the printable PDF-ready HTML in a new window; it auto-invokes print(),
// where the user can "Guardar como PDF". No PDF library needed (B2).
function openPdfPrint(markdown, title) {
  const html = markdownToPdfHtml(markdown, `Intervention Brief · ${title}`);
  const w = window.open("", "_blank");
  if (!w) { showToast("Permite las ventanas emergentes para exportar a PDF.", true); return; }
  w.document.write(html);
  w.document.close();
}

// B2 · Export preview modal: Markdown preview (mono) + Markdown/PDF toggle +
// copiar / descargar.
function openExportPreview(markdown, title) {
  const overlay = openModal("exportPreview", `
    <div class="export-modal-card export-preview-card">
      <div class="export-preview-head">
        <p class="section-label">Exportar brief</p>
        <div class="export-format-toggle" role="tablist">
          <button type="button" class="fmt-btn active" data-fmt="md" role="tab">Markdown</button>
          <button type="button" class="fmt-btn" data-fmt="pdf" role="tab">PDF</button>
        </div>
      </div>
      <pre class="export-preview" data-view="md">${escapeHtml(markdown)}</pre>
      <p class="export-preview-note" data-view="pdf" hidden>Se abrirá una vista imprimible; usa <strong>“Guardar como PDF”</strong> en el diálogo de impresión.</p>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-act="copy">Copiar Markdown</button>
        <button type="button" class="primary-action" data-act="download">Descargar</button>
      </div>
    </div>`);
  let fmt = "md";
  const pre = overlay.querySelector('[data-view="md"]');
  const note = overlay.querySelector('[data-view="pdf"]');
  const copyBtn = overlay.querySelector('[data-act="copy"]');
  const dlBtn = overlay.querySelector('[data-act="download"]');
  overlay.querySelectorAll(".fmt-btn").forEach((btn) => btn.addEventListener("click", () => {
    fmt = btn.dataset.fmt;
    overlay.querySelectorAll(".fmt-btn").forEach((b) => b.classList.toggle("active", b === btn));
    if (pre) pre.hidden = fmt !== "md";
    if (note) note.hidden = fmt !== "pdf";
    if (copyBtn) copyBtn.hidden = fmt !== "md";
    if (dlBtn) dlBtn.textContent = fmt === "pdf" ? "Abrir para imprimir / PDF" : "Descargar .md";
  }));
  if (dlBtn) dlBtn.textContent = "Descargar .md";
  copyBtn?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(markdown); showToast("Markdown copiado al portapapeles."); }
    catch { showToast("No se pudo copiar. Usa Descargar.", true); }
  });
  dlBtn?.addEventListener("click", () => {
    const label = dlBtn.textContent;
    dlBtn.classList.add("is-loading");
    dlBtn.innerHTML = `<span class="export-spinner" aria-hidden="true"></span>Generando…`;
    // Let the spinner paint before the (blocking) print/download work.
    setTimeout(() => {
      if (fmt === "pdf") openPdfPrint(markdown, title);
      else downloadMarkdownFile(markdown, title);
      dlBtn.classList.remove("is-loading");
      dlBtn.textContent = label;
    }, 300);
  });
}

// --- Toast ---
// PR-6 · toasts apilables: un solo contenedor fijo, cada toast con botón de cierre.
function toastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message, isError = false, duration = isError ? 5000 : 2800) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " is-error" : ""}`;
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Cerrar");
  close.textContent = "×";
  const dismiss = () => el.remove();
  close.addEventListener("click", dismiss);
  el.append(text, close);
  toastStack().appendChild(el);
  setTimeout(dismiss, duration);
}

// --- Placeholder rotation ---
function rotatePlaceholder() {
  if (placeholder) placeholder.firstChild.textContent = prompts[promptIndex % prompts.length];
  promptIndex++;
}

// Re-trigger a CSS animation by toggling a class across a forced reflow.
function restartAnimation(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  el.getBoundingClientRect(); // force reflow so the re-added animation restarts
  el.classList.add(cls);
}

// --- Escape HTML ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Event listeners ---
loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  login(loginEmail.value.trim(), loginPassword.value);
});

logoutButton?.addEventListener("click", logout);

themeToggle?.addEventListener("click", () => {
  const next = workspace.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

// Sub-causa (opcional): refina la causa; el <select> se puebla del bucket de
// la causa confirmada. Doctrina §1 (secundaria, no maneja el filtro).
function renderSubCausa(cycle) {
  const row = document.getElementById("subCausaRow");
  const sel = document.getElementById("briefSubCausa");
  if (!row || !sel) return;
  const causa = cycle?.causa;
  if (!causa || !SUB_CAUSA[causa]) { row.hidden = true; return; }
  row.hidden = false;
  const cur = cycle?.sub_causa ?? "";
  sel.innerHTML = ['<option value="">Sin refinar…</option>']
    .concat(SUB_CAUSA[causa].map((s) => `<option value="${s}"${s === cur ? " selected" : ""}>${escapeHtml(SUB_CAUSA_LABEL[s])}</option>`))
    .join("");
}

document.querySelector("#briefSubCausa")?.addEventListener("change", async (e) => {
  if (!currentCycleId) return;
  const patch = { sub_causa: e.target.value || null };
  cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
  await updateCycle(patch);
});

document.querySelector("#briefSubProfile")?.addEventListener("change", async (e) => {
  if (!currentCycleId) return;
  const patch = { sub_perfil: e.target.value || null };
  cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
  await updateCycle(patch);
  if (e.target.value) showToast("Sub-perfil guardado ✓");
});

document.querySelector("#briefCogLevel")?.addEventListener("change", async (e) => {
  if (!currentCycleId) return;
  const patch = { transicion: e.target.value || null };
  cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
  await updateCycle(patch);
  if (e.target.value) showToast("Nivel cognitivo guardado ✓");
});

// B=MAP cause selector
document.querySelector("#briefCauseSelector")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".bmap-btn");
  if (!btn || !currentCycleId) return;
  const cause = btn.dataset.cause;
  document.querySelectorAll(".bmap-btn").forEach((b) => b.classList.toggle("active", b === btn));
  // Cambiar de causa invalida la sub-causa si ya no pertenece al bucket.
  const cur = getCurrentCycle();
  const keepSub = cur?.sub_causa && SUB_CAUSA[cause]?.includes(cur.sub_causa) ? cur.sub_causa : null;
  const patch = { causa: cause, causa_source: "pm_confirmed", sub_causa: keepSub, brief: { causa: { value: cause, confirmed: true } } };
  cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
  await updateCycle(patch);
  renderActiveCycle();
});

// 2D - metric type (outcome vs actividad) toggle on the Experiment Card
document.querySelector("#metricTypeToggle")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".mt-btn");
  if (!btn || !currentCycleId) return;
  const mtype = btn.dataset.mtype;
  document.querySelectorAll("#metricTypeToggle .mt-btn").forEach((b) => b.classList.toggle("active", b === btn));
  const mWarn = document.getElementById("metricTypeWarn");
  if (mWarn) mWarn.hidden = mtype !== "actividad";
  if (mtype === "actividad") showToast("Ojo: actividad ≠ outcome. El gate F3 lo marcará como pendiente.", true);
  const patch = { experiment: { metrica_tipo: mtype } };
  cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
  await updateCycle(patch);
  renderActiveCycle();
});

// F1→F2 advance button
document.querySelector("#advancePhaseBtn")?.addEventListener("click", () => {
  if (!getCurrentCycle()) return;
  advancePhase(false);
});

// Navigate the active cycle to a phase (F0–F5). Shared by the stepper and ⌘K.
// Back-only: avanzar SIEMPRE pasa por advancePhase() (gate + risk tag) — saltar
// hacia adelante aquí evadiría el gate asesora-no-bloquea sin dejar rastro.
async function goToPhase(key) {
  if (!currentCycleId) { showToast("Selecciona un ciclo primero para ir a una fase."); return; }
  const cycle = getCurrentCycle();
  const current = cycle?.fase_actual ?? cycle?.activePhase ?? "F0";
  if (PHASES.indexOf(key) > PHASES.indexOf(current)) {
    showToast('No puedes saltar fases hacia adelante así — usa "Avanzar" para pasar por el gate.', true);
    return;
  }
  const phases = getPhases().map((p) => ({ ...p, state: p.key === key ? "active" : p.state === "active" ? "todo" : p.state }));
  const patch = { phases, activePhase: key, fase_actual: key };
  cycles = cycles.map((c) => c.id === currentCycleId ? { ...c, ...patch } : c);
  renderStepper();
  await updateCycle(patch);
}

phaseStepper?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-phase]");
  if (!row) return;
  goToPhase(row.dataset.phase);
});

document.getElementById("phaseBar")?.addEventListener("click", (event) => {
  const dot = event.target.closest("[data-phasejump]");
  if (!dot) return;
  goToPhase(dot.dataset.phasejump);
});

document.getElementById("exportBriefBtn")?.addEventListener("click", () => exportBriefFlow(false));

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

messageInput?.addEventListener("input", () => {
  chatInput.classList.toggle("has-text", messageInput.value.trim().length > 0);
});

messageInput?.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.command + " ";
    chatInput.classList.add("has-text");
    messageInput.focus();
  });
});

commandButton?.addEventListener("click", () => openPalette());

function openPalette() {
  commandPalette.hidden = false;
  setTimeout(() => { paletteSearch?.focus(); setPaletteActiveIndex(0); }, 0);
}

function closePalette() {
  commandPalette.hidden = true;
  setPaletteActiveIndex(-1);
}

function runPaletteCommand(command) {
  if (!command) return;
  if (["home", "workspace", "library", "context"].includes(command)) setView(command);
  if (command === "theme") themeToggle.click();
  if (command === "brief") {
    exportBriefFlow();
  }
  if (command === "experiment") {
    if (!getCurrentCycle()) { showToast("Selecciona un ciclo primero para ver la Experiment Card."); }
    else setDeliverable("experiment");
  }
  if (command === "resumen") {
    exportExecutiveSummaryFlow();
  }
  if (command === "advance") {
    if (!getCurrentCycle()) { showToast("Selecciona un ciclo primero para avanzar de fase."); }
    else advancePhase(false);
  }
  if (/^F[0-5]$/.test(command)) {
    if (!getCurrentCycle()) { showToast("Selecciona un ciclo primero para ir a una fase."); }
    else { setView("workspace"); goToPhase(command); }
  }
  closePalette();
}

commandPalette?.addEventListener("click", (event) => {
  if (event.target === commandPalette) { closePalette(); return; }
  const command = event.target.closest?.("[data-palette-command]")?.dataset?.paletteCommand;
  runPaletteCommand(command);
});

// PR-6 · navegación por teclado del ⌘K: ↑/↓ mueve el resaltado, Enter ejecuta.
let paletteActiveIndex = -1;
function visiblePaletteButtons() {
  return Array.from(commandPalette.querySelectorAll("[data-palette-command]")).filter((b) => !b.classList.contains("is-hidden"));
}
function setPaletteActiveIndex(index) {
  const buttons = visiblePaletteButtons();
  buttons.forEach((b) => b.classList.remove("is-active"));
  if (index < 0 || index >= buttons.length) { paletteActiveIndex = -1; return; }
  paletteActiveIndex = index;
  const active = buttons[index];
  active.classList.add("is-active");
  active.scrollIntoView({ block: "nearest" });
}
function movePaletteActive(delta) {
  const buttons = visiblePaletteButtons();
  if (!buttons.length) return;
  const next = paletteActiveIndex < 0 ? (delta > 0 ? 0 : buttons.length - 1) : (paletteActiveIndex + delta + buttons.length) % buttons.length;
  setPaletteActiveIndex(next);
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (commandPalette.hidden) openPalette(); else closePalette();
    return;
  }
  if (commandPalette.hidden) return;
  if (event.key === "Escape") { closePalette(); return; }
  if (event.key === "ArrowDown") { event.preventDefault(); movePaletteActive(1); return; }
  if (event.key === "ArrowUp") { event.preventDefault(); movePaletteActive(-1); return; }
  if (event.key === "Enter") {
    const buttons = visiblePaletteButtons();
    const target = paletteActiveIndex >= 0 ? buttons[paletteActiveIndex] : buttons[0];
    if (target) { event.preventDefault(); runPaletteCommand(target.dataset.paletteCommand); }
  }
});

exportBrief?.addEventListener("click", () => exportBriefFlow());

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

newCycleButton?.addEventListener("click", openNewCycleModal);
document.getElementById("addLearningBtn")?.addEventListener("click", openLearningModal);
newCycleEmpty?.addEventListener("click", openNewCycleModal);

// Home filters (PR-1): status + cause compose with AND.
document.querySelector("#statusFilters")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-statusfilter]");
  if (!btn) return;
  statusFilter = btn.dataset.statusfilter;
  document.querySelectorAll("#statusFilters .segment").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  renderCyclesList();
});

document.querySelector("#causeFilters")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-causefilter]");
  if (!btn) return;
  causeFilter = btn.dataset.causefilter;
  document.querySelectorAll("#causeFilters .filter").forEach((b) => b.classList.toggle("active", b === btn));
  renderCyclesList();
});

document.querySelector("#clearCyclesFilters")?.addEventListener("click", () => {
  statusFilter = "all";
  causeFilter = "all";
  document.querySelectorAll("#statusFilters .segment").forEach((b) => {
    const on = b.dataset.statusfilter === "all";
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll("#causeFilters .filter").forEach((b) =>
    b.classList.toggle("active", b.dataset.causefilter === "all"));
  renderCyclesList();
});

// Empty-state example chips (A3) → create a cycle from the example behavior
document.querySelectorAll("[data-example-cycle]").forEach((btn) => {
  btn.addEventListener("click", () => createCycle(btn.dataset.exampleCycle));
});

// Quickstart (Cambio 7): un clic, un comportamiento real, directo a F0 — sin
// pasar por el manual. Usa el primer ejemplo como punto de partida.
document.getElementById("quickstartButton")?.addEventListener("click", async () => {
  const firstExample = document.querySelector("[data-example-cycle]")?.dataset.exampleCycle;
  if (!firstExample) { openNewCycleModal(); return; }
  await createCycle(firstExample);
  showToast("Ciclo creado. Sigue el checklist de la izquierda — cada campo se habilita al llegar a su fase.");
});
document.querySelectorAll("[data-open-context]").forEach((el) => {
  el.addEventListener("click", (e) => { e.preventDefault(); setView("context"); });
});

briefSwitch?.addEventListener("click", () => setDeliverable("brief"));
experimentSwitch?.addEventListener("click", () => setDeliverable("experiment"));
specSwitch?.addEventListener("click", () => setDeliverable("spec"));

// Library filters — unified (A4). Scoped to #patternFilters (not the Home row).
document.querySelector("#patternFilters")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  document.querySelectorAll("#patternFilters .filter").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  libFilters.tipoCausa = btn.dataset.filter ?? "all";
  applyLibraryFilters();
});
document.querySelector("#patternSubProfile")?.addEventListener("change", (e) => { libFilters.sub = e.target.value; applyLibraryFilters(); });
document.querySelector("#patternLevel")?.addEventListener("change", (e) => { libFilters.level = e.target.value; applyLibraryFilters(); });
document.querySelector("#patternTest")?.addEventListener("change", (e) => { libFilters.test = e.target.value; applyLibraryFilters(); });

let _searchTimer = null;
document.querySelector("#patternSearch")?.addEventListener("input", (e) => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { libFilters.search = e.target.value.toLowerCase().trim(); applyLibraryFilters(); }, 200);
});

// Close cycle button
document.getElementById("closeCycleButton")?.addEventListener("click", closeCycle);

// F5 DecisionPicker: 3-way segmented control. Sets the (hidden) decision value,
// derives the pattern type, and relabels the submit button per decision.
const DECISION_META = {
  escalar: { tipo: "patron", submit: "Escalar y crear patrón" },
  matar: { tipo: "anti_patron", submit: "Matar y crear anti-patrón" },
  iterar: { tipo: "patron", submit: "Iterar — volver a F1" },
};
document.getElementById("decisionPicker")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-decision]");
  if (!btn) return;
  const decision = btn.dataset.decision;
  document.querySelectorAll("#decisionPicker .dp-btn").forEach((b) => b.classList.toggle("active", b === btn));
  const hidden = document.getElementById("closureDecision");
  if (hidden) hidden.value = decision;
  const meta = DECISION_META[decision] ?? DECISION_META.escalar;
  const patternType = document.getElementById("patternType");
  if (patternType) patternType.value = meta.tipo;
  const submitBtn = document.getElementById("closeCycleButton");
  if (submitBtn && !submitBtn.disabled) submitBtn.textContent = meta.submit;
});

paletteSearch?.addEventListener("input", () => {
  const term = paletteSearch.value.toLowerCase();
  const buttons = commandPalette.querySelectorAll("[data-palette-command]");
  let visible = 0;
  buttons.forEach((button) => {
    const show = !term || button.textContent.toLowerCase().includes(term);
    button.classList.toggle("is-hidden", !show);
    if (show) visible++;
  });
  // Hide a category header when none of its buttons (siblings until the next
  // header) are visible.
  commandPalette.querySelectorAll("[data-palette-group]").forEach((group) => {
    let anyVisible = false;
    for (let el = group.nextElementSibling; el && !el.hasAttribute("data-palette-group"); el = el.nextElementSibling) {
      if (el.matches("[data-palette-command]") && !el.classList.contains("is-hidden")) { anyVisible = true; break; }
    }
    group.classList.toggle("is-hidden", !anyVisible);
  });
  let emptyEl = commandPalette.querySelector(".palette-empty");
  if (visible === 0) {
    if (!emptyEl) {
      emptyEl = document.createElement("p");
      emptyEl.className = "palette-empty";
      emptyEl.textContent = "Sin resultados";
      commandPalette.querySelector(".palette-card").appendChild(emptyEl);
    }
  } else if (emptyEl) {
    emptyEl.remove();
  }
  setPaletteActiveIndex(visible > 0 ? 0 : -1);
});

// --- Start ---
init();
