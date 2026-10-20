---
spec: llm-provider
change: build-ai-agent-rag-service
wave: 0
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — llm-provider (puerto `LlmProvider`)

Implementa ADR-008 (#1–#6, #10). Decisiones D3–D6, D8, D20 de `design.md`. El adaptador OpenAI/Azure OpenAI es Evolución.

## ADDED Requirements

### Requirement: Selección automática de proveedor
La factory SHALL devolver el adaptador Anthropic cuando exista `ANTHROPIC_API_KEY` (exigiendo `LLM_MODEL`) y el adaptador `mock` cuando no exista. El `mock` SHALL NOT usarse como degradación ante fallos del proveedor.

#### Scenario: Sin clave de API
- **WHEN** el servicio arranca sin `ANTHROPIC_API_KEY`
- **THEN** el proveedor activo es `mock`, el arranque no falla y el RAG sigue disponible

### Requirement: Adaptador `mock` determinista
El `mock` SHALL generar texto determinista a partir solo de los fragmentos recibidos, devolver `usage.tokensIn` y `usage.tokensOut` calculados de forma estable y, si la pregunta coincide con `/usuari|user/i` y hay herramienta disponible, SHALL emitir una llamada a `lookup_users` en la primera invocación.

#### Scenario: Pregunta sobre usuarios
- **WHEN** la pregunta menciona usuarios y se ofrece la herramienta `lookup_users`
- **THEN** el `mock` responde con un `toolCall` y, tras el resultado, con texto determinista

### Requirement: Adaptador Anthropic
El adaptador SHALL usar el SDK oficial con tool use (esquema de entrada de la herramienta), prompt caching del prefijo estable, `maxRetries` (1) y `timeout` explícitos, `AbortSignal` de la petición y `max_tokens` acotado; SHALL leer el modelo de `LLM_MODEL` y devolver el `usage` reportado por el proveedor. Antes de implementarlo, el implementador SHALL verificar el uso del SDK y el modelo vigente contra la documentación de Anthropic y registrar la evidencia (fecha, versión del SDK, fuente).

#### Scenario: Respuesta con uso reportado
- **WHEN** el cliente (doble) devuelve texto y `usage`
- **THEN** el adaptador devuelve `text`, `toolCalls` y `usage` mapeados, con `provider='anthropic'`

#### Scenario: Petición abortada
- **WHEN** el `signal` se aborta antes de la respuesta
- **THEN** el adaptador lanza un error tipado de aborto/timeout sin reintentar fuera del presupuesto

### Requirement: Resiliencia hacia el LLM
`ResilientLlmProvider` SHALL limitar la concurrencia a `LLM_MAX_CONCURRENCY` y abrir un circuito tras `LLM_BREAKER_THRESHOLD` fallos consecutivos (reabre en semiabierto tras `LLM_BREAKER_RESET_MS`); con el circuito abierto SHALL lanzar `LlmUnavailableError` de inmediato. Los errores de petición inválida (4xx distintos de 429) SHALL NOT contar para el circuito.

#### Scenario: Circuito abierto
- **WHEN** se acumulan N fallos consecutivos del proveedor
- **THEN** la siguiente llamada falla de inmediato con `LlmUnavailableError` sin invocar al proveedor

### Requirement: Coste estimado por entorno
`estimateCost(usage, env)` SHALL calcular el coste con `LLM_PRICE_INPUT_PER_MTOK` y `LLM_PRICE_OUTPUT_PER_MTOK` solo si ambas son números válidos y devolver `null` en caso contrario. El repositorio SHALL NOT contener valores de precio.

#### Scenario: Sin precios configurados
- **WHEN** las variables de precio no están definidas
- **THEN** `estimateCost` devuelve `null` y se registran solo los tokens
