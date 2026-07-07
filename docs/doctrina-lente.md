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

## 3. Sub-perfiles — 3 arquetipos

Enum: `rebuscador_digital | empleado_aspirante | joven_visionario` (+ `sin_clasificar`).

| Sub-perfil | Quién es (una línea) | Recurso más escaso | Barrera Setup→Aha |
|-----------|----------------------|--------------------|-------------------|
| **Rebuscador Digital** | 26–38. Busca un ingreso extra inmediato, ya digital. | Tiempo | "¿Cuánto tarda en llegarme el dinero?" |
| **Empleado Aspirante** | 40–55. Quiere independencia económica; viene con mentalidad de empleado. | Confianza | "¿Esto es legítimo? ¿Me van a estafar?" |
| **Joven Visionario** | 22–26. Quiere construir algo propio desde cero. | Capital | "¿Puedo empezar sin plata?" |

> ⚠️ El repo tenía "Seller Explorador / Operador en Escala" (del seed de B1). No existen en la doctrina. Reemplazados por estos 3. Solo "Rebuscador Digital" se conserva.

---

## 4. Las 6 fases (F0→F5)

Vocabulario en español, uno solo en schema, UI y prompts. Enum: `F0 | F1 | F2 | F3 | F4 | F5`.

| Fase | Nombre (es) | Objetivo | Gate de salida | Entregable |
|------|-------------|----------|----------------|------------|
| **F0** | Detección | Detectar un comportamiento anómalo en un segmento | Behavior Statement (quién·hace·no-hace) + 1 señal cuantitativa + **segmento** identificado | Behavior Statement |
| **F1** | Diagnóstico | Encontrar la causa raíz con B=MAP | **≥2 fuentes** convergentes + causa `M/A/P` **confirmada** por humano | Intervention Brief (causa) |
| **F2** | Intervención | Diseñar la intervención sobre la causa | Intervención mapeada a la causa + hipótesis falsable | Intervention Brief (hipótesis) |
| **F3** | Experimento | Dimensionar el experimento | Métrica primaria (**outcome**) + tamaño/duración + criterio de stop | Experiment Card |
| **F4** | Despliegue | Lanzar y observar (estado *live*) | Experimento corriendo + tracking confirmado | Experiment Card (live) |
| **F5** | Aprendizaje | Medir, **decidir** y destilar el patrón | Resultado + **decisión** (escalar/matar/iterar) + patrón nombrado | Pattern Card → Biblioteca |

**Semántica bloqueada (resuelve la divergencia del repo):**
- La **decisión** (escalar/matar/iterar) vive en **F5**, no en una fase propia. No se puede decidir antes de correr y medir.
- **F4 = Despliegue** (correr + observar), no "Decisión".
- El **gate de decisión** es el cierre de F5. Cerrar sin decisión = `[CONFIRMAR]` / risk tag (no bloqueo).
- `01_Modulos_Fases.md` (que ponía Decisión como F4) es el archivo a corregir.

**Regla de gates (todas las fases):** asesoran, no bloquean. Avanzar con gate abierto deja un **tag de riesgo persistente** (fase, gate, motivo, autor, fecha, reversible).

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

type SubPerfil = "rebuscador_digital" | "empleado_aspirante" | "joven_visionario" | "sin_clasificar";

type Fase = "F0" | "F1" | "F2" | "F3" | "F4" | "F5";
type Decision = "escalar" | "matar" | "iterar";
type PatternType = "patron" | "anti_patron"; // derivado: matar→anti_patron, escalar→patron

const CAUSA_COLOR = { M: "#8B5CF6", A: "#3B82F6", P: "#14B8A6" };
const SUB_CAUSA = {
  M: ["motivacion", "confianza", "incentivo"],
  A: ["claridad", "capacidad", "friccion"],
  P: ["timing", "visibilidad", "ausencia"],
};
const FASE_LABEL = {
  F0: "Detección", F1: "Diagnóstico", F2: "Intervención",
  F3: "Experimento", F4: "Despliegue", F5: "Aprendizaje",
};
```

---

*De este archivo se derivan: los enums de `src/doctrina.js`, el seed de `data/context_documents.json`, las etiquetas de UI y los prompts por fase. Cualquier cambio de doctrina se hace aquí primero, y luego se propaga. Una sola verdad.*
