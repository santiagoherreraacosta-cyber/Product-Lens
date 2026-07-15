# 01 — Módulos operativos F0–F5

> Vocabulario y enums canónicos en `docs/doctrina-lente.md` (fuente única). Fases: F0 Detección · F1 Diagnóstico · F2 Intervención · F3 Validar · F4 Build/Spec · F5 Aprendizaje. La **decisión** (escalar/matar/iterar) vive en F5.

## F0 — Detección

### Objetivo
Convertir un problema ambiguo en un comportamiento observable, situado en un segmento y conectado a una métrica.

### Inputs mínimos
- Comportamiento esperado.
- Comportamiento actual.
- Segmento afectado.
- Momento del journey.
- Métrica relacionada.

### Preguntas guía
1. ¿Qué acción concreta esperábamos que el usuario hiciera?
2. ¿Quién exactamente no la está haciendo?
3. ¿En qué momento del journey ocurre el drop-off?
4. ¿Cuál es el baseline y cuál era la expectativa?
5. ¿Qué evidencia muestra que este problema existe?

### Gate de salida
Puedes pasar a F1 si existe una formulación como:

> “En [segmento], después de [momento], esperamos que hagan [comportamiento], pero hoy solo [dato]. Esto afecta [métrica].”

### Trampas
- Confundir un KPI con un comportamiento.
- Definir el problema como solución: “necesitamos onboarding”.
- Mezclar segmentos con motivaciones distintas.
- Usar promedios que esconden cohortes.

## F1 — Diagnóstico

### Objetivo
Identificar hipótesis causales sobre por qué el comportamiento no ocurre.

### Inputs mínimos
- Problema F0.
- Evidencia cuantitativa o cualitativa.
- Momentos de fricción conocidos.

### Marco de diagnóstico — B=MAP
La causa se clasifica en **una** de tres (enum primario `M | A | P`):

- **M · Motivación:** ¿no quiere / no ve el valor?
- **A · Ability:** ¿quiere pero no puede / hay fricción?
- **P · Prompt:** ¿puede y quiere, pero el trigger llega mal?

Opcionalmente refina con una **sub-causa** (lista cerrada, no maneja el filtro):
- **M:** motivación (no ve el valor) · confianza (no se fía) · incentivo (costo/beneficio no compensa).
- **A:** claridad (no entiende qué/cómo) · capacidad (no tiene skill/recurso) · fricción (el flujo cuesta esfuerzo).
- **P:** timing (momento equivocado) · visibilidad (existe pero no lo nota) · ausencia (no hay trigger).

La causa la **propone** el asistente y la **confirma el humano** (nunca auto-commit sin confirmación).

### Preguntas guía
1. ¿Qué señales tenemos de la causa?
2. ¿Qué explicación alternativa también podría ser cierta?
3. ¿La fricción ocurre antes, durante o después del Aha?
4. ¿El problema es de intención, comprensión o ejecución?
5. ¿Qué dato mínimo distinguiría entre hipótesis?

### Sesgo específico
Tras clasificar M o A, nombra el sesgo (cada uno tiene su antídoto): `present_bias | choice_overload | ambiguedad | status_quo | loss_aversion` (ver §7 del orquestador).

### Proxy y segunda señal
El evento conductual que vas a medir es proxy de un shift cognitivo, no el shift en sí. Declara `proxy` (la señal que vas a observar) y `segunda_senal` (qué otra evidencia confirmaría que el shift ocurrió de verdad).

### Gate de salida
Puedes pasar a F2 si existe:

- Causa B=MAP (M/A/P) **confirmada por el humano**.
- **≥2 fuentes** de evidencia convergentes que la sostienen.
- `sesgo` nombrado.
- Evidencia faltante marcada.
- Riesgo de explicación alternativa.

### Trampas
- Diagnosticar desde opiniones internas.
- Tratar síntomas como causas.
- Elegir la causa que hace más fácil la solución preferida.
- Ignorar usuarios que sí completan el comportamiento.

## F2 — Diseño de intervención

### Objetivo
Diseñar un cambio mínimo que apunte a la causa diagnosticada.

### Inputs mínimos
- Comportamiento objetivo.
- Hipótesis causal.
- Segmento.
- Restricciones de negocio/operación.

### Tipos de intervención
- Clarificar próximo paso.
- Reducir riesgo percibido.
- Aumentar compromiso.
- Reordenar el journey.
- Simplificar configuración.
- Introducir prueba social o evidencia.
- Crear feedback inmediato.

### Preguntas guía
1. ¿Qué creencia, emoción o fricción debe cambiar?
2. ¿Cuál es el cambio mínimo que podría modificarla?
3. ¿Dónde debe aparecer la intervención?
4. ¿Qué comportamiento esperamos ver después?
5. ¿Qué daño podría causar si nos equivocamos?

### Guardrails obligatorios (SDT + Hook + trilema de fricción)
Antes de pasar a Validar, el brief debe tener:

- **3 checks de SDT** (guardarraíl, no generador): `autonomia`, `mastery` (¿construye un seller que ya no nos necesita, o dependencia?), `relatedness`. Cada uno con check + nota.
- **Jueves en la tarde:** ¿la intervención funciona sin alta motivación (jueves 3pm), o solo en el mejor momento del usuario?
- **Anti-roadmap:** confirma explícitamente que la intervención NO usa shaming, leaderboard, social proof negativo ni engagement theater.
- **Trilema de fricción:** clasifica cada fricción tocada en `eliminar` (roba energía), `preservar` o `es_inversion` (la devuelve como skill/ownership).
- **Hook (si aplica un loop):** `trigger → action → variable_reward → investment_phase`. El Investment va siempre después del reward, nunca antes.

### Gate de salida
Puedes pasar a F3 si el **Intervention Brief está completo** (las 7 secciones de la plantilla) **y** los 3 checks de SDT están marcados. Si falta algo, se avisa y queda tag de riesgo — no bloquea.

### Trampas
- Diseñar una feature completa cuando basta un estímulo pequeño.
- Optimizar UX sin cambiar la causa.
- Agregar pasos bajo la excusa de educar.
- No definir el mecanismo psicológico/operativo.
- Marcar los checks de SDT sin nota real (checkbox vacío de sentido).

## F3 — Validar

### Objetivo
Elegir el test más barato que pueda **falsificar** el supuesto más riesgoso — nunca saltar directo a A/B.

### Inputs mínimos
- Intervención propuesta (F2).
- `supuesto_mas_riesgoso`: si esto es falso, todo se cae.
- `tipo_supuesto`: `deseabilidad | factibilidad | viabilidad`.

### Escalera de validación (§8 del orquestador)
Pre-Mortem → Expert Review → Guerrilla (5 usuarios) → Wizard of Oz → Concierge MVP → N=1 SCED → Fake Door → A/B.

Elige `test_elegido` = el escalón más barato que puede matar el supuesto — no el más "completo". Declara `por_que_este`. El A/B es un escalón más, **no el default**: sus campos (variable, tamaño de muestra, duración, criterio de stop) solo aplican cuando `test_elegido = "ab"`.

### Cold-start
Un ciclo puede **crearse directamente en F3** cuando no hay diagnóstico previo (feature nueva, sin datos históricos) — baja derecho a Fake Door o Wizard of Oz en vez de forzar F0→F1→F2 lineal.

### Preguntas guía
1. ¿Cuál es el supuesto más riesgoso y por qué, si es falso, se cae todo?
2. ¿Cuál es el test más barato que lo puede falsificar (no el más robusto)?
3. ¿Qué resultado confirmaría el supuesto? ¿Cuál lo refutaría?
4. ¿Cuál es el costo de equivocarnos (downside, deuda estratégica)?
5. Si el resultado es ambiguo, ¿qué decisión tomamos (avanzar a F4 / re-diagnosticar / matar)?

### Gate de salida
Puedes pasar a F4 si la causalidad quedó validada a un nivel **≥ Wizard of Oz** en la escalera (no basta "métrica + muestra + duración" — eso solo aplica si el test elegido es A/B).

### Trampas
- Saltar directo a A/B sin validar el supuesto más barato primero.
- Medir demasiadas cosas sin prioridad.
- Cambiar criterios después de ver resultados.
- Confundir engagement superficial con activación.
- Afirmar causalidad con un test por debajo de Wizard of Oz (ej. solo guerrilla) sin marcarlo como riesgo.

## F4 — Build / Spec

### Objetivo
Traducir la intervención ya validada en un **spec conductual** que tech pueda construir sin adivinar la intención psicológica — el handoff a delivery.

### Inputs mínimos
- Experiment Card cerrada en F3 con causalidad validada.
- Tracking/instrumentación de los eventos necesarios.

### Spec conductual (entregable de esta fase)
- `comportamiento_objetivo`, `loop_completo` (Trigger→Action→Reward→Investment), `friccion` (elimina/preserva/invierte), `copy_por_nivel_cognitivo`.
- `anti_patrones`: los del anti-roadmap (F2) + los específicos de este caso — qué NO debe hacer la implementación.
- `criterio_exito_conductual`: no "se entregó la feature", sino "el comportamiento ocurrió".

### Preguntas guía
1. ¿El spec conductual está escrito y fue entendido por quien va a construir, antes de que arranque desarrollo?
2. ¿El tracking de los eventos está confirmado y llegando?
3. ¿Qué anti-patrones debe evitar explícitamente la implementación?
4. ¿El criterio de éxito es conductual (ocurrió el comportamiento) o solo de entrega (se shippeó)?
5. ¿Algún guardrail se está deteriorando y obliga a ajustar el spec antes de construir?

### Gate de salida
Puedes pasar a F5 si:

- El spec conductual está escrito y entendido (antes de que arranque desarrollo).
- El tracking está confirmado.

### Trampas
- Construir sin spec conductual escrito → tech rellena la intención con supuestos propios.
- Lanzar sin tracking → no se puede medir.
- Confundir "criterio de éxito" con "se entregó la feature".
- Ignorar guardrails en rojo por no ajustar el spec.

## F5 — Aprendizaje

### Objetivo
Medir el resultado, **tomar la decisión** (escalar/matar/iterar) y destilar el ciclo en memoria reutilizable para Dropi.

### Inputs mínimos
- Problema original y diagnóstico (causa).
- Intervención.
- Resultado medido contra el criterio de F3.

### Decisión (vive aquí)
Con la evidencia ya medida, decide:
- **Escalar** — la hipótesis se sostuvo → nace un **patrón**.
- **Matar** — la hipótesis se refutó → nace un **anti-patrón**.
- **Iterar** — inconcluso o parcial → vuelve a F1 con lo aprendido.

### Preguntas guía
1. ¿Qué ocurrió contra el criterio definido? ¿La intervención movió comportamiento o solo métricas proxy?
2. ¿Qué decisión tomamos (escalar/matar/iterar) y por qué?
3. ¿Qué patrón/anti-patrón de comportamiento vimos y en qué segmento aplica?
4. ¿Qué condiciones deben cumplirse para reutilizarlo?
5. ¿Qué no podemos concluir?

### Actividad vs outcome (nunca fundidos)
Declara por separado: `actividad` (¿ocurrió el comportamiento?) y `outcome` (¿produjo el valor de negocio?). Nunca uses uno como proxy del otro sin evidencia — un comportamiento que ocurre sin outcome, o un outcome sin el comportamiento detrás, son ambos señales de alarma distintas.

### Churn por nivel
Nota explícita de **Good Churn**: un seller que se gradúa a Principalidad y deja de necesitar ciertas features no es un fracaso — distínguelo del churn por fricción o pérdida de motivación.

### Gate de cierre
Para cerrar el ciclo debe haber:

- Resultado medido, con `actividad` y `outcome` declarados por separado.
- **Decisión** (escalar/matar/iterar) — si falta, se marca `[CONFIRMAR]` y queda como riesgo, no bloquea.
- Patrón nombrado (con causa y sub-perfil para que sea filtrable, y `test_elegido` si aplica).

### Salida
Usa la plantilla “Patrón de aprendizaje” de `02_Plantillas_Entregables.md`. El tipo (patrón/anti-patrón) se deriva de la decisión.

### Trampas
- Declarar éxito por una métrica secundaria.
- Escalar sin entender el mecanismo.
- Iterar eternamente sin decidir.
- Guardar anécdotas como reglas; omitir condiciones de contexto; reutilizar fuera del segmento original.
