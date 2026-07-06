# 01 — Módulos operativos F0–F5

> Vocabulario y enums canónicos en `docs/doctrina-lente.md` (fuente única). Fases: F0 Detección · F1 Diagnóstico · F2 Intervención · F3 Experimento · F4 Despliegue · F5 Aprendizaje. La **decisión** (escalar/matar/iterar) vive en F5.

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

### Gate de salida
Puedes pasar a F2 si existe:

- Causa B=MAP (M/A/P) **confirmada por el humano**.
- **≥2 fuentes** de evidencia convergentes que la sostienen.
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

### Gate de salida
Puedes pasar a F3 si la intervención tiene:

- Causa atacada.
- Mecanismo esperado.
- Segmento y momento.
- Métrica primaria.
- Riesgos.

### Trampas
- Diseñar una feature completa cuando basta un estímulo pequeño.
- Optimizar UX sin cambiar la causa.
- Agregar pasos bajo la excusa de educar.
- No definir el mecanismo psicológico/operativo.

## F3 — Experimento

### Objetivo
Convertir la intervención en un aprendizaje medible.

### Inputs mínimos
- Intervención propuesta.
- Métrica primaria.
- Eventos disponibles.
- Criterio de éxito/fallo.

### Diseño mínimo
Define:

- Hipótesis.
- Variante o intervención.
- Audiencia.
- Duración o tamaño de muestra.
- Métrica primaria.
- Métricas guardrail.
- Decisión predefinida.

### Preguntas guía
1. ¿Qué tendría que pasar para creer que funcionó?
2. ¿Qué señal temprana sería suficiente para iterar?
3. ¿Qué métrica podría mejorar falsamente?
4. ¿Qué segmento queda excluido?
5. ¿Qué decisión tomaremos con cada resultado?

### Gate de salida
Puedes pasar a F4 si están definidos:

- Éxito.
- Fallo.
- Resultado inconcluso.
- Acción para cada caso.

### Trampas
- Medir demasiadas cosas sin prioridad.
- Cambiar criterios después de ver resultados.
- Confundir engagement superficial con activación.
- No instrumentar guardrails.

## F4 — Despliegue

### Objetivo
Lanzar el experimento y observarlo corriendo (estado *live*), sin leer resultados antes de tiempo.

### Inputs mínimos
- Experiment Card cerrada en F3 (métrica primaria, tamaño/duración, criterio de stop).
- Tracking/instrumentación de los eventos necesarios.

### Preguntas guía
1. ¿El experimento está efectivamente corriendo?
2. ¿El tracking de los eventos está confirmado y llegando?
3. ¿Cuánto falta para el criterio de stop (día X de N, muestra acumulada)?
4. ¿Algún guardrail se está deteriorando y obliga a parar antes?
5. ¿Estamos resistiendo la tentación de leer el resultado antes del stop (no peeking)?

### Gate de salida
Puedes pasar a F5 si:

- El experimento está corriendo.
- El tracking está confirmado.

### Trampas
- Leer resultados antes del criterio de stop (peeking) y decidir con ruido.
- Lanzar sin tracking → no se puede medir.
- Ignorar guardrails en rojo por no cortar el experimento.

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

### Gate de cierre
Para cerrar el ciclo debe haber:

- Resultado medido.
- **Decisión** (escalar/matar/iterar) — si falta, se marca `[CONFIRMAR]` y queda como riesgo, no bloquea.
- Patrón nombrado (con causa y sub-perfil para que sea filtrable).

### Salida
Usa la plantilla “Patrón de aprendizaje” de `02_Plantillas_Entregables.md`. El tipo (patrón/anti-patrón) se deriva de la decisión.

### Trampas
- Declarar éxito por una métrica secundaria.
- Escalar sin entender el mecanismo.
- Iterar eternamente sin decidir.
- Guardar anécdotas como reglas; omitir condiciones de contexto; reutilizar fuera del segmento original.
