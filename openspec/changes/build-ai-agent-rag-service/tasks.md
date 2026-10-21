# Tasks — build-ai-agent-rag-service

> 11 tareas, 4 specs, 3 waves (Wave 0 = 4, Wave 1 = 3, Wave 2 = 4). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` (sin frontend). TDD obligatorio (prueba primero; presupuesto en `design.md` → `## Testing strategy`: 26 pruebas, tope por tarea 5).
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin `grep -P`. Las pruebas se ejecutan con `pnpm --filter @toka/ai-agent-service exec jest --coverage=false [patrón]` (Jest 30; el patrón es opcional). **Ningún gate ejecuta `pnpm install`**: la tarea 1.1 solo edita el manifiesto (`package.json`) y el orquestador/entorno instala una vez; las demás tareas no ejecutan `pnpm add`. Versiones de dependencias: `needs-verification`.
> **Reglas transversales**: (1) prohibido escribir identificadores de modelo o precios en código, comentarios, pruebas, docs y artefactos (`LLM_MODEL`, `LLM_PRICE_*` vienen del entorno; las pruebas usan `test-model`); (2) el cambio 8 es dueño de `src/prompts/`, `src/evaluation/` y del documento de prompt engineering: no crear esos directorios; (3) las dependencias entre tareas de una misma wave se respetan según `Dependencies`; (4) dominio de 1.x–3.3: `apps/ai-agent-service/**` e `infra/env/ai-agent-service.env.example`; 3.4 acotada a `docs/**`; (5) `lookup_users` requiere un JWT con permiso de listar usuarios (en la práctica, admin): con un JWT sin ese permiso user-service responde 403 y el agente continúa sin la herramienta; (6) el consumidor `agent.ingest` queda diferido a Evolución (ver `design.md`).
> Precondición: cambio 2 (`bootstrap-monorepo-platform`) completo: paquetes `@toka/*` construidos, `jest.config.base.js`, pnpm instalado y dependencias del servicio instaladas tras 1.1.

## Wave 0 — Fundamentos del servicio

- [ ] 1.1 Esqueleto de `apps/ai-agent-service`: manifiesto, capas, puertos, esquema de respuesta, configuración validada, `/health` y plantilla de entorno
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/agent-service-runtime.md`
  - **Spec wave slice:** `## Wave 0 — Esqueleto y configuración`
  - **Stories:** US-EX5-07
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** existe `apps/ai-agent-service` con `package.json` (`name: @toka/ai-agent-service`; scripts `build`, `test` = `jest`, `lint` = `eslint src`; dependencias `workspace:*` de `@toka/contracts|logger|jwt-guard|http-client`; **todas** las dependencias del cambio declaradas aquí editando solo el manifiesto: NestJS 11, SDK oficial de Anthropic, librería ONNX/tokenizador, cliente REST de Qdrant, `ioredis` y validador de esquemas/DTO — versiones `needs-verification`; si la librería ONNX no instala en Windows se declara `optionalDependency` con carga perezosa; **sin cliente AMQP**: el consumidor está diferido), `tsconfig.json` y `jest.config.js` que extienden la base (exclusiones de cobertura: `main.ts`, `*.module.ts`, `onnx-embedding.provider.ts`). Capas `domain/ application/ infrastructure/ interface/` con los 6 puertos de `design.md` D2 en `src/application/ports/*.port.ts` (interfaces y errores tipados `LlmUnavailableError`, `UserToolUnavailableError`); `src/domain/agent-answer.ts` exporta el **esquema de respuesta del agente** (tipos `AgentAnswer`, `Source`, `AgentMeta` y el esquema de validación) que el cambio 8 importa; `config/config.ts` con `loadConfig` (defaults 30 000/20 000/3 000 ms; falla si hay `ANTHROPIC_API_KEY` sin `LLM_MODEL` o falta una variable obligatoria), `main.ts` + `app.module.ts` mínimos con `@toka/logger` y `GET /health`. Se actualiza/crea `infra/env/ai-agent-service.env.example` con las variables de `design.md` (`ANTHROPIC_API_KEY`, `LLM_MODEL`, `LLM_PRICE_*` vacíos). 1 prueba (primero): `loadConfig`. `apps/ai-agent-service/models/` en `.gitignore`.
  - **Verification gate:** cmd:test -f apps/ai-agent-service/package.json && node -e "const p=require('./apps/ai-agent-service/package.json');const d=p.dependencies||{};process.exit(p.name==='@toka/ai-agent-service'&&d['@toka/jwt-guard']&&d['@toka/http-client']&&d['@toka/logger']&&d['@toka/contracts']?0:1)" && pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && for f in llm-provider embedding-provider knowledge-store user-directory-gateway rate-limiter agent-metrics-recorder; do test -f apps/ai-agent-service/src/application/ports/$f.port.ts || exit 1; done && test -f apps/ai-agent-service/src/domain/agent-answer.ts && grep -q 'LLM_MODEL' infra/env/ai-agent-service.env.example && grep -q 'models' .gitignore && ! grep -rEq 'cla[u]de-[0-9a-z]' apps/ai-agent-service/src infra/env/ai-agent-service.env.example
  - **mockup_ref:** n/a

- [ ] 1.2 Adaptador `mock` (salida JSON), factory de proveedor y `ResilientLlmProvider` (concurrencia + circuit breaker)
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/llm-provider.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX5-02, US-EX5-05
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** en `src/infrastructure/llm/`: `mock.provider.ts` (determinista; el texto es un **JSON** `{answer, sources:[{docId,...}]}` compuesto solo de los fragmentos recibidos y conforme al esquema de `domain/agent-answer.ts`; `usage` estable; `toolCall lookup_users` si la pregunta coincide con `/usuari|user/i` y hay herramienta), `provider.factory.ts` (`ANTHROPIC_API_KEY` presente → constructor Anthropic inyectado; ausente → `mock`) y `resilient.provider.ts` (semáforo `LLM_MAX_CONCURRENCY`, breaker por fallos consecutivos, abierto → `LlmUnavailableError`; 4xx distintos de 429 no cuentan). Si `@toka/http-client` ya exporta un breaker reutilizable, usarlo y anotarlo. 3 pruebas (primero), cobertura ≥70 % líneas, build y lint verdes. No importa el SDK de Anthropic.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && test -f apps/ai-agent-service/src/infrastructure/llm/mock.provider.ts && test -f apps/ai-agent-service/src/infrastructure/llm/resilient.provider.ts && grep -rq 'ANTHROPIC_API_KEY' apps/ai-agent-service/src/infrastructure/llm && ! grep -rq '@anthropic-ai' apps/ai-agent-service/src/infrastructure/llm/mock.provider.ts apps/ai-agent-service/src/infrastructure/llm/resilient.provider.ts apps/ai-agent-service/src/domain apps/ai-agent-service/src/application
  - **mockup_ref:** n/a

- [ ] 1.3 Adaptador Anthropic (tool use, prompt caching, `maxRetries`/`timeout` explícitos) y `cost.ts`, tras verificar con la skill `claude-api`
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/llm-provider.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX5-02, US-EX5-06
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** **Paso 1 (obligatorio, antes de codificar)**: usar la skill `claude-api` del harness como referencia de SDK, prompt caching y `maxRetries`/`timeout` (complementar con context7 o documentación oficial si hace falta; si ninguna fuente está disponible, marcar `needs-verification` y no cerrar la tarea) y verificar: constructor del SDK, llamada de mensajes con herramientas y esquema de entrada, marcado de caché, campos de `usage`, paso de `AbortSignal` y el modelo vigente que el operador debe poner en `LLM_MODEL`. Anotar fecha, versión del SDK y fuente en el encabezado de `anthropic.provider.ts`; **ningún identificador de modelo en comentarios ni código**. **Paso 2**: `src/infrastructure/llm/anthropic.provider.ts` implementa `LlmProvider` con el modelo de `config.llmModel`, `maxRetries: 1` y `timeout` explícitos, caché del prefijo estable, `max_tokens` acotado, `signal` y mapeo de `usage`; errores del SDK mapeados a tipos del puerto. `src/infrastructure/llm/cost.ts` **exporta** `estimateCost(usage, env)` (`null` si faltan precios) como utilidad reutilizable por el cambio 8. Se registra en la factory desde `app.module.ts` (sin editar archivos de 1.2). 3 pruebas (primero) con cliente doble y `test-model`/precios ficticios inyectados; cobertura ≥70 % líneas.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && test -f apps/ai-agent-service/src/infrastructure/llm/anthropic.provider.ts && grep -Eq 'maxRetries|max_retries' apps/ai-agent-service/src/infrastructure/llm/anthropic.provider.ts && grep -q 'cache_control' apps/ai-agent-service/src/infrastructure/llm/anthropic.provider.ts && grep -Eq 'export (function|const) estimateCost' apps/ai-agent-service/src/infrastructure/llm/cost.ts && grep -rq 'LLM_PRICE_INPUT_PER_MTOK' apps/ai-agent-service/src && grep -Eqi 'verificad|verified' apps/ai-agent-service/src/infrastructure/llm/anthropic.provider.ts && ! grep -rEq 'cla[u]de-[0-9a-z]' apps/ai-agent-service/src
  - **mockup_ref:** n/a

- [ ] 1.4 Embeddings (ONNX 384-d + `hash` solo en tests), chunker y `fetch-model.sh` con pin TOFU de `sha256`
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/rag-knowledge.md`
  - **Spec wave slice:** `## Wave 0 — Embeddings y chunking`
  - **Stories:** US-EX5-03
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `domain/chunker.ts` (puro; `countTokens` inyectado; ≤`CHUNK_MAX_TOKENS` con solape ~`CHUNK_OVERLAP_TOKENS`; sin fragmentos vacíos), `infrastructure/embeddings/hash-embedding.provider.ts` (determinista, 384-d), `onnx-embedding.provider.ts` (modelo MiniLM local con red remota deshabilitada, mean pooling + normalización, `countTokens` real; carga perezosa), `embedding.factory.ts` (rechaza `hash` si `NODE_ENV!=='test'`) y `scripts/fetch-model.sh` (POSIX; versión y URL fijadas; **TOFU**: si existe `apps/ai-agent-service/models.sha256` verifica con `sha256sum -c` y falla si no coincide; si no existe, la primera descarga calcula y escribe `models.sha256` —que se versiona— y lo informa). Verificar al instalar que la salida ONNX es de 384 dimensiones (anotar en el encabezado). 3 pruebas (primero), cobertura ≥70 % líneas excluyendo solo `onnx-embedding.provider.ts`.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && sh -n apps/ai-agent-service/scripts/fetch-model.sh && grep -q 'sha256' apps/ai-agent-service/scripts/fetch-model.sh && grep -q 'models.sha256' apps/ai-agent-service/scripts/fetch-model.sh && grep -rq '384' apps/ai-agent-service/src/infrastructure/embeddings && grep -rq "'test'" apps/ai-agent-service/src/infrastructure/embeddings/embedding.factory.ts
  - **mockup_ref:** n/a

## Wave 1 — RAG e integración

- [ ] 2.1 `KnowledgeStore`: adaptador Qdrant (`knowledge_base`, filtro `roleScope` obligatorio, upsert por `docId`) y almacén en memoria para pruebas
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/rag-knowledge.md`
  - **Spec wave slice:** `## Wave 1 — Almacén vectorial e ingesta`
  - **Stories:** US-EX5-03
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `infrastructure/qdrant/qdrant.knowledge-store.ts` (cliente inyectable; `ensureCollection` 384-d coseno + índices de payload `roleScope`/`docId`; `upsertDocument` = borrar por `docId` + `upsert` con ids deterministas; `search(vector, {roleScopes, limit})` que **siempre** aplica el filtro) e `in-memory.knowledge-store.ts` (coseno en memoria, mismo puerto). El puerto no permite buscar sin `roleScopes`. Verificar la API del cliente Qdrant contra su documentación al instalar (`needs-verification`). 3 pruebas (primero), adaptador real ejercido con cliente doble (no se excluye de cobertura), cobertura ≥70 % líneas.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && grep -rq 'knowledge_base' apps/ai-agent-service/src/infrastructure/qdrant && grep -q 'roleScope' apps/ai-agent-service/src/infrastructure/qdrant/qdrant.knowledge-store.ts && test -f apps/ai-agent-service/src/infrastructure/qdrant/in-memory.knowledge-store.ts
  - **mockup_ref:** n/a

- [ ] 2.2 Caso de uso de ingesta, semilla de conocimiento idempotente y `POST /agent/ingest` (solo admin)
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/rag-knowledge.md`
  - **Spec wave slice:** `## Wave 1 — Almacén vectorial e ingesta`
  - **Stories:** US-EX5-03
  - **Owner profile:** backend
  - **Dependencies:** 1.4, 2.1
  - **Definition of done:** `application/ingest/ingest-document.use-case.ts` (normaliza → chunk → embed → `upsertDocument`; sin PII, límite `INGEST_MAX_CHARS`), `seed-loader.ts` (lee `apps/ai-agent-service/knowledge/*.md` con front-matter `docId/source/roleScope`; idempotente; al arrancar si `AGENT_SEED_ON_START`), 3–4 documentos semilla cortos y sin PII (políticas, catálogo de roles/permisos, guía de uso; al menos uno `roleScope: [all]` y uno `[admin]`) e `interface/ingest.controller.ts` (`JwtAuthGuard` + `AGENT_ADMIN_ROLE`, 403 si no; DTO validado). Cableado en `app.module.ts` (`ensureCollection` al arrancar). El catálogo de roles se mantiene por semilla/admin (la regeneración por eventos `role.#` está diferida). 3 pruebas (primero) con `hash` + `InMemoryKnowledgeStore`; cobertura ≥70 % líneas.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && test "$(ls apps/ai-agent-service/knowledge/*.md | wc -l)" -ge 3 && grep -l 'roleScope' apps/ai-agent-service/knowledge/*.md >/dev/null && grep -rq 'AGENT_ADMIN_ROLE' apps/ai-agent-service/src && ! grep -rEiq 'password|@[a-z0-9-]+\.(com|org)' apps/ai-agent-service/knowledge
  - **mockup_ref:** n/a

- [ ] 2.3 `UserDirectoryGateway` (JWT del llamante, lista blanca) y `RateLimiter` Redis (`agent:rl:*`)
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/agent-ask.md`
  - **Spec wave slice:** `## Wave 1 — Herramienta hacia user-service y rate limit`
  - **Stories:** US-EX5-04, US-EX5-05
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `infrastructure/user-client/user-directory.gateway.ts` (usa `@toka/http-client` con `USER_TOOL_TIMEOUT_MS` y breaker; reenvía `Authorization` y `x-correlation-id`; `lookup({query?, role?})` de solo lectura; filtra a `id,name,role,status` en el adaptador; 401/403/timeout/circuito → `UserToolUnavailableError`; **la herramienta requiere un JWT con permiso para listar usuarios (admin)**: sin él user-service responde 403 y el agente continúa sin la herramienta; endpoint/params de user-service `needs-verification` contra el cambio de user-service, concentrado en este archivo) y `infrastructure/redis/redis-rate-limiter.ts` (`INCR`+`EXPIRE`, clave `agent:rl:{userId}:{route}`, `AGENT_RL_MAX`/`AGENT_RL_WINDOW_S`, `retryAfterSeconds`; Redis caído → fail-open con `warn`) más el guard/interceptor que responde 429 con `Retry-After`. 3 pruebas (primero) con `fetchImpl` y cliente Redis dobles; cobertura ≥70 % líneas.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && grep -rq 'agent:rl:' apps/ai-agent-service/src/infrastructure/redis && grep -rq 'Retry-After' apps/ai-agent-service/src && grep -q 'Authorization' apps/ai-agent-service/src/infrastructure/user-client/user-directory.gateway.ts && grep -Eq 'passwordHash|email' apps/ai-agent-service/src/infrastructure/user-client/user-directory.gateway.spec.ts
  - **mockup_ref:** n/a

## Wave 2 — Consulta, empaquetado y cierre

- [ ] 3.1 `AskAgentUseCase` y `POST /agent/ask`: RAG, herramienta, deadline, degradación, validación de salida y métricas por petición
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/agent-ask.md`
  - **Spec wave slice:** `## Wave 2 — Caso de uso de consulta`
  - **Stories:** US-EX5-01, US-EX5-04, US-EX5-05, US-EX5-06
  - **Owner profile:** backend
  - **Dependencies:** 1.2, 1.3, 1.4, 2.1, 2.3
  - **Definition of done:** `application/ask/ask-agent.use-case.ts` (flujo de `design.md` D6–D8, D17–D20: embed → `search` con `roleScopes=[...roles JWT,'all']` y `RAG_TOP_K` → ≤2 llamadas al LLM y 1 ronda de `lookup_users` → `validateAgentOutput` → respuesta con `sources` y `meta`; `AbortController` con `AGENT_DEADLINE_MS`; fallo del LLM, `LlmUnavailableError`, deadline o salida inválida → `degraded=true` con solo fragmentos y sin 5xx; herramienta no disponible (incluido 403 por JWT no admin) → continúa sin ella), `prompt-builder.ts` (`SYSTEM_PROMPT` + datos y salida de herramientas en bloques delimitados como no confiables; el LLM debe responder JSON conforme al esquema; sin crear `src/prompts/`), `validate-output.ts` (intenta `JSON.parse` y valida contra `domain/agent-answer.ts`; si no es JSON válido, **fallback**: trata el texto como `answer` con `sources` = fragmentos usados; descarta `docId` no recuperados; vacío → degradado), `infrastructure/metrics/logger-metrics.recorder.ts` (campos `llm.provider`, `llm.tokensIn`, `llm.tokensOut`, `llm.costEstimate` vía `estimateCost` de 1.3, `latencyMs`, `ragHits`, `degraded`, `toolCalls`; nunca prompt/respuesta) e `interface/ask.controller.ts` (`JwtAuthGuard`, rate limit de 2.3, DTO `question` 1–2000, `RequestLoggingInterceptor`). Cableado con la factory (Anthropic si hay clave, si no `mock`). 5 pruebas (primero) con `mock`, `hash`, `InMemoryKnowledgeStore` y dobles; cobertura ≥70 % líneas.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service exec jest --coverage=false && pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service lint && grep -rq 'AbortController' apps/ai-agent-service/src/application/ask && grep -rq 'llm.tokensIn' apps/ai-agent-service/src/infrastructure/metrics && grep -q 'degraded' apps/ai-agent-service/src/application/ask/ask-agent.use-case.ts && grep -q "'all'" apps/ai-agent-service/src/application/ask/ask-agent.use-case.ts && grep -q 'JSON.parse' apps/ai-agent-service/src/application/ask/validate-output.ts && test ! -d apps/ai-agent-service/src/prompts && test ! -d apps/ai-agent-service/src/evaluation
  - **mockup_ref:** n/a

- [ ] 3.2 Dockerfile Debian-slim con modelo ONNX horneado y `.dockerignore`
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/agent-service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y cierre`
  - **Stories:** US-EX5-07
  - **Owner profile:** backend
  - **Dependencies:** 1.4, 3.1
  - **Definition of done:** `apps/ai-agent-service/Dockerfile` multi-etapa con contexto en la raíz (`docker build -f apps/ai-agent-service/Dockerfile .`), base Debian-slim (tag exacto `needs-verification`, no Alpine), instala con lockfile congelado dentro de la imagen, compila, ejecuta `scripts/fetch-model.sh` durante el build (el contenedor no descarga nada al arrancar; usa `models.sha256`), expone 3005, usuario no root, `CMD node dist/main.js`; `.dockerignore` excluye `node_modules`, `.env*`, `secrets/`, `coverage/`. **No** se añade el servicio a `docker-compose.yml` (cambio 5, `harden-compose-resilience-security`). Si el build no puede ejecutarse (sin Docker o sin red), la tarea queda `needs-verification` y se reporta.
  - **Verification gate:** cmd:test -f apps/ai-agent-service/Dockerfile && test -f apps/ai-agent-service/.dockerignore && ! grep -qi 'alpine' apps/ai-agent-service/Dockerfile && grep -q 'fetch-model.sh' apps/ai-agent-service/Dockerfile && grep -q '^USER ' apps/ai-agent-service/Dockerfile && docker build -f apps/ai-agent-service/Dockerfile -t toka-ai-agent:verify . && docker run --rm --entrypoint sh toka-ai-agent:verify -c 'find /app -name "*.onnx" | grep -q onnx'
  - **mockup_ref:** n/a

- [ ] 3.3 Verificación integral del servicio: prueba de integración sin API key, cobertura, tope de pruebas y ausencia de modelos/precios en código
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/agent-service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y cierre`
  - **Stories:** US-EX5-01, US-EX5-07
  - **Owner profile:** backend
  - **Dependencies:** 3.1
  - **Definition of done:** `apps/ai-agent-service/test/ask.e2e.spec.ts` (1 prueba; módulo Nest completo con `mock`, `hash`, `InMemoryKnowledgeStore`, Redis y user-service dobles, JWT de prueba): sin JWT → 401; con JWT y sin API key → 200 con `meta.provider='mock'`, `sources` no vacío y tokens reportados; con JWT **admin** y pregunta sobre usuarios, `meta.toolCalls` ≥1 (con JWT no admin, user-service doble responde 403 y el agente responde sin herramienta). Pasan `build`, `test` con cobertura ≥70 % de líneas y `lint`; el cambio suma ≤30 pruebas; no hay identificadores de modelo en `apps/ai-agent-service/src`. Corrige solo desajustes de integración.
  - **Verification gate:** cmd:pnpm --filter @toka/ai-agent-service build && pnpm --filter @toka/ai-agent-service exec jest && pnpm --filter @toka/ai-agent-service lint && node -e "const s=require('./apps/ai-agent-service/coverage/coverage-summary.json');process.exit(s.total.lines.pct>=70?0:1)" && n=$(grep -rEho '^[[:space:]]*(it|test)\(' apps/ai-agent-service/src apps/ai-agent-service/test | wc -l) && test "$n" -le 30 && ! grep -rEq 'cla[u]de-[0-9a-z]' apps/ai-agent-service/src apps/ai-agent-service/test && test -f apps/ai-agent-service/test/ask.e2e.spec.ts
  - **mockup_ref:** n/a

- [ ] 3.4 Documentación de integración y trazabilidad (filas EX5 de este cambio a `Implementado`)
  - **Change:** build-ai-agent-rag-service
  - **Spec:** `openspec/changes/build-ai-agent-rag-service/specs/agent-service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y cierre`
  - **Stories:** US-EX5-07
  - **Owner profile:** backend
  - **Dependencies:** 1.3, 3.1, 3.2, 3.3
  - **Definition of done:** (dominio acotado a `docs/**`) `docs/architecture/08-integracion-ia-rag.md` añade `## Verificación contra la documentación del proveedor` (fecha, versión del SDK y fuente de 1.3, sin identificadores de modelo ni precios), el contrato de `POST /agent/ask`/`POST /agent/ingest`, variables clave y suposiciones vigentes (endpoint de user-service, `lookup_users` solo con JWT con permiso/admin, rate limit fail-open, breaker local) y declara el consumidor `agent.ingest` como **Evolución** (la ingesta de este cambio es semilla + admin). `docs/traceability.md` pasa a `Implementado` las filas EX5-R01, R02, R03, R08, R09, R10, R12, R13, R14, R18, R19, R20 y R23 y EX0-R09 y EX0-R10 (con nota de que la ingesta por eventos queda diferida en R03/R14 si la fila la exige); las filas de los cambios 5, 8 y de entrega documental siguen `Planeado`. No se modifican ADR (ADR-009 #7 queda con el consumidor como Evolución; el orquestador decide si enmendarlo). Requiere haber aprobado el 📋.
  - **Verification gate:** cmd:grep -q 'Verificación contra la documentación del proveedor' docs/architecture/08-integracion-ia-rag.md && test -z "$(grep -E '^\| EX5-R(01|02|03|08|09|10|12|13|14|18|19|20|23) ' docs/traceability.md | grep 'Planeado')" && test -z "$(grep -E '^\| EX0-R(09|10) ' docs/traceability.md | grep 'Planeado')" && grep -E '^\| EX5-R04 ' docs/traceability.md | grep -q 'Planeado' && ! grep -rEq 'cla[u]de-[0-9a-z]' docs/architecture/08-integracion-ia-rag.md docs/traceability.md
  - **mockup_ref:** n/a
