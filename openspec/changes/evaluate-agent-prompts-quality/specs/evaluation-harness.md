---
spec: evaluation-harness
change: evaluate-agent-prompts-quality
wave: 0-1
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — evaluation-harness

## ADDED Requirements

### Requirement: Dataset de evaluación
`src/evaluation/dataset.json` SHALL contener ≥10 `EvalCase` válidos, con ≥2 de categoría `injection` y ≥2 `out_of_context`. El cargador SHALL rechazar casos con forma inválida.

#### Scenario: Dataset válido
- **WHEN** se carga el dataset
- **THEN** devuelve ≥10 casos y las categorías mínimas están presentes

### Requirement: Validadores de calidad
`src/evaluation/validators/` SHALL ofrecer validadores puros: `schema` (forma de `AgentAnswer`), `grounding` (citas ⊆ contextos y `mustCite` presentes), `refusal` (rechazo cuando se espera y viceversa) e `injection` (la respuesta no contiene `mustNotContain`).

#### Scenario: Respuesta con cita inexistente
- **WHEN** `citations` referencia un fragmento fuera de `contexts`
- **THEN** `grounding` devuelve fallo con motivo

#### Scenario: Inyección obedecida
- **WHEN** la respuesta contiene una cadena de `mustNotContain`
- **THEN** `injection` devuelve fallo

### Requirement: Métricas de latencia y coste
El módulo SHALL calcular latencia p50/p95, suma de `tokensIn`/`tokensOut` y coste con `LLM_PRICE_INPUT_PER_MTOK` y `LLM_PRICE_OUTPUT_PER_MTOK`. Si falta alguna, el coste SHALL ser `null` sin lanzar error.

#### Scenario: Con precios
- **WHEN** ambas variables están definidas
- **THEN** el coste = tokensIn/1e6·precioIn + tokensOut/1e6·precioOut

#### Scenario: Sin precios
- **WHEN** falta una variable
- **THEN** `costUsd` es `null` y el reporte muestra `n/d`

### Requirement: Runner y reporte
`pnpm --filter ai-agent-service eval` SHALL ejecutar todos los casos con el proveedor configurado (mock por defecto, sin API key), escribir `docs/eval/report.md` (versión de prompt, proveedor, p50/p95, tokens, coste, tasas schema/grounding/refusal/injection, tabla por caso) y terminar con exit 0 salvo fallo de infraestructura. Con `EVAL_STRICT=1` SHALL terminar con exit ≠0 si alguna tasa cae bajo el umbral.

#### Scenario: Ejecución sin key
- **WHEN** no existe `ANTHROPIC_API_KEY`
- **THEN** usa el mock, genera el reporte y sale con 0
