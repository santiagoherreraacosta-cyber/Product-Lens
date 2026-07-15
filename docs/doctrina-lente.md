# Doctrina del Lente — fuente canónica del repo

> **Fuente única de verdad.** De aquí se derivan los enums (`src/doctrina.js`), el seed (`data/context_documents.json`) y las etiquetas de UI. Si el código y este archivo divergen, **este archivo gana** y el código se corrige. Origen: Biblia de Producto — Seller Success (v3).

---

## 1. Marco causal — B=MAP

**Primario (maneja enum, chips, colores, filtro):** `M | A | P`.

| Causa | Nombre | Color | Pregunta |
|-------|--------|-------|----------|
| **M** | Motivación | violeta `#8B5CF6` | ¿No quiere / no ve el valor? |
| **A** | Ability | azul `#3B82F6` | ¿Quiere pero no puede / hay fricción? |
| **P** | Prompt | teal `#14B8A6` | ¿Puede y quiere, pero el trigger llega mal? |

**Secundario (opcional, refina — NO maneja el filtro): sub-causa, lista cerrada 3×3.**

| Causa | Sub-causas |
|-------|-----------|
| **M** | `motivacion` (no ve el valor) · `confianza` (no se fía — la Reacción, Sistema 1) · `incentivo` (costo/beneficio no compensa — la Evaluación, Sistema 2) |
| **A** | `claridad` (no entiende qué/cómo) · `capacidad` (no tiene el skill/recurso) · `friccion` (el flujo cuesta esfuerzo) |
| **P** | `timing` (momento equivocado) · `visibilidad` (existe pero no lo nota) · `ausencia` (no hay ningún trigger) |

> Las "6 causas" del doc viejo (Motivación/Claridad/Confianza/Capacidad/Fricción/Incentivo) son un subconjunto de esto — y les faltaba P entero. Quedan absorbidas como sub-causas. No hay marco de 6; hay B=MAP con sub-causa.
>
> **Implementación:** `cycle.sub_causa` (opcional), cableada al tool de extracción del LLM y a un `<select>` dependiente de la causa en el panel del Brief. Se valida server-side que pertenezca al bucket de la causa; fuera del bucket → se descarta.

---

## 2. Escala cognitiva — 5 niveles

El seller no pasa por un funnel: sube de nivel. Enum: `setup | aha | habit | engaged | principalidad`.

| Nivel | Cree | Definición (una línea) | Señal observable | GMV/mes |
|-------|------|------------------------|------------------|---------|
| **Setup** | "¿Esto funciona?" | Pre-cognitivo. Se registró y conectó tienda, aún sin resultado. | Registrado + tienda conectada, sin 1ª orden entregada | — |
| **Aha** | "No me estafaron" | El riesgo percibido cayó a cero: cobró por primera vez. | 1ª orden **entregada** (cobró) | ~$25 |
| **Habit** | "Puedo repetirlo" | El éxito dejó de sentirse suerte; es patrón reproducible. | 5 entregas en 30 días (repite en ventana corta) | ~$125 |
| **Engaged** | "Soy parte de algo" | Cambió la identidad: de "uso Dropi" a "soy seller". Entró a la tribu. | 10 entregas en 90 días + feature de tribu activa (ChateaPro / Dropi Card) | ~$250 |
| **Principalidad** | "Dropi es mi sistema operativo" | Dejó de operar y gobierna: piensa en sistema, diversifica, negocia. | Power seller, alto volumen sostenido | ~$1.000 |

**Transiciones válidas (un ciclo apunta a una):** `setup_aha | aha_habit | habit_engaged | engaged_principalidad` (solo pares adyacentes).

> ⚠️ El repo tenía 4 niveles (`Setup › Aha › Hábito › Maestría`). Es incorrecto: **"Maestría" no existe** y faltaba **"Engaged"** (la tribu — el eje de pertenencia y de la retención). Reemplazado por estos 5.

---

## 3. Sub-perfiles — Niveles de dropshipper (6, nombres oficiales de Comercial)

Enum: `bienvenido | explorador | master | experto | sabio_vip | leyenda` (+ `sin_clasificar`).

El eje **no es psicográfico** (no describe quién es el seller) sino de **volumen de
operación**: en qué escalón de órdenes mensuales está. Reemplaza el enum anterior de
3 arquetipos por edad (Rebuscador Digital/Empleado Aspirante/Joven Visionario).

| Nivel | Órdenes mensuales | Perfil |
|-------|--------------------|--------|
| 1. **Bienvenido** | 0 – 100 | Nuevo en la plataforma, en proceso de activación. |
| 2. **Explorador** | 101 – 1.000 | Primeras ventas sostenidas, aprendiendo operación. |
| 3. **Master** | 1.001 – 2.500 | Operador establecido, flujo de ventas estable. |
| 4. **Experto** | 2.501 – 5.000 | Alto volumen, empieza a optimizar procesos. |
| 5. **Sabio VIP** | 5.001 – 20.000 | Vendedor consolidado, referente del ecosistema. |
| 6. **Leyenda** | 20.001+ | Élite del ecosistema Dropi. |

> ⚠️ §3.1 "Niveles de dropshipper" (nombres oficiales de Comercial) **reemplaza** el
> enum psicográfico anterior de 3 arquetipos (Rebuscador Digital/Empleado Aspirante/
> Joven Visionario, que a su vez había reemplazado "Seller Explorador/Operador en
> Escala" del seed de B1). Como el eje cambió de "quién es" a "en qué nivel de
> volumen está", **no hay auto-sugerencia por texto** del comportamiento — el PM
> lo elige a mano según el dato real de órdenes/mes del seller.

---

## 4. Las 6 fases (F0→F5)

Vocabulario en español, uno solo en schema, UI y prompts. Enum: `F0 | F1 | F2 | F3 | F4 | F5`.

> **Actualización (cierre del E2E del lente):** F3 y F4 se renombran para enseñar la disciplina correcta. "Experimento" cebaba el salto directo a A/B; "Despliegue" invitaba a borrar el spec conductual antes de construir. Nuevo vocabulario: **F3 Validar** (Test) y **F4 Build/Spec**. El código acepta los nombres viejos (`Experimento`, `Despliegue`) como alias de compatibilidad para datos existentes — ver `src/doctrina.js`.

| Fase | Nombre (es) | Objetivo | Gate de salida | Entregable |
|------|-------------|----------|----------------|------------|
| **F0** | Detección | Detectar un comportamiento anómalo en un segmento | Behavior Statement (quién·hace·no-hace) + 1 señal cuantitativa + **segmento** identificado | Behavior Statement |
| **F1** | Diagnóstico | Encontrar la causa raíz con B=MAP | **≥2 fuentes** convergentes + causa `M/A/P` **confirmada** por humano + `sesgo` nombrado | Intervention Brief (causa) |
| **F2** | Intervención | Diseñar la intervención sobre la causa | Intervention Brief completo (7 secciones) + **3 checks de SDT** (autonomía/mastery/relatedness) | Intervention Brief |
| **F3** | Validar | Elegir el test más barato que falsifica el supuesto más riesgoso (escalera de validación, §8) | `supuesto_mas_riesgoso` + `test_elegido` + causalidad validada a nivel **≥ Wizard of Oz** | Experiment Card |
| **F4** | Build / Spec | Traducir la intervención validada en spec conductual para tech, con anti-patrones | `spec_conductual` escrito y entendido + tracking confirmado | Spec conductual |
| **F5** | Aprendizaje | Medir, **decidir** y destilar el patrón | Resultado (actividad **y** outcome separados) + **decisión** (escalar/matar/iterar) + patrón nombrado | Pattern Card → Biblioteca |

**Semántica bloqueada (resuelve la divergencia del repo):**
- La **decisión** (escalar/matar/iterar) vive en **F5**, no en una fase propia. No se puede decidir antes de correr y medir.
- **F4 = Build/Spec** (traducir la intervención validada en spec para tech), no "Despliegue" ni "Decisión". El experimento ya se validó en F3; F4 no es donde se lee el resultado del A/B — eso pasó de agenda cuando F3 dejó de asumir A/B como default.
- El **gate de decisión** es el cierre de F5. Cerrar sin decisión = `[CONFIRMAR]` / risk tag (no bloqueo).
- `01_Modulos_Fases.md` y `00_Orquestador.md` usan este vocabulario.
- **Cold-start:** un ciclo puede crearse directamente en F3 cuando no hay diagnóstico previo (ej. feature nueva sin datos) — baja derecho a Fake Door / Wizard of Oz en vez de forzar F0→F1→F2 lineal.

**Regla de gates (todas las fases):** asesoran, no bloquean. Avanzar con gate abierto deja un **tag de riesgo persistente** (fase, gate, motivo, autor, fecha, reversible).

---

## 4.1 Campos estructurados por fase (cierre del E2E del lente)

El schema anterior dejaba F2, F3 y F4 como prosa libre del LLM. Estos campos son de primera clase: se guardan, se validan y manejan gate — no son solo copy.

**F1 — sesgo + proxy:**
- `sesgo` enum: `present_bias | choice_overload | ambiguedad | status_quo | loss_aversion` (§7 del orquestador — cada uno tiene su antídoto).
- `proxy_y_segunda_senal` `{ proxy: string, segunda_senal: string }` — el evento conductual es proxy del shift cognitivo, nunca el shift en sí (filtro §6).

**F2 — guardrails SDT + trilema de fricción + Hook:**
- `sdt.autonomia` / `sdt.mastery` / `sdt.relatedness` — cada uno `{ check: boolean, nota: string }`. Mastery pregunta: ¿construye un seller que ya no nos necesita, o dependencia?
- `jueves_en_la_tarde` `{ check: boolean }` — ¿funciona sin alta motivación (jueves 3pm, no lunes con café)?
- `anti_roadmap` `{ check: boolean, nota: string }` — ¿toca shaming, leaderboard, social proof negativo o engagement theater? Check=true significa "confirmado que NO lo toca".
- `friccion` `{ eliminar: string[], preservar: string[], es_inversion: string[] }` — trilema: eliminar roba energía; preservar/invertir la devuelve como skill u ownership.
- `hook` `{ trigger: string, action: string, variable_reward: string, investment_phase: string }` — Investment siempre después del reward, nunca antes.

**F3 — escalera de validación (§8), no A/B por default:**
- `supuesto_mas_riesgoso` string — si esto es falso, todo se cae.
- `tipo_supuesto` enum: `deseabilidad | factibilidad | viabilidad`.
- `test_elegido` enum: `pre_mortem | expert_review | guerrilla_5u | wizard_of_oz | concierge | n1_sced | fake_door | ab` (orden de la escalera, más barato primero).
- `por_que_este` string — por qué es el test más barato que puede FALSIFICAR el supuesto.
- `resultado_confirma` / `resultado_refuta` string.
- `umbral_causalidad` — default `wizard_of_oz`; para afirmar mecanismo causal se exige `test_elegido` en o por encima de ese escalón.
- `costo_de_equivocarse` string — downside / deuda estratégica.
- `confianza` 1–5, `decision` enum `avanzar_f4 | re_diagnosticar | matar`.
- Los campos de A/B (`variable`, `tamano_muestra`, `duracion`, `criterio_stop`) son **opcionales**, solo aplican cuando `test_elegido = "ab"`. Ya no son el default del schema.

**F4 — Spec conductual (el entregable que hoy no tiene casa):**
- `spec_conductual.comportamiento_objetivo`, `.loop_completo` (Trigger→Action→Reward→Investment), `.friccion` (elimina/preserva/invierte), `.copy_por_nivel_cognitivo`.
- `spec_conductual.anti_patrones` string[] — anti-roadmap + específicos del caso: qué NO debe hacer la implementación.
- `spec_conductual.criterio_exito_conductual` string — no "se entregó la feature", sino "el comportamiento ocurrió".

**F5 — actividad vs outcome, nunca fundidos:**
- `cierre.actividad` string (¿ocurrió el comportamiento?) y `cierre.outcome` string (¿produjo el valor?) — separados, nunca uno como proxy del otro.
- `cierre.transicion_cognitiva` `{ proxy, segunda_senal }`.
- `cierre.churn_por_nivel` string — nota de Good Churn: un graduado a Principalidad no es fracaso.

---

## 5. Enums derivables (para el código)

```ts
type Causa = "M" | "A" | "P";
type SubCausa =
  | "motivacion" | "confianza" | "incentivo"      // M
  | "claridad"   | "capacidad" | "friccion"       // A
  | "timing"     | "visibilidad" | "ausencia";    // P

type CognitiveLevel = "setup" | "aha" | "habit" | "engaged" | "principalidad";
type Transition = "setup_aha" | "aha_habit" | "habit_engaged" | "engaged_principalidad";

type SubPerfil = "bienvenido" | "explorador" | "master" | "experto" | "sabio_vip" | "leyenda" | "sin_clasificar";

type Fase = "F0" | "F1" | "F2" | "F3" | "F4" | "F5";
type Decision = "escalar" | "matar" | "iterar";
type PatternType = "patron" | "anti_patron"; // derivado: matar→anti_patron, escalar→patron

type Sesgo = "present_bias" | "choice_overload" | "ambiguedad" | "status_quo" | "loss_aversion";
type TipoSupuesto = "deseabilidad" | "factibilidad" | "viabilidad";
// Orden = escalera de validación (§8), más barato primero.
type TestElegido = "pre_mortem" | "expert_review" | "guerrilla_5u" | "wizard_of_oz"
  | "concierge" | "n1_sced" | "fake_door" | "ab";
type DecisionF3 = "avanzar_f4" | "re_diagnosticar" | "matar";

const CAUSA_COLOR = { M: "#8B5CF6", A: "#3B82F6", P: "#14B8A6" };
const SUB_CAUSA = {
  M: ["motivacion", "confianza", "incentivo"],
  A: ["claridad", "capacidad", "friccion"],
  P: ["timing", "visibilidad", "ausencia"],
};
const FASE_LABEL = {
  F0: "Detección", F1: "Diagnóstico", F2: "Intervención",
  F3: "Validar", F4: "Build / Spec", F5: "Aprendizaje",
};
// Alias de compatibilidad para datos/labels viejos (pre cierre del E2E).
const FASE_LABEL_LEGACY_ALIASES = { "Experimento": "F3", "Despliegue": "F4" };
const TEST_ESCALERA_ORDEN = [
  "pre_mortem", "expert_review", "guerrilla_5u", "wizard_of_oz",
  "concierge", "n1_sced", "fake_door", "ab",
];
```

---

*De este archivo se derivan: los enums de `src/doctrina.js`, el seed de `data/context_documents.json`, las etiquetas de UI y los prompts por fase. Cualquier cambio de doctrina se hace aquí primero, y luego se propaga. Una sola verdad.*
