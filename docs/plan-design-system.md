# Plan — Conformidad 100% con el Design System (Product Lens)

Fuente: handoff `Product_Lens_Design_System.zip` (recreación pulida de esta app + spec
exhaustivo de cada pantalla/estado). Instrucción del handoff: **recrear el diseño en el
codebase real (vanilla JS), NO importar los `.jsx`**. El backend real (gates server-side,
export, auth, persistencia, LLM, SSE) ya existe — el prototipo lo lista como "pendiente".

## Decisiones fijadas (PM)
1. **Vanilla** (no migrar a React) — lo que instruye el handoff y lo ya funcionando.
2. **Evidencia F1:** mantener los 2 campos del brief (`evidencia_primaria` + `segunda_fuente`
   confirmados); el "+ Adjuntar evidencia" escribe en ellos (sin migración a evidence-log).
3. **Sin emoji** (se conserva la iconografía Unicode del propio design system: ⌂ □ ⓘ ▤ ↩ ☾ → › ↻ ✓).

## Olas / PRs (cada uno = 1 PR shippable, verificado contra `screenshots/`)

- **PR-0 · Fundaciones** ✅: tokens de layout (`--content-max`, `--conversation-max`,
  `--deliverable-rail-width`, `--context-toc-width/-body-width`, `--rail-width*`) + tokens
  `--cause-M/-A/-P(-bg)` (light+dark); animaciones faltantes (`dotpulse`, `fadein`, `spin`);
  barrido de emoji (🔁, ⚠ → texto).
- **PR-1 · Home**: partir la fila única en `SegmentedControl` (estado) + `FilterBar` (causa)
  que componen **AND**; botón "Limpiar filtros (n)"; empty combinado.
- **PR-2 · Modal Nuevo ciclo**: escape "Crear de todas formas" que registra riesgo (server
  ya tiene `force`); auto-sugerir sub-perfil por keywords; preview `CognitiveTransition`.
- **PR-3 · Workspace**: `PhaseBar` 6-dots (saltado distinto) con salto solo-atrás; F1
  "+ Adjuntar evidencia"; F4 bloque live (día X/Y, muestra, treatment% vs baseline%) +
  "Confirmar tracking"; F5 `DecisionPicker` 3-way segmentado (reemplaza `<select>`) + label
  de submit por decisión; `GateCard` siempre al fondo del stream; export "Completar campos"
  con auto-scroll+foco+highlight del campo exacto; `ThinkingBubble` de 3 dots (`dotpulse`)
  y estado `loading` del export (`spin`).
- **PR-4 · Biblioteca**: modal de confirmación de reúso.
- **PR-5 · Métricas**: drill-down (tile → panel inline con los ciclos/patrones que componen
  el número; empty "Ningún ciclo compone este número todavía").
- **PR-6 · Global**: ⌘K con navegación ↑/↓/Enter; toasts con × y stack; (opcional: hook demo
  "Simular error de carga" — el estado de error sí, el comando de simulación es dev-only).

## Verificación (por PR)
- `npm run lint`/`test` + `npm audit`; CI verde (ojo SonarCloud).
- Chromium contra `screenshots/` del handoff, pantalla por pantalla y estado por estado.
- Cada estado del spec alcanzable: loading/error/empty/populated/blocked/running/closed/reused.

## Referencia
El zip vive en `/root/.claude/uploads/…Product_Lens_Design_System.zip` (re-extraíble).
Screenshots = ground truth de copy/layout/color.
