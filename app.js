import { getGateRequirements } from "./src/phaseEngine.js";
import { markdownToPdfHtml } from "./src/exportService.js";

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
const deliverableTitle = document.querySelector("#deliverableTitle");
const briefBody = document.querySelector("#briefBody");
const experimentBody = document.querySelector("#experimentBody");
const paletteSearch = document.querySelector("#paletteSearch");
const logoutButton = document.querySelector("#logoutButton");
const userEmailEl = document.querySelector("#userEmail");

// --- Phase seed (template for new cycles) ---
const phaseSeed = [
  { key: "F0", label: "Sense", state: "active" },
  { key: "F1", label: "Diagnose", state: "todo" },
  { key: "F2", label: "Design", state: "todo" },
  { key: "F3", label: "Decide", state: "todo" },
  { key: "F4", label: "Deploy", state: "todo" },
  { key: "F5", label: "Distill", state: "todo" },
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

function isRiskAccepted() {
  return getCurrentCycle()?.riskAccepted ?? false;
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
  const roleLabel = currentUser?.role === "admin" ? " · admin" : currentUser?.role === "pm" ? " · pm" : "";
  userEmailEl.textContent = (currentUser?.email ?? "") + roleLabel;
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
    cyclesList.innerHTML = `<p class="error-state">No se pudieron cargar los ciclos. <button onclick="loadCycles()">Reintentar</button></p>`;
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
      <p class="eyebrow">Nuevo ciclo · F0 Sense</p>
      <h2 class="pd-title">Empieza por un comportamiento, no por una feature.</h2>
      <label class="nc-label" for="ncBehavior">¿Qué seller, haciendo qué, no está haciendo qué?</label>
      <textarea id="ncBehavior" class="nc-textarea" rows="3" placeholder="El Rebuscador Digital no configura su 2º envío dentro de las 72h tras el primer pedido…"></textarea>
      <div class="nc-grid">
        <div><label class="nc-label" for="ncSub">Sub-perfil (opcional)</label><input id="ncSub" class="nc-input" placeholder="Rebuscador Digital" /></div>
        <div><label class="nc-label" for="ncTrans">Transición (opcional)</label><input id="ncTrans" class="nc-input" placeholder="Setup_Aha" /></div>
      </div>
      <p id="ncError" class="login-error" hidden></p>
      <div class="export-modal-actions">
        <button type="button" class="secondary-action" data-nc="cancel">Cancelar</button>
        <button type="button" class="primary-action" data-nc="create">Crear ciclo · abrir F0</button>
      </div>
    </div>`);
  const q = (sel) => overlay.querySelector(sel);
  q('[data-nc="cancel"]')?.addEventListener("click", overlay.close);
  const submit = async () => {
    const behavior = (q("#ncBehavior")?.value ?? "").trim();
    if (!behavior) { const err = q("#ncError"); if (err) { err.textContent = "Describe el comportamiento para empezar."; err.hidden = false; } return; }
    overlay.close();
    await createCycle(behavior, {
      sub_perfil: (q("#ncSub")?.value ?? "").trim().replace(/\s+/g, "_") || null,
      transicion: (q("#ncTrans")?.value ?? "").trim() || null,
    });
  };
  q('[data-nc="create"]')?.addEventListener("click", submit);
  q("#ncBehavior")?.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); });
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
        phases: structuredClone(phaseSeed),
        activePhase: "F0",
        riskAccepted: false,
      }),
    });
    if (res.status === 422) {
      // F0 validation: the title reads like a feature, not a behavior.
      const err = await res.json().catch(() => ({}));
      setView("workspace");
      addFeatureRejection(err.error ?? "Eso es una solución, no un comportamiento.", err.hint);
      return;
    }
    if (!res.ok) return;
    const cycle = await res.json();
    cycles.push(cycle);
    currentCycleId = cycle.id;
    renderCyclesList();
    renderActiveCycle();  // also calls loadBriefFromCycle internally
    renderStepper();
    renderBriefState();
    addAiNote(`Nuevo ciclo "${escapeHtml(cycle.title)}" en F0 · Sense. Empecemos: ¿qué seller, haciendo qué, no está haciendo qué?`);
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

let cyclesFilter = "all";

// Cognitive ladder for the transition path on cards (A3).
const COG_LEVELS = ["Setup", "Aha", "Hábito", "Maestría"];
function cognitivePathHtml(transicion) {
  if (!transicion) return "";
  const parts = String(transicion).split(/[_→-]/).map((s) => s.trim());
  const from = parts[0], to = parts[1];
  return `<div class="cognitive-path">${COG_LEVELS.map((lvl) =>
    (lvl === from || lvl === to) ? `<strong>${escapeHtml(lvl)}</strong>` : `<span class="muted-step">${escapeHtml(lvl)}</span>`
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
    cycle.sub_perfil ? `<span class="chip">${escapeHtml(cycle.sub_perfil.replace(/_/g, " "))}</span>` : "",
    causeLabel ? `<span class="chip cause-chip ${escapeHtml(cycle.causa)}">${escapeHtml(causeLabel)}</span>` : "",
  ].join("");
  const statusPill = cycle.estado === "cerrado"
    ? `<span class="status-pill closed">${cycle.resultado_cierre === "matado" ? "✗ Matado" : cycle.resultado_cierre === "iterando" ? "↻ Iterando" : "✓ Escalado"}</span>`
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

function matchesCycleFilter(cycle) {
  if (cyclesFilter === "all") return true;
  if (cyclesFilter === "activo") return (cycle.estado ?? "activo") === "activo";
  if (cyclesFilter === "cerrado") return cycle.estado === "cerrado" || cycle.estado === "descartado";
  return cycle.causa === cyclesFilter; // M/A/P
}

function renderCyclesList() {
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
  cyclesList.innerHTML = body || `<p class="loading-state">Sin ciclos para este filtro.</p>`;

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
  F0: { label: "Sense", goal: "Detecta un comportamiento anómalo: ¿qué seller, haciendo qué, no está haciendo qué? Añade una señal cuantitativa." },
  F1: { label: "Diagnose", goal: "Encuentra la causa raíz con B=MAP. Necesitas ≥2 fuentes confirmadas y declarar la causa (Motivación / Ability / Prompt)." },
  F2: { label: "Design", goal: "Diseña la intervención sobre la causa detectada y formula una hipótesis falsable." },
  F3: { label: "Decide", goal: "Dimensiona el experimento: métrica de éxito, tamaño/duración y criterio de stop." },
  F4: { label: "Deploy", goal: "Lanza y observa: experimento corriendo y tracking confirmado." },
  F5: { label: "Distill", goal: "Extrae el aprendizaje: resultado, decisión (escalar/matar/iterar) y patrón nombrado." },
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
  el.hidden = false;
  el.innerHTML = `
    <div class="pg-head"><strong>${escapeHtml(phase)} · ${escapeHtml(meta.label)}</strong><span class="pg-count">${done}/${reqs.length} para cerrar el gate</span></div>
    <p class="pg-goal">${escapeHtml(meta.goal)}</p>
    ${reqs.length ? `<ul class="pg-checklist">${items}</ul>` : ""}`;
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
  if (isClosed && !messageStream.querySelector(".closed-cycle-note")) {
    const note = document.createElement("div");
    note.className = "closed-cycle-note ai-note";
    note.innerHTML = `Ciclo cerrado. Revisa el patrón en la <button class="inline-link" type="button" onclick="setView('library')">Biblioteca de Patrones</button> o <button class="inline-link" type="button" onclick="document.getElementById('newCycleButton').click()">crea un nuevo ciclo</button>.`;
    messageStream.appendChild(note);
  }
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
        resultado_cierre: closureDecision?.value ?? "escalado",
        decision: closureDecision?.value ?? "escalado",
        learning,
        delta: closureDelta?.value.trim() ?? null,
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
    const { cycle, pattern, iterated } = data;
    cycles = cycles.map((c) => (c.id === cycle.id ? cycle : c));
    if (iterated) {
      // Iteration loop: cycle went back to F1 instead of closing.
      renderCyclesList();
      renderActiveCycle();
      renderStepper();
      renderIterationBanner(cycle.iterationCount ?? 2);
      addAiNote(`Iteración ${cycle.iterationCount ?? 2} — de vuelta en F1 · Diagnose para re-diagnosticar.`);
      if (closeCycleBtn) { closeCycleBtn.disabled = false; closeCycleBtn.textContent = "Cerrar ciclo y crear patrón"; }
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
      patternsList.innerHTML = `<p class="error-state">No se pudieron cargar los patrones. <button onclick="loadPatterns()">Reintentar</button></p>`;
    }
  }
}

const causeLabelEs = (c) => c === "M" ? "Motivación" : c === "A" ? "Ability" : c === "P" ? "Prompt" : c;

// A4 · unified library filtering state + facets
const libFilters = { tipoCausa: "all", sub: "", level: "", search: "" };
function populateLibraryFacets() {
  const subs = [...new Set(patterns.map((p) => p.sub_perfil).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const levels = [...new Set(patterns.map((p) => p.transicion).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Rebuild options fully (placeholder + values) — no querySelector, so no
  // possible null dereference.
  const fill = (sel, placeholder, values, cur, arrow) => {
    if (!sel) return;
    const opts = [`<option value="">${placeholder}</option>`].concat(
      values.map((v) => {
        const label = arrow ? v.replace(/_/g, "→") : v.replace(/_/g, " ");
        return `<option value="${escapeHtml(v)}"${v === cur ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
    );
    sel.innerHTML = opts.join("");
  };
  fill(document.getElementById("patternSubProfile"), "Sub-perfil", subs, libFilters.sub, false);
  fill(document.getElementById("patternLevel"), "Nivel cognitivo", levels, libFilters.level, true);
}
function applyLibraryFilters() {
  const { tipoCausa, sub, level, search } = libFilters;
  let list = patterns;
  if (tipoCausa === "patron" || tipoCausa === "anti_patron") list = list.filter((p) => p.tipo === tipoCausa);
  else if (["m", "a", "p"].includes(tipoCausa)) list = list.filter((p) => (p.causa ?? "").toUpperCase() === tipoCausa.toUpperCase());
  if (sub) list = list.filter((p) => p.sub_perfil === sub);
  if (level) list = list.filter((p) => p.transicion === level);
  if (search) list = list.filter((p) =>
    [p.nombre, p.aprendizaje, p.sub_perfil, p.causa, p.transicion].some((x) => (x ?? "").toLowerCase().includes(search)));
  renderPatternsList(list);
}

function renderPatternsList(list = patterns) {
  populateLibraryFacets();
  if (!list.length) {
    patternsList.innerHTML = `<p class="empty-library">${patterns.length ? "Sin patrones para este filtro." : "Aquí aparecerán los aprendizajes del equipo. Para crear el primero, lleva un ciclo hasta F5 · Distill y ciérralo con un aprendizaje."}</p>`;
    return;
  }
  patternsList.innerHTML = list
    .map((p) => {
      const isAnti = p.tipo === "anti_patron";
      const since = p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "";
      const chips = [
        p.causa ? `<span class="chip cause-chip ${escapeHtml(p.causa)}">${escapeHtml(causeLabelEs(p.causa))}</span>` : "",
        p.sub_perfil ? `<span class="chip">${escapeHtml(p.sub_perfil.replace(/_/g, " "))}</span>` : "",
        p.transicion ? `<span class="chip">${escapeHtml(p.transicion.replace(/_/g, "→"))}</span>` : "",
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
    btn.addEventListener("click", (e) => { e.stopPropagation(); reusePattern(btn.dataset.patternId); });
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
        ${p.sub_perfil ? `<span class="chip">${escapeHtml(p.sub_perfil.replace(/_/g, " "))}</span>` : ""}
        ${p.transicion ? `<span class="chip">${escapeHtml(p.transicion.replace(/_/g, "→"))}</span>` : ""}
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
  overlay.querySelector('[data-pd="reuse"]')?.addEventListener("click", () => { overlay.close(); reusePattern(p.id); });
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
  if (view === "library") renderPatternsList();
  if (view === "analytics") loadAnalytics();
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
    analyticsGrid.innerHTML = `<p class="error-state">No se pudieron cargar las métricas. <button onclick="loadAnalytics()">Reintentar</button></p>`;
  }
}

function renderAnalytics(a) {
  const tile = (label, value, hint) =>
    `<div class="stat-tile"><span class="stat-value">${escapeHtml(String(value))}</span><span class="stat-label">${escapeHtml(label)}</span>${hint ? `<span class="stat-hint">${escapeHtml(hint)}</span>` : ""}</div>`;
  analyticsGrid.innerHTML = [
    tile("Ciclos totales", a.cycles?.total ?? 0, `${a.cycles?.active ?? 0} en curso · ${a.cycles?.closed ?? 0} cerrados`),
    tile("Rigor de gates", a.gates?.rigor != null ? `${a.gates.rigor}%` : "—", `${a.gates?.passed ?? 0} limpios · ${a.gates?.skippedWithRisk ?? 0} con riesgo`),
    tile("Iteraciones", a.iterations ?? 0, "ciclos que re-diagnosticaron"),
    tile("Patrones", a.patterns?.total ?? 0, `${a.patterns?.reused ?? 0} reutilizados`),
    tile("Rechazos F0", a.behavior?.rejected ?? 0, "arranques por feature evitados"),
    tile("Mensajes de chat", a.chat?.messages ?? 0, `${a.chat?.briefExtractions ?? 0} extracciones de brief`),
    tile("Exports", a.exports?.attempted ?? 0, `${a.exports?.withAssumptions ?? 0} con supuestos`),
  ].join("");
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

function renderContextDocuments(data) {
  contextPendingBanner.textContent = `${data.pendingCount} campos pendientes [CONFIRMAR] — la IA los tratará como supuestos.`;
  contextDocuments.innerHTML = data.documents
    .map((doc) => `
      <section class="context-document" data-context-id="${escapeHtml(doc.id)}">
        <header><h2>${escapeHtml(doc.title)}</h2><span>v${escapeHtml(String(doc.version))} · ${escapeHtml(String(doc.pendingCount))} pendientes</span></header>
        <textarea aria-label="Editar ${escapeHtml(doc.title)}">${escapeHtml(doc.content)}</textarea>
        <footer><span>Actualizado por ${escapeHtml(doc.updatedBy)} · ${escapeHtml(new Date(doc.updatedAt).toLocaleString("es-CO"))}</span><button class="secondary-action" type="button" data-save-context ${currentUser?.role !== "admin" ? 'disabled title="Solo admins pueden guardar"' : ""}>Guardar${currentUser?.role === "admin" ? " ✓" : " (solo admins)"}</button></footer>
      </section>`)
    .join("");
  contextDocuments.querySelectorAll("[data-save-context]").forEach((button) => {
    button.addEventListener("click", () => saveContextDocument(button.closest("[data-context-id]")));
  });
}

async function saveContextDocument(section) {
  const id = section.dataset.contextId;
  const content = section.querySelector("textarea").value;
  const button = section.querySelector("[data-save-context]");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const response = await fetch(`/api/context/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ content, reason: "Edición desde Contexto Dropi" }),
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
    button.disabled = false;
    button.textContent = "Guardar como admin";
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

// A2 · F4 "live": reflect the experiment run state in the panel footer.
function renderExperimentStatus(cycle, phase) {
  const el = document.getElementById("experimentStatus");
  if (!el) return;
  const exp = cycle?.experiment ?? {};
  const val = (v) => v?.value ?? (typeof v === "string" ? v : null);
  if (phase === "F4" && cycle?.estado === "activo") {
    const sample = val(exp.tamano_muestra);
    const duration = val(exp.duracion);
    const bits = [sample ? `muestra ${escapeHtml(sample)}` : "", duration ? `${escapeHtml(duration)}` : ""].filter(Boolean).join(" · ");
    el.classList.add("is-live");
    el.innerHTML = `<span></span>Corriendo${bits ? ` · ${bits}` : ""}`;
  } else if (phase === "F5" || cycle?.estado === "cerrado") {
    el.classList.remove("is-live");
    el.innerHTML = `<span></span>Concluido`;
  } else {
    el.classList.remove("is-live");
    el.innerHTML = `<span></span>Borrador · listo para F3`;
  }
}

function setDeliverable(next) {
  deliverable = next;
  briefBody.hidden = next !== "brief";
  experimentBody.hidden = next !== "experiment";
  briefSwitch.classList.toggle("active", next === "brief");
  experimentSwitch.classList.toggle("active", next === "experiment");
  deliverableTitle.textContent = next === "brief" ? "Intervention Brief" : "Experiment Card";
  progressText.textContent = next === "brief" ? `${filled} / 11 campos confirmados` : "0 / 9 campos confirmados";
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

  // 2. Fenced code blocks (must run before inline code)
  s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trimEnd()}</code></pre>`);

  // 3. Inline code
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // 4. Line-by-line pass for headings, lists, blockquotes, HR
  const lines = s.split("\n");
  const out = [];
  let inUl = false, inOl = false;

  const closeLists = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### /.test(line))     { closeLists(); out.push(`<h4>${line.slice(4)}</h4>`); continue; }
    if (/^## /.test(line))      { closeLists(); out.push(`<h3>${line.slice(3)}</h3>`); continue; }
    if (/^# /.test(line))       { closeLists(); out.push(`<h3>${line.slice(2)}</h3>`); continue; }
    if (/^&gt; /.test(line))    { closeLists(); out.push(`<blockquote>${line.slice(5)}</blockquote>`); continue; }
    if (/^---+$/.test(line))    { closeLists(); out.push("<hr>"); continue; }
    if (/^[-*] /.test(line)) {
      if (!inUl) { if (inOl) { out.push("</ol>"); inOl = false; } out.push("<ul>"); inUl = true; }
      out.push(`<li>${line.slice(2)}</li>`); continue;
    }
    if (/^\d+\. /.test(line)) {
      if (!inOl) { if (inUl) { out.push("</ul>"); inUl = false; } out.push("<ol>"); inOl = true; }
      out.push(`<li>${line.replace(/^\d+\. /, "")}</li>`); continue;
    }
    closeLists();
    if (!line.trim()) { out.push(""); continue; }
    out.push(line);
  }
  closeLists();
  s = out.join("\n");

  // 5. Bold and italic (after line processing to avoid breaking list tags)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/_([^_\n]+)_/g, "<em>$1</em>");

  // 6. Wrap plain-text runs in <p>, convert single \n to <br> within paragraphs
  const blocks = s.split(/\n{2,}/);
  s = blocks.map((block) => {
    const t = block.trim();
    if (!t) return "";
    if (/^<(h[2-4]|ul|ol|pre|hr|blockquote)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  return s;
}

function loadMessages(cycleId) {
  const cycle = cycles.find((c) => c.id === cycleId);
  const msgs = cycle?.messages ?? [];
  renderMessages(msgs);
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
}

// --- Chat ---
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

  if (text.startsWith("/nuevo-ciclo")) {
    const title = text.replace("/nuevo-ciclo", "").trim();
    if (title) await createCycle(title); else openNewCycleModal();
    return;
  }

  if (text.startsWith("/brief")) {
    downloadBrief();
    addAiNote("Brief exportado en Markdown. También queda vivo en el panel derecho.");
    return;
  }

  if (text.startsWith("/experimento")) {
    setDeliverable("experiment");
    addAiNote("Cambiando a Experiment Card. Completa los campos de hipótesis, métrica y criterio de stop.");
    return;
  }

  // Real LLM call
  inner.insertAdjacentHTML(
    "beforeend",
    `<article class="ai-message"><div class="ai-avatar">D</div><div class="ai-body"><p class="thinking">…</p></div></article>`
  );
  messageStream.scrollTop = messageStream.scrollHeight;
  const thinkingEl = inner.querySelector(".ai-message:last-child .ai-body p");

  try {
    const res = await apiFetch("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ message: text, cycleId: currentCycleId }),
    });
    const data = await res.json();
    thinkingEl.classList.remove("thinking");
    const reply = data.reply ?? data.error ?? "Sin respuesta.";
    thinkingEl.innerHTML = renderMarkdown(reply);
    if (data.cycle) {
      // Server is authoritative: it appended messages and auto-extracted brief
      // fields from the conversation (Fase 1). Adopt it and refresh the brief.
      cycles = cycles.map((c) => (c.id === data.cycle.id ? data.cycle : c));
      renderActiveCycle();
      renderBriefState();
      flashBriefFields(data.changed);
    } else {
      // Fallback: keep local cycle.messages in sync
      const activeCycle = getCurrentCycle();
      if (activeCycle) {
        const now = new Date().toISOString();
        activeCycle.messages = [
          ...(activeCycle.messages ?? []),
          { id: `u-${Date.now()}`, role: "user", content: text, created_at: now },
          { id: `a-${Date.now()}`, role: "assistant", content: reply, created_at: now },
        ];
        cycles = cycles.map((c) => (c.id === currentCycleId ? activeCycle : c));
      }
    }
  } catch {
    thinkingEl.classList.remove("thinking");
    thinkingEl.textContent = "Error de conexión con el asistente.";
  }
  messageStream.scrollTop = messageStream.scrollHeight;
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

// Iteration loop banner (purple) shown when a cycle loops back to F1.
function renderIterationBanner(count) {
  const inner = messageStream.querySelector(".stream-inner") || messageStream;
  inner.insertAdjacentHTML(
    "beforeend",
    `<div class="iteration-banner">↻ Iteración ${escapeHtml(String(count))} — de vuelta en F1 · Diagnose</div>`
  );
  messageStream.scrollTop = messageStream.scrollHeight;
}

function renderBriefState() {
  const accepted = isRiskAccepted();
  riskTag.classList.toggle("is-hidden", !accepted);
  if (accepted) {
    const cycle = getCurrentCycle();
    const who = currentUser?.email ?? "usuario";
    // Reflect the actual last accepted risk (recorded server-side) instead of a
    // hardcoded phrase.
    const lastRisk = (cycle?.risks ?? []).filter((r) => !r.resolvedAt).slice(-1)[0];
    const phase = lastRisk?.phase ?? "F1";
    const text = lastRisk?.text ?? "Avance de fase con gate incompleto.";
    const stamp = lastRisk?.acceptedAt ?? cycle?.updatedAt;
    const when = stamp ? new Date(stamp).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "";
    riskTag.innerHTML = `<span>${escapeHtml(phase)}</span> ${escapeHtml(text)} Riesgo aceptado por ${escapeHtml(who)} · ${escapeHtml(when)}.`;
  }
  setDeliverable(deliverable);
}

function setBriefProgress(value) {
  filled = value;
  progressText.textContent = `${filled} / 11 campos confirmados`;
  progressText.title = "Haz click en cualquier campo [CONFIRMAR] del brief para confirmarlo";
  progressFill.style.width = `${Math.round((filled / 11) * 100)}%`;
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

// Make a brief/experiment panel field inline-editable. cyclePath is "brief.behavior_statement", "sub_perfil", etc.
function makeFieldEditable(el, cyclePath) {
  if (!el) return;
  if (el.dataset.editableRegistered) return;
  el.dataset.editableRegistered = "1";
  el.style.cursor = "pointer";
  el.title = "Click para editar";
  el.addEventListener("click", () => {
    if (el.dataset.editing) return;
    el.dataset.editing = "1";
    const isConfirm = el.classList.contains("confirm-field");
    const current = isConfirm ? "" : el.textContent.trim();
    const input = document.createElement("input");
    input.className = "brief-inline-input";
    input.value = current;
    el.replaceWith(input);
    input.focus();
    const save = async () => {
      const val = input.value.trim();
      const patch = {};
      if (cyclePath === "sub_perfil") {
        patch.sub_perfil = val || null;
      } else {
        setNestedPath(patch, cyclePath, { value: val, confirmed: !!val });
      }
      if (currentCycleId) {
        cycles = cycles.map((c) => c.id === currentCycleId ? deepMerge(c, patch) : c);
        try {
          await updateCycle(patch);
          showToast("Campo guardado ✓");
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
  if (value) {
    el.textContent = value;
    el.classList.remove("confirm-field");
    el.classList.add("mono-value");
  } else {
    el.innerHTML = "<strong>[CONFIRMAR]</strong>";
    el.classList.add("confirm-field");
    el.classList.remove("mono-value");
  }
}

// Flash the brief fields the LLM just auto-filled (Fase 1). `changed` is the list
// of keys returned by /api/chat, e.g. ["brief.behavior_statement", "causa"].
const BRIEF_FIELD_TO_EL = {
  "brief.behavior_statement": "briefBehavior",
  "brief.evidencia_primaria": "briefEvidence",
  "brief.segunda_fuente": "secondSource",
  "brief.hipotesis": "hypothesisField",
  "brief.senal_cuantitativa": "metricField",
  "sub_perfil": "briefSubProfile",
  "transicion": "briefCogLevel",
  "causa": "briefCause",
};
function flashBriefFields(changed) {
  if (!Array.isArray(changed) || !changed.length) return;
  for (const key of changed) {
    const el = document.getElementById(BRIEF_FIELD_TO_EL[key]);
    if (!el) continue;
    el.classList.remove("fillpop");
    void el.offsetWidth; // restart animation
    el.classList.add("fillpop");
  }
  if (changed.length) showToast(`Brief actualizado: ${changed.length} campo(s) desde la conversación.`);
}

// Read cycle.brief{} and cycle top-level fields → populate all brief panel DOM elements
function loadBriefFromCycle(cycle) {
  const b = cycle?.brief ?? {};
  const causeMap = { M: "Motivación", A: "Ability", P: "Prompt" };

  // Brief panel fields
  const briefBehavior = document.querySelector("#briefBehavior");
  const briefSubProfile = document.querySelector("#briefSubProfile");
  const briefCogLevel = document.querySelector("#briefCogLevel");
  const briefEvidence = document.querySelector("#briefEvidence");

  setField(briefBehavior, b.behavior_statement?.value ?? null);
  setField(briefSubProfile, cycle?.sub_perfil?.replace(/_/g, " ") ?? null);
  setField(briefCogLevel, b.nivel_cognitivo?.value ?? (cycle?.transicion ? cycle.transicion.replace(/_/g, "→") : null));
  setField(briefEvidence, b.evidencia_primaria?.value ?? null);
  setField(secondSource, b.segunda_fuente?.value ?? null);
  setField(hypothesisField, b.hipotesis?.value ?? b.intervencion?.value ?? null);
  setField(metricField, b.senal_cuantitativa?.value ?? null);

  // B=MAP selector sync
  const activeCause = cycle?.causa;
  document.querySelectorAll(".bmap-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.cause === activeCause));

  // Experiment card — all fields
  const exp = cycle?.experiment ?? {};
  const expStr = (v) => v?.value ?? (typeof v === "string" ? v : null);
  const expHypothesis = document.querySelector("#experimentHypothesis");
  const expVariable = document.querySelector("#experimentVariable");
  const expMetric = document.querySelector("#experimentMetric");
  const expStop = document.querySelector("#experimentStop");
  const expSample = document.querySelector("#experimentSample");
  const expDuration = document.querySelector("#experimentDuration");
  const expTracking = document.querySelector("#experimentTracking");

  setField(expHypothesis, expStr(exp.hipotesis));
  setField(expVariable, expStr(exp.variable));
  setField(expMetric, expStr(exp.metrica_primaria));
  setField(expStop, expStr(exp.criterio_stop));
  setField(expSample, expStr(exp.tamano_muestra));
  setField(expDuration, expStr(exp.duracion));
  const trackVal = Array.isArray(exp.tracking_eventos) && exp.tracking_eventos.length
    ? exp.tracking_eventos.join(", ") : expStr(exp.tracking_eventos);
  setField(expTracking, trackVal);

  // Make brief fields inline-editable
  makeFieldEditable(briefBehavior, "brief.behavior_statement");
  makeFieldEditable(briefSubProfile, "sub_perfil");
  makeFieldEditable(briefCogLevel, "brief.nivel_cognitivo");
  makeFieldEditable(briefEvidence, "brief.evidencia_primaria");
  makeFieldEditable(secondSource, "brief.segunda_fuente");
  makeFieldEditable(hypothesisField, "brief.hipotesis");
  makeFieldEditable(metricField, "brief.senal_cuantitativa");

  // Make experiment fields inline-editable
  makeFieldEditable(expHypothesis, "experiment.hipotesis");
  makeFieldEditable(expVariable, "experiment.variable");
  makeFieldEditable(expMetric, "experiment.metrica_primaria");
  makeFieldEditable(expStop, "experiment.criterio_stop");
  makeFieldEditable(expSample, "experiment.tamano_muestra");
  makeFieldEditable(expDuration, "experiment.duracion");
  makeFieldEditable(expTracking, "experiment.tracking_eventos");

  // Progress: count confirmed fields (max 11)
  const trackFields = [
    b.behavior_statement, b.nivel_cognitivo, b.causa,
    b.evidencia_primaria, b.segunda_fuente, b.hipotesis, b.senal_cuantitativa,
  ];
  let cnt = trackFields.filter((f) => f?.confirmed).length;
  if (cycle?.sub_perfil) cnt++;
  if (cycle?.transicion) cnt++;
  if (cycle?.causa) cnt++;
  setBriefProgress(Math.min(cnt, 11));
}

// Fields required for a complete Intervention Brief; those without a value are
// treated as [CONFIRMAR] (assumptions) and drive the export validation modal.
const REQUIRED_BRIEF_FIELDS = [
  { key: "behavior_statement", label: "Comportamiento objetivo" },
  { key: "causa", label: "Causa B=MAP", topLevel: true },
  { key: "evidencia_primaria", label: "Evidencia primaria" },
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
  overlay.querySelector('[data-export="complete"]')?.addEventListener("click", overlay.close);
  overlay.querySelector('[data-export="force"]')?.addEventListener("click", () => exportBriefFlow(true));
}

function closeExportModal() {
  document.getElementById("exportModal")?.remove();
}

function downloadBrief() {
  const { markdown, title } = buildBriefMarkdown();
  openExportPreview(markdown, title);
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
  const hypothesis = b.hipotesis?.value ?? b.intervencion?.value ?? "[CONFIRMAR]";
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

  lines.push(
    ``,
    `## Riesgos asumidos`,
    isRiskAccepted()
      ? `- F1: Diagnóstico con 1 sola fuente. Riesgo aceptado por ${who} · ${when}.`
      : `- Sin riesgos aceptados.`,
    ``,
    `---`,
    `*Exportado por ${who} · ${when}*`,
  );

  return { markdown: lines.join("\n"), title };
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
    if (fmt === "pdf") openPdfPrint(markdown, title);
    else downloadMarkdownFile(markdown, title);
  });
}

// --- Toast ---
function showToast(message, isError = false, duration = isError ? 5000 : 2800) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " is-error" : ""}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// --- Placeholder rotation ---
function rotatePlaceholder() {
  if (placeholder) placeholder.firstChild.textContent = prompts[promptIndex % prompts.length];
  promptIndex++;
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

// B=MAP cause selector
document.querySelector("#briefCauseSelector")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".bmap-btn");
  if (!btn || !currentCycleId) return;
  const cause = btn.dataset.cause;
  document.querySelectorAll(".bmap-btn").forEach((b) => b.classList.toggle("active", b === btn));
  const patch = { causa: cause, causa_source: "pm_confirmed", brief: { causa: { value: cause, confirmed: true } } };
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
async function goToPhase(key) {
  if (!currentCycleId) { showToast("Selecciona un ciclo primero para ir a una fase."); return; }
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

commandButton?.addEventListener("click", () => { commandPalette.hidden = false; });

commandPalette?.addEventListener("click", (event) => {
  if (event.target === commandPalette) commandPalette.hidden = true;
  const command = event.target.dataset?.paletteCommand;
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
  if (command === "advance") {
    if (!getCurrentCycle()) { showToast("Selecciona un ciclo primero para avanzar de fase."); }
    else advancePhase(false);
  }
  if (/^F[0-5]$/.test(command)) {
    if (!getCurrentCycle()) { showToast("Selecciona un ciclo primero para ir a una fase."); }
    else { setView("workspace"); goToPhase(command); }
  }
  commandPalette.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    commandPalette.hidden = !commandPalette.hidden;
  }
  if (event.key === "Escape") commandPalette.hidden = true;
});

exportBrief?.addEventListener("click", () => exportBriefFlow());

viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

newCycleButton?.addEventListener("click", openNewCycleModal);
newCycleEmpty?.addEventListener("click", openNewCycleModal);

// Home filters (A3)
document.querySelector("#cyclesFilters")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cyclefilter]");
  if (!btn) return;
  cyclesFilter = btn.dataset.cyclefilter;
  document.querySelectorAll("#cyclesFilters .filter").forEach((b) => b.classList.toggle("active", b === btn));
  renderCyclesList();
});

// Empty-state example chips (A3) → create a cycle from the example behavior
document.querySelectorAll("[data-example-cycle]").forEach((btn) => {
  btn.addEventListener("click", () => createCycle(btn.dataset.exampleCycle));
});

briefSwitch?.addEventListener("click", () => setDeliverable("brief"));
experimentSwitch?.addEventListener("click", () => setDeliverable("experiment"));

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

let _searchTimer = null;
document.querySelector("#patternSearch")?.addEventListener("input", (e) => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { libFilters.search = e.target.value.toLowerCase().trim(); applyLibraryFilters(); }, 200);
});

// Close cycle button
document.getElementById("closeCycleButton")?.addEventListener("click", closeCycle);

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
});

// --- Start ---
init();
