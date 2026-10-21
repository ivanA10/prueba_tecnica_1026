---
spec: evaluation-harness
change: evaluate-agent-prompts-quality
wave: 0-1
epics: EP-EX5
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — evaluation-harness

> Spec canónica promovida desde el cambio archivado `evaluate-agent-prompts-quality` (as-built, 2026-10-21).

## Requirements

### Requirement: Dataset de evaluación
`src/eval/dataset.ts` (`apps/ai-agent-service`) SHALL exportar `EVAL_DATASET` con ≥10 `EvalCase` tipados (13 en el estado actual), con ≥2 de categoría `injection` y ≥2 `out_of_context`; cada caso declara roles, permisos opcionales y expectativas. La forma la comprueba el compilador de TypeScript.

#### Scenario: Dataset válido
- **WHEN** se carga el dataset
- **THEN** devuelve ≥10 casos y las categorías mínimas están presentes

### Requirement: Validadores de calidad
`runEval` (`src/eval/runner.ts`) SHALL evaluar cada caso con: `schema` (`checkSchema` sobre la forma de `AgentResponse`), `grounding` (los `docId` citados pertenecen a los documentos conocidos, sin fuentes si hay rechazo, y `mustCite` presentes), `refusal` (rechazo cuando se espera y viceversa), `injection` (la respuesta no contiene `mustNotContain` ni cita `mustNotCite`) y `tool` (`meta.toolCalls` ≥ `minToolCalls`). Un caso pasa si todas se cumplen y la respuesta no está degradada.

#### Scenario: Respuesta con fuente inexistente
- **WHEN** la respuesta cita un `docId` fuera de los documentos conocidos
- **THEN** el caso marca grounding `FAIL`

#### Scenario: Inyección obedecida
- **WHEN** la respuesta contiene una cadena de `mustNotContain`
- **THEN** el caso marca injection `FAIL`

### Requirement: Métricas de latencia y coste
El runner SHALL calcular latencia p50/p95 (`percentile`) y la suma de `tokensIn`/`tokensOut`; el coste por consulta SHALL venir de `estimateCost` (`src/infrastructure/llm/cost.ts`, variables `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK`) a través de `meta.costUsd` del caso de uso, sin reimplementar el cálculo. Si falta alguna variable, el coste SHALL ser `null` sin lanzar error.

#### Scenario: Con precios
- **WHEN** ambas variables están definidas
- **THEN** el coste = tokensIn/1e6·precioIn + tokensOut/1e6·precioOut

#### Scenario: Sin precios
- **WHEN** falta una variable
- **THEN** `costUsd` es `null` y el reporte muestra `n/d`

### Requirement: Runner y reporte
`pnpm --filter @toka/ai-agent-service eval` SHALL ejecutar todos los casos (mock por defecto; `EVAL_PROVIDER=anthropic` con clave usa el adaptador Anthropic), con embeddings `hash`, almacén en memoria y directorio de usuarios doble, escribir `docs/eval/report.md` (versión de prompt, proveedor, p50/p95, tokens, coste, tasas schema/grounding/refusal/injection/tool, tabla por caso) y terminar con código 1 si algún caso falla.

#### Scenario: Ejecución sin key
- **WHEN** no existe `ANTHROPIC_API_KEY`
- **THEN** usa el mock, genera el reporte y sale con 0 cuando todos los casos pasan (13/13 en el último reporte)

## Evolución

- Dataset en `dataset.json` con validación al cargar y validadores extraídos a un módulo propio que reutilice el esquema de `src/domain/agent-answer.ts`.
- Ejecución de la evaluación contra Qdrant real; hoy ese camino lo cubre `e2e/agent.spec.ts`.
