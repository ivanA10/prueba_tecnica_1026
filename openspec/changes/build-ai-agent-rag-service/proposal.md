# Proposal — build-ai-agent-rag-service

> Change 7 de 9. Cubre el núcleo del Ejercicio 5 del PDF (agente de IA con RAG): crea `apps/ai-agent-service` (puerto 3005) con consulta `POST /agent/ask`, ingesta (`POST /agent/ingest`, semilla y consumidor `agent.ingest`), puerto `LlmProvider` (Anthropic + `mock`), embeddings ONNX locales, Qdrant, herramienta REST hacia user-service, rate limit y captura de métricas por petición.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (CLI `opsx` no disponible en el sub-agente planner; ver "Plan metadata" en design.md).
> **Frontera con el cambio 8 (`evaluate-agent-prompts-quality`)**: el cambio 8 es dueño del documento versionado de prompt engineering, `src/prompts/`, el dataset/informe de evaluación y `src/evaluation/`. Aquí solo se implementa la **captura** de métricas (latencia, tokens, coste) por petición y la validación básica de esquema de la salida.

**En simple:** Este cambio construye el microservicio de IA. Un usuario autenticado pregunta algo; el servicio busca fragmentos relevantes en una base vectorial (Qdrant) usando embeddings calculados localmente, puede consultar a user-service con el token del propio usuario (nunca con identidad propia), arma un prompt que trata lo recuperado como datos no confiables y genera la respuesta con Anthropic, o con un proveedor `mock` determinista si no hay clave de API. Si el proveedor falla o se agota el tiempo, responde solo con los fragmentos encontrados. Cada petición deja registrados latencia, tokens de entrada/salida y coste estimado (sin precios en el repositorio: vienen de variables de entorno).

## Esquema de identificadores

- Épica: `EP-EX5` (Ejercicio 5 — Agente de IA y RAG). Historias `US-EX5-NN`; el cambio 8 las reutiliza para su evaluación.

| Historia | Descripción |
|---|---|
| US-EX5-01 | Consulta al agente (`POST /agent/ask`) con RAG, fuentes y respuesta degradada |
| US-EX5-02 | Puerto `LlmProvider` con adaptador Anthropic, `mock` automático sin clave y coste estimado por entorno |
| US-EX5-03 | Pipeline de embeddings e ingesta (semilla, admin, evento `role.#`) sobre Qdrant |
| US-EX5-04 | Integración con user-service reenviando el JWT del llamante, con lista blanca de campos |
| US-EX5-05 | Rate limit por usuario, presupuesto de tiempo, concurrencia y circuit breaker hacia el LLM |
| US-EX5-06 | Captura de métricas por petición (latencia, tokens, coste) y validación de esquema de salida |
| US-EX5-07 | Empaquetado (Dockerfile con modelo horneado), documentación y trazabilidad |

## Problem

El PDF (Ex5) exige integrar un agente con una API de IA, un RAG con base vectorial y pipeline de embeddings, métricas de evaluación (latencia, coste de tokens, validación básica), integración con al menos un microservicio y manejo de errores/rate limiting. ADR-008 y ADR-009 fijaron las decisiones, pero no existe código. Sin este servicio no hay entregable de Ex5 ni base sobre la que el cambio 8 pueda evaluar.

## Solution

1. **Servicio NestJS** `apps/ai-agent-service` con capas ADR-006 (dominio sin SDKs; puertos en aplicación; adaptadores en infraestructura), reutilizando `@toka/jwt-guard`, `@toka/logger`, `@toka/http-client` y `@toka/contracts` del cambio 2.
2. **`LlmProvider`**: adaptador Anthropic (tool use, prompt caching, `max_retries` y `timeout` explícitos, `AbortSignal`) y adaptador `mock` determinista; selección automática por `ANTHROPIC_API_KEY`; decorador de resiliencia (semáforo de concurrencia + circuit breaker). El modelo viene de `LLM_MODEL` y los precios de `LLM_PRICE_*`; **ningún identificador de modelo ni precio en código ni docs**. Una tarea verifica el uso del SDK y el modelo vigente contra la documentación de Anthropic en el momento de implementar.
3. **RAG**: `EmbeddingProvider` ONNX MiniLM 384-d local (más `hash` solo en tests), chunker (≤256 tokens, solape ~32), `KnowledgeStore` Qdrant (`knowledge_base`, coseno, upsert por `docId`, filtro `roleScope` obligatorio desde el JWT), ingesta por semilla idempotente, `POST /agent/ingest` (admin) y consumidor `agent.ingest` (`role.#`, idempotente por `eventId`).
4. **Consulta**: JWT → rate limit Redis → recuperación filtrada → herramienta de solo lectura hacia user-service con el JWT del llamante (lista blanca `id,name,role,status`) → prompt con datos delimitados → generación con deadline de 30 s → validación de esquema de salida → respuesta con `sources` y `meta`.
5. **Métricas**: cada petición registra `llm.provider`, `llm.tokensIn`, `llm.tokensOut`, `llm.costEstimate`, `latencyMs`, `ragHits`, `degraded` (sin contenido del prompt) y las devuelve en `meta` para que el cambio 8 las consuma.
6. **Empaquetado y cierre**: Dockerfile Debian-slim con modelo ONNX horneado; documentación (`08-integracion-ia-rag.md`) y filas EX5 de `docs/traceability.md` a `Implementado`.

## Scope

- `apps/ai-agent-service/**` (código, pruebas, semilla `knowledge/`, `scripts/fetch-model.sh`, `Dockerfile`).
- `infra/env/ai-agent-service.env.example` (variables del servicio).
- `docs/architecture/08-integracion-ia-rag.md` (notas de implementación y verificación) y `docs/traceability.md` (filas EX5 de este cambio).

## Out of scope

- Documento de prompt engineering versionado, `src/prompts/`, dataset y informe de evaluación, `src/evaluation/` y validadores de calidad: cambio 8.
- Servicio `ai-agent` dentro de `docker-compose.yml`, nginx `/api/agent/`, healthcheck de Qdrant verificado y arranque sin red verificado: cambio 9 (`harden-compose-resilience-security`).
- Ejemplo ejecutable (`scripts/agent-demo.sh`, `docs/agent-example.md`): cambio de entrega documental.
- Adaptador OpenAI/Azure OpenAI, streaming, embeddings multilingües mayores, reindexado versionado (Evolución declarada en ADR-008/009).
- Ingesta de datos de usuarios (prohibida por ADR-009) y cualquier herramienta de escritura.
- Guard de roles genérico `@Roles` (cambio 3): aquí solo una comprobación mínima de rol admin en `/agent/ingest`.

## Success criteria

1. `pnpm --filter @toka/ai-agent-service test build lint` pasa con cobertura ≥70 % de líneas y ≤30 pruebas en el cambio.
2. Sin `ANTHROPIC_API_KEY`, el servicio arranca con el proveedor `mock` y `POST /agent/ask` responde con `sources`, `meta.provider='mock'` y tokens reportados (prueba de integración con dobles).
3. La recuperación aplica siempre el filtro `roleScope` derivado del JWT del llamante; reingestar un `docId` reemplaza sus fragmentos (sin duplicados).
4. La herramienta hacia user-service reenvía el `Authorization` del llamante y solo expone `id,name,role,status` al LLM.
5. Ante fallo del LLM, circuito abierto o deadline agotado, la respuesta es `degraded=true` con solo fragmentos; el exceso de rate limit devuelve 429 con `Retry-After`.
6. No existe identificador de modelo ni precio en `apps/ai-agent-service/src` ni en estos artefactos; la verificación contra la documentación de Anthropic queda registrada.
7. La imagen Docker contiene el modelo ONNX y no descarga nada al arrancar.
