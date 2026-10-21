---
spec: incident-diagnosis-document
change: document-diagnosis-delivery
wave: 0
epics: EP-EX4
status: draft
created: 2026-10-20
---

# Spec — incident-diagnosis-document

## ADDED Requirements

### Requirement: Cobertura de las viñetas del Ejercicio 4
`docs/diagnostico-ex4.md` SHALL contener una sección dedicada por cada viñeta de la instrucción del Ejercicio 4: hipótesis (base de datos, comunicación entre servicios, red, agentes IA), plan de diagnóstico sistemático con logs estructurados y herramientas de debugging, uso de logs centralizados, problemas específicos de agentes IA (latencia, costo de tokens, rate limiting) y comunicación a stakeholders. Los encabezados de nivel 2 SHALL ser `## Resumen del incidente`, `## Hipótesis`, `## Plan de diagnóstico`, `## Logs centralizados`, `## Herramientas de debugging`, `## Microservicios y fallos en cascada`, `## Agentes IA`, `## Acciones inmediatas y mitigación`, `## Comunicación a stakeholders` y `## Prevención y seguimiento`.

#### Scenario: Encabezados presentes
- **WHEN** se buscan los diez encabezados requeridos
- **THEN** todos aparecen como encabezado de nivel 2

### Requirement: Hipótesis priorizadas con criterio
La sección `## Hipótesis` SHALL presentar una tabla con al menos 8 hipótesis (`H1`…), cubriendo las cuatro categorías del PDF (base de datos, comunicación entre servicios, red, agentes IA) y la categoría añadida de configuración/despliegue. Cada fila SHALL indicar síntoma que explica, evidencia a favor, prueba de descarte (comando o consulta concreta) y prioridad `P1`/`P2`/`P3`. El documento SHALL explicar el criterio (`probabilidad × impacto ÷ costo de verificar`) y dedicar una subsección a la hipótesis de causa común entre los tres síntomas.

#### Scenario: Priorización visible
- **WHEN** se lee la tabla de hipótesis
- **THEN** existen filas `H1` a `H8` como mínimo, cada una con una prioridad `P1`, `P2` o `P3`, y al menos una `P1`

### Requirement: Diagnóstico anclado en el sistema real
El documento SHALL referenciar elementos concretos del diseño: la matriz de fallos y los presupuestos de `docs/architecture/07-resiliencia.md`, la saga de alta (`PENDING` → `ACTIVE`, compensación, reconciliación), el circuit breaker de las cuatro aristas (user→role, user→auth, agent→user, agent→LLM), la cola `<cola>.dlq` y su re-drive, el respaldo `event=audit.fallback`, `/health` y `/ready`, y los eventos `event=access.denied`. SHALL citar ADR-007 y ADR-008 y NO SHALL incluir IDs de modelo LLM ni precios.

#### Scenario: Términos del sistema presentes
- **WHEN** se buscan `correlationId`, `circuit breaker`, `DLQ`, `audit.fallback`, `ADR-007`, `ADR-008` y `07-resiliencia`
- **THEN** todos aparecen al menos una vez

### Requirement: Receta de logs por correlationId y logs centralizados
`## Logs centralizados` SHALL incluir la receta `docker compose logs <servicio> | jq 'select(.correlationId=="<id>")'`, consultas agregadas por `statusCode >= 500` y por `event`, el perfil compose `observability` (Loki + Alloy + Grafana) con la nota `needs-verification` para versiones y sintaxis, y el camino alternativo cuando el perfil no está activo. SHALL enumerar los campos estándar de ADR-007 (`timestamp`, `level`, `service`, `correlationId`, `userId`, `route`, `statusCode`, `latencyMs`, y para el agente `llm.provider`, `llm.tokensIn`, `llm.tokensOut`, `ragHits`).

#### Scenario: Receta ejecutable
- **WHEN** se busca `jq` y `docker compose logs` en el documento
- **THEN** ambos aparecen en la sección de logs centralizados o en el plan de diagnóstico

### Requirement: Problemas de agentes IA
`## Agentes IA` SHALL descomponer la latencia del agente (llamada al LLM, Qdrant, embeddings, herramienta hacia user-service, presupuesto de 30 s y `proxy_read_timeout` de nginx de 40 s), explicar el diagnóstico de respuestas 429 (incluido `retry-after`, limitador de concurrencia y rate limit por usuario), el análisis de costo con `llm.tokensIn` / `llm.tokensOut` y las variables `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK` (sin valores), y las palancas de reducción (`max_tokens`, `ragHits`, tamaño de chunks, prompt caching, degradación).

#### Scenario: Tres problemas de IA cubiertos
- **WHEN** se buscan `429`, `llm.tokensIn` y `latencyMs` en la sección de agentes IA
- **THEN** los tres aparecen

### Requirement: Comunicación a stakeholders estructurada
`## Comunicación a stakeholders` SHALL definir audiencias, cadencia, canal y una plantilla `Plantilla de actualización` con los campos `Estado`, `Impacto`, `Causa conocida`, `Acciones en curso` y `Próxima actualización`, con un ejemplo de primer aviso y uno de cierre redactados para público no técnico.

#### Scenario: Plantilla completa
- **WHEN** se busca la plantilla de actualización
- **THEN** contiene los cinco campos y al menos un ejemplo de aviso
