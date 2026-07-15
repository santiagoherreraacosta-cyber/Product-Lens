// PR-M1 · Contexto total. Ensambla el "system" del chat por capas para que, en
// cada turno y en cualquier ciclo, el asistente tenga contexto completo:
// método (estático) + contexto de negocio + memoria del equipo (patrones) +
// portafolio de ciclos + ciclo activo. La lectura vive aquí; la escritura durable
// (ledger de decisiones) llega en PR-M2.
import { CAUSA_LABEL, subPerfilLabel, transitionLabel } from "./doctrina.js";
import { getContextDocuments } from "./contextStore.js";

const causeLabel = (c) => (c ? (CAUSA_LABEL[c] ?? c) : "sin causa");

// Un renglón por patrón: [TIPO] causa · sub-perfil · transición — "nombre": aprendizaje (delta) · usado N×
export function patternDigest(patterns = []) {
  if (!patterns.length) {
    return "Aún no hay patrones aprendidos. Se destilan al cerrar ciclos en F5.";
  }
  return patterns.map((p) => {
    const tipo = p.tipo === "anti_patron" ? "ANTI-PATRÓN" : "PATRÓN";
    const sub = p.sub_perfil ? subPerfilLabel(p.sub_perfil) : "sin sub-perfil";
    const trans = p.transicion ? ` · ${transitionLabel(p.transicion)}` : "";
    const delta = p.delta_metrica ? ` (${p.delta_metrica})` : "";
    const usos = p.veces_reutilizado ? ` · usado ${p.veces_reutilizado}×` : "";
    const learn = p.aprendizaje ? `: ${p.aprendizaje}` : "";
    return `- [${tipo}] ${causeLabel(p.causa)} · ${sub}${trans} — "${p.nombre ?? "sin nombre"}"${learn}${delta}${usos}`;
  }).join("\n");
}

// Ledger de decisiones y aprendizajes durables (PR-M2), lo más reciente primero.
export function decisionsDigest(decisions = [], limit = 30) {
  if (!decisions.length) return "Aún no hay decisiones ni aprendizajes registrados.";
  return decisions.slice(-limit).reverse().map((d) => {
    const fecha = d.fecha ? String(d.fecha).slice(0, 10) : "";
    const causa = d.causa ? ` · ${causeLabel(d.causa)}` : "";
    const sub = d.sub_perfil ? ` · ${subPerfilLabel(d.sub_perfil)}` : "";
    return `- (${fecha}) [${d.tipo ?? "aprendizaje"}]${causa}${sub}: ${d.texto ?? ""}`;
  }).join("\n");
}

// Índice compacto de los demás ciclos (portafolio): título · fase · causa · estado · decisión.
export function cyclesIndex(cycles = [], activeId = null) {
  const others = cycles.filter((c) => c.id !== activeId);
  if (!others.length) return "No hay otros ciclos registrados.";
  return others.map((c) => {
    const fase = c.fase_actual ?? c.activePhase ?? "F0";
    const estado = c.estado ?? "activo";
    const decision = c.resultado_cierre ? ` → ${c.resultado_cierre}` : "";
    return `- "${c.title ?? "sin título"}" · ${fase} · ${causeLabel(c.causa)} · ${estado}${decision}`;
  }).join("\n");
}

// Detalle completo del ciclo activo (lo que ya inyectaba buildChatContext).
export function activeCycleBlock(cycle) {
  if (!cycle) return null;
  return JSON.stringify({
    fase: cycle.fase_actual ?? cycle.activePhase,
    sub_perfil: cycle.sub_perfil,
    transicion: cycle.transicion,
    causa: cycle.causa,
    causa_source: cycle.causa_source,
    brief: cycle.brief,
    // cycle.risks (no "riesgos"): acceptRisk() en phaseEngine.js escribe ahí.
    // El campo "riesgos" que existía en el schema de creación de ciclo nunca
    // se llenaba — el asistente nunca veía los riesgos del ciclo activo pese
    // a que 00_Orquestador.md §11 promete inyectarlos.
    riesgos: cycle.risks,
    estado: cycle.estado,
  }, null, 2);
}

function tableToText(table) {
  if (!table?.columns?.length) return "";
  const head = table.columns.join(" | ");
  const rows = (table.rows ?? []).map((r) => r.join(" | ")).join("\n");
  return `${head}\n${rows}`;
}

// Todos los documentos del Contexto Dropi, enteros (son pocos y pequeños).
export async function businessContextBlock() {
  const { documents } = await getContextDocuments();
  return documents.map((d) => {
    const table = d.table ? `\n${tableToText(d.table)}` : "";
    return `### ${d.title}\n${d.content}${table}`;
  }).join("\n\n");
}

// Ensambla los bloques del "system" (array para prompt caching): estable→volátil.
// `businessContext` puede inyectarse (tests); si no, se lee del contextStore.
export async function assembleSystemContext({ systemPrompt, cycle, patterns = [], cycles = [], decisions = [], businessContext } = {}) {
  let negocio = businessContext;
  if (negocio === undefined) {
    try { negocio = await businessContextBlock(); } catch { negocio = ""; }
  }

  const blocks = [{ type: "text", text: systemPrompt ?? "" }];
  if (negocio) {
    // El breakpoint de cache va DESPUÉS del contexto estable (método + negocio).
    blocks.push({ type: "text", text: `## CONTEXTO DE NEGOCIO (Dropi)\n${negocio}`, cache_control: { type: "ephemeral" } });
  } else {
    blocks[0].cache_control = { type: "ephemeral" };
  }

  const memoria = [
    `## MEMORIA DEL EQUIPO — PATRONES Y ANTI-PATRONES\nAntes de proponer una intervención, revisa si ya existe un patrón (o anti-patrón) aplicable a este sub-perfil/causa y díselo al usuario.\n${patternDigest(patterns)}`,
    `## DECISIONES Y APRENDIZAJES\n${decisionsDigest(decisions)}`,
    `## OTROS CICLOS (portafolio)\n${cyclesIndex(cycles, cycle?.id)}`,
  ];
  const active = activeCycleBlock(cycle);
  if (active) memoria.push(`## CICLO ACTIVO\n${active}`);
  blocks.push({ type: "text", text: memoria.join("\n\n") });

  return blocks;
}
