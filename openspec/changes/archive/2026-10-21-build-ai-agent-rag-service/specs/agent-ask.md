---
spec: agent-ask
change: build-ai-agent-rag-service
wave: 1,2
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — agent-ask (consulta, integración y protecciones)

Implementa ADR-008 (#5, #7–#10) y `08-integracion-ia-rag.md` → flujo de consulta, `## Identidad y datos`, `## Prompt injection`, `## Rate limit y manejo de 429`. Decisiones D6–D8, D14, D16–D20 de `design.md`. La estrategia de prompts versionada y la evaluación son del cambio 8.

## Wave 1 — Herramienta hacia user-service y rate limit

## ADDED Requirements

### Requirement: Herramienta de solo lectura con identidad delegada
`UserDirectoryGateway.lookup` SHALL llamar a user-service con `@toka/http-client` (timeout `USER_TOOL_TIMEOUT_MS`, circuit breaker, `x-correlation-id`) reenviando el `Authorization` del llamante, SHALL ser de solo lectura y SHALL devolver únicamente `id`, `name`, `role` y `status` (filtrado en el adaptador, antes del prompt). El agente SHALL NOT tener identidad privilegiada propia. Consecuencia: `lookup_users` solo devuelve datos con un JWT con permiso para listar usuarios (admin); con otro JWT user-service responde 403 y el agente continúa sin la herramienta.

#### Scenario: JWT reenviado y campos filtrados
- **WHEN** user-service responde con campos extra (p. ej. `email`, `passwordHash`)
- **THEN** el resultado solo contiene `id`, `name`, `role`, `status` y la petición llevó el `Authorization` del llamante

#### Scenario: user-service no disponible
- **WHEN** la herramienta excede el timeout o el circuito está abierto
- **THEN** el gateway lanza un error tipado que el caso de uso trata como "herramienta no disponible"

### Requirement: Rate limit por usuario
`RateLimiter` SHALL aplicar una ventana fija en Redis con clave `agent:rl:{userId}:{route}` (`AGENT_RL_MAX`, `AGENT_RL_WINDOW_S`); al excederse SHALL responder 429 con `Retry-After`. Si Redis no responde SHALL continuar (fail-open) con `logger.warn`.

#### Scenario: Exceso de peticiones
- **WHEN** un usuario supera `AGENT_RL_MAX` en la ventana
- **THEN** la respuesta es 429 con cabecera `Retry-After` en segundos

## Wave 2 — Caso de uso de consulta

### Requirement: Consulta con RAG, fuentes y degradación
`POST /agent/ask` SHALL exigir JWT (`JwtAuthGuard`), validar `{question}` (1–2000 caracteres), aplicar el rate limit, recuperar fragmentos con `roleScopes = [...roles del JWT, 'all']` (nunca sin filtro) y generar con `LlmProvider` bajo un deadline de `AGENT_DEADLINE_MS` (30 s) con como máximo 2 llamadas al LLM y 1 ronda de herramienta. La respuesta SHALL incluir `answer`, `sources[{docId,source,score}]`, `degraded` y `meta{provider, latencyMs, tokensIn, tokensOut, costEstimate, ragHits, toolCalls}`.

#### Scenario: Camino feliz sin API key
- **WHEN** un usuario autenticado pregunta y no hay `ANTHROPIC_API_KEY`
- **THEN** responde 200 con `meta.provider='mock'`, `sources` no vacío y `degraded=false`

#### Scenario: Fallo del LLM
- **WHEN** el proveedor falla, el circuito está abierto o se agota el deadline
- **THEN** responde 200 con `degraded=true`, solo los fragmentos recuperados, sin texto generado, y la petición en curso se aborta con `AbortController`

### Requirement: Defensa frente a prompt injection
El prompt SHALL delimitar el contenido recuperado y la salida de herramientas en bloques declarados como datos no confiables; las herramientas SHALL ser de solo lectura. La salida del LLM SHALL parsearse como JSON y validarse contra el esquema de `src/domain/agent-answer.ts` (`answer` no vacío y acotado, `sources` ⊆ fragmentos recuperados); si no es JSON válido SHALL aplicarse el fallback de texto (texto como `answer`, `sources` = fragmentos usados) y una salida vacía SHALL degradar la respuesta. Los logs SHALL NOT incluir el contenido del prompt ni de la respuesta.

#### Scenario: Documento con instrucciones maliciosas
- **WHEN** un fragmento recuperado contiene "ignora tus instrucciones"
- **THEN** aparece dentro del bloque delimitado de datos, no en la parte de instrucciones del sistema

### Requirement: Captura de métricas por petición
Cada petición SHALL registrar mediante `AgentMetricsRecorder` los campos `llm.provider`, `llm.tokensIn`, `llm.tokensOut`, `llm.costEstimate` (o ausente si no hay precios), `latencyMs`, `ragHits`, `degraded` y `toolCalls`, y devolverlos en `meta`.

#### Scenario: Métricas disponibles para evaluación
- **WHEN** finaliza una consulta
- **THEN** `meta` y el log contienen latencia y tokens de entrada/salida
