# 01 — Diagramas de arquitectura

Este documento reúne el diagrama C4 de contenedores y tres secuencias Mermaid de los flujos críticos. El contrato (nombres, puertos, eventos, bindings, claves Redis) está fijado en `openspec/changes/design-architecture-docs/design.md`; las decisiones están en `docs/adrs/` (ADR-001 a ADR-010).

Convenciones de lectura:

- **Flecha continua** = comunicación síncrona (REST) o acceso directo a un almacén.
- **Flecha punteada** = comunicación asíncrona (eventos AMQP sobre RabbitMQ, exchange `toka.events`).
- `jwt-guard` es una librería compartida (no un contenedor): en cada servicio valida el JWT localmente y consulta el denylist de Redis.
- `web` es un reverse proxy / gateway ligero (nginx + SPA React). No enruta `/internal/*` ni `/oauth/*`, que solo existen en la red interna de Docker.

## 1. C4 — Contenedores

```mermaid
flowchart LR
  subgraph NETPUBLIC["Red public (solo web publica :8080)"]
    U["Usuario / Navegador"] -->|"HTTPS/HTTP :8080"| WEB["web<br/>React + nginx reverse proxy / gateway ligero"]
  end

  subgraph NETEDGE["Red edge (internal: web + servicios)"]
  subgraph APP["Contenedores de aplicación (NestJS, TypeScript)"]
    AUTH["auth-service :3001<br/>Identidad y sesiones"]
    USER["user-service :3002<br/>Gestión de usuarios"]
    ROLE["role-service :3003<br/>Roles y permisos"]
    AUDIT["audit-service :3004<br/>Auditoría de accesos"]
    AGENT["ai-agent-service :3005<br/>Agente IA + RAG"]
  end
  end

  WEB -->|"REST /api/auth"| AUTH
  WEB -->|"REST /api/users"| USER
  WEB -->|"REST /api/roles"| ROLE
  WEB -->|"REST /api/audit"| AUDIT
  WEB -->|"REST /api/agent"| AGENT

  USER -->|"REST: validar rol"| ROLE
  USER -->|"REST interno + JWT de servicio: PUT/DELETE /internal/credentials"| AUTH
  AGENT -->|"REST con JWT del llamante: consulta de usuarios"| USER

  subgraph STORES["Red backend (internal): almacenes y broker"]
    PGA[("PostgreSQL auth_db")]
    PGU[("PostgreSQL user_db<br/>incluye outbox_events")]
    PGR[("PostgreSQL role_db")]
    MONGO[("MongoDB audit_db")]
    REDIS[("Redis<br/>prefijo por servicio")]
    QDRANT[("Qdrant<br/>knowledge_base")]
    MQ{{"RabbitMQ<br/>exchange toka.events"}}
  end

  AUTH --> PGA
  USER --> PGU
  ROLE --> PGR
  AUDIT --> MONGO
  AGENT --> QDRANT

  ROLE -->|"role:perm:*"| REDIS
  AUTH -->|"escribe auth:deny:jti:* y auth:deny:user:*"| REDIS
  AGENT -->|"agent:rl:*"| REDIS
  USER -->|"lee el denylist (síncrono, vía jwt-guard; lo hacen todos los servicios)"| REDIS

  USER -.->|"outbox, eventos user.*"| MQ
  AUTH -.->|"eventos auth.login.*, publicación directa"| MQ
  ROLE -.->|"eventos role.*"| MQ
  MQ -.->|"cola audit.events"| AUDIT
  MQ -.->|"cola auth.user-projection"| AUTH
  MQ -.->|"cola agent.ingest"| AGENT

  subgraph NETEGRESS["Red egress (solo ai-agent-service)"]
    LLM[["Proveedor LLM externo<br/>o mock sin API key"]]
  end
  AGENT -->|"puerto LlmProvider"| LLM
```

**Redes (lectura del diagrama).** `public` solo une a `web`, que publica `8080` (una red `internal` no puede publicar puertos). `edge` es `internal` y comparte `web` con los servicios de aplicación. `backend` es `internal` y aloja almacenes y broker. `egress` es la única con salida a Internet y solo se une a `ai-agent-service` (hacia el proveedor LLM). Detalle normativo en [04-docker-compose-diseno.md](04-docker-compose-diseno.md).

**Explicación.** Los seis contenedores de aplicación (`web`, `auth-service`, `user-service`, `role-service`, `audit-service`, `ai-agent-service`) se comunican por REST cuando necesitan respuesta inmediata (validar rol, aprovisionar credenciales, consultar usuarios) y por eventos cuando basta consistencia eventual (auditoría, proyección de usuarios en auth, ingesta del agente). Cada servicio posee su almacén; la única lectura cruzada es el denylist (`auth:deny:jti:*` y `auth:deny:user:*`) en Redis (escribe auth-service, leen todos vía `jwt-guard`).

Colas y bindings (en topic, `*` casa una palabra y `#` cero o más; por eso se usa `#`):

| Cola | Bindings sobre `toka.events` | Consumidor |
|---|---|---|
| `audit.events` | `user.#`, `auth.#`, `role.#` | audit-service (escribe en Mongo) |
| `auth.user-projection` | `user.#`, `role.updated` | auth-service (activa credenciales y mantiene `user_roles_projection`) |
| `agent.ingest` | `role.#` | ai-agent-service (regenera documentos del catálogo de roles) |

Cada cola tiene cola de reintento con retardo (`<cola>.retry`) y DLQ (`<cola>.dlq`). Las denegaciones 403 no viajan por AMQP: se registran en el log con `event=access.denied` (su publicación por AMQP es Evolución).

Referencias: ADR-001 (monorepo), ADR-002 (límites de servicio y BD por servicio), ADR-004 (mensajería RabbitMQ), ADR-005 (REST y resiliencia), ADR-010 (reverse proxy).

## 2. Secuencia — Login y validación local de JWT con JWKS

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant W as web (nginx)
  participant A as auth-service
  participant PG as postgres (auth_db)
  participant R as redis
  participant S as user-service (con jwt-guard)
  participant MQ as rabbitmq

  U->>W: POST /api/auth/login (limit_req)
  W->>A: POST /auth/login
  A->>PG: buscar credenciales y verificar argon2id
  PG-->>A: credenciales ACTIVE
  A->>A: firmar access token RS256 con kid (claims sub, roles, jti, aud, exp)
  A->>PG: guardar refresh token (hash, family_id)
  A-->>W: 200 access token + cookie HttpOnly (Path /api/auth)
  W-->>U: access token (se guarda en memoria)
  A-)MQ: auth.login.succeeded (publicación directa)

  Note over U,S: Petición autenticada posterior

  U->>W: GET /api/users con Authorization Bearer
  W->>S: GET /users
  alt JWKS no está en caché
    S->>A: GET /.well-known/jwks.json
    A-->>S: JWKS (clave pública y kid)
  end
  S->>S: validar firma RS256, aud y exp localmente
  S->>R: consultar auth:deny:jti:jti y auth:deny:user:sub (denylist)
  alt jti denegado
    R-->>S: presente
    S-->>W: 401
  else Redis responde sin denegación
    R-->>S: ausente
    S-->>W: 200 respuesta
  else Redis no responde (timeout)
    Note over S,R: fail-open solo en el denylist, log warn y métrica
    S-->>W: 200 respuesta
  end
  W-->>U: respuesta
```

**Explicación.** auth-service es el único que hashea (argon2id) y emite tokens. Los demás servicios no llaman a auth por petición: validan la firma localmente con la clave pública del JWKS (cacheada, identificada por `kid`) y consultan solo el denylist de Redis para soportar revocación. Si Redis no responde, `jwt-guard` falla abierto únicamente en el denylist (firma, `aud` y `exp` se siguen validando), con log `warn` y métrica; el riesgo queda acotado por la vida corta del access token. El refresh usa un único camino, `POST /auth/refresh`, con rotación por `family_id`. El evento `auth.login.succeeded` se publica directo (sin outbox; riesgo aceptado, respaldo `audit.fallback` en log estructurado).

Referencias: ADR-003 (JWT RS256, JWKS, RBAC, denylist), ADR-004 (eventos de auth publicados directo), ADR-010 (`limit_req`, tokens en memoria y cookie HttpOnly).

## 3. Secuencia — Alta de usuario: `user.created` vía outbox hasta auditoría

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente (admin)
  participant U as user-service
  participant PU as postgres (user_db)
  participant RO as role-service
  participant A as auth-service
  participant PA as postgres (auth_db)
  participant MQ as rabbitmq (toka.events)
  participant AU as audit-service
  participant MG as mongo (audit_db)

  C->>U: POST /users
  U->>PU: crear users con status PENDING
  U->>RO: validar rol (REST, timeout y circuit breaker)
  RO-->>U: rol válido
  U->>A: PUT /internal/credentials/userId (JWT de servicio, idempotente)
  A->>A: hashear contraseña con argon2id
  A->>PA: credentials PENDING y rol inicial en user_roles_projection
  A-->>U: 200
  U->>PU: transacción: users ACTIVE y outbox_events (user.created)
  U-->>C: 201 usuario creado

  loop publicador periódico del outbox
    U->>PU: leer outbox_events sin publicar
    U-)MQ: user.created (eventId, aggregateVersion, occurredAt, correlationId)
    U->>PU: marcar published_at
  end

  par cola audit.events
    MQ-)AU: user.created
    AU->>MG: insertar audit_events (índice único por eventId, idempotente)
  and cola auth.user-projection
    MQ-)A: user.created
    A->>PA: activar credenciales solo si PENDING y aggregateVersion mayor que last_version
    Note over A,PA: el login queda habilitado tras la activación (consistencia eventual)
  end

  Note over U,A: Si falla un paso antes de ACTIVE: user-service elimina el PENDING y llama DELETE /internal/credentials/userId (compensación)
```

**Explicación.** El alta es una saga cerrada. user-service crea el usuario `PENDING`, valida el rol con role-service y aprovisiona credenciales en auth-service por un canal REST interno (no enrutado por nginx; exige JWT de servicio con `aud: auth-service` y `scope: svc:internal`). Luego marca `ACTIVE` y escribe `user.created` en `outbox_events` en la misma transacción; un publicador periódico lo emite a RabbitMQ (outbox transaccional solo en user-service). La entrega es at-least-once: audit-service deduplica por `eventId` y auth-service ignora eventos con `aggregateVersion` menor o igual a `last_version`, de modo que un `user.created` reintentado nunca reactiva a un usuario `DISABLED`. La reconciliación de usuarios `PENDING` huérfanos con período de gracia vive solo en user-service; auth-service nunca borra credenciales automáticamente.

Referencias: ADR-002 (saga y límites), ADR-004 (outbox, at-least-once, orden), ADR-005 (timeouts y circuit breaker user→role y user→auth), ADR-003 (argon2id solo en auth).

## 4. Secuencia — Consulta RAG del agente con reenvío del JWT

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant W as web (nginx)
  participant G as ai-agent-service
  participant R as redis
  participant Q as qdrant
  participant S as user-service
  participant L as LlmProvider (proveedor LLM o mock)

  U->>W: POST /api/agent/ask con Authorization Bearer
  W->>G: POST /agent/ask
  G->>G: validar JWT localmente (jwt-guard con JWKS y denylist)
  G->>R: rate limit agent:rl:userId:route
  R-->>G: dentro del límite
  G->>G: embedding local ONNX de la pregunta (384 dimensiones)
  G->>Q: búsqueda por similitud en knowledge_base
  Q-->>G: fragmentos de documentos de conocimiento (ragHits)
  opt la pregunta requiere datos de usuarios
    G->>S: GET /users reenviando el JWT del llamante
    Note over G,S: delegación: sin identidad privilegiada del agente, user-service aplica RBAC (evita confused deputy)
    S-->>G: usuarios (RBAC del llamante)
  end
  G->>G: construir prompt: fragmentos y salida de herramientas como datos no confiables, solo campos en lista blanca
  G->>L: generar respuesta (timeout, circuit breaker, manejo de 429)
  L-->>G: respuesta y tokensIn/tokensOut
  G->>G: validar salida contra esquema y registrar llm.provider, llm.tokensIn, llm.tokensOut, ragHits
  G-->>W: 200 respuesta con fuentes
  W-->>U: respuesta
```

**Explicación.** La recuperación usa embeddings locales ONNX (funcionan sin API key) sobre documentos de conocimiento, no sobre PII de usuarios. Los datos de usuarios llegan solo por la herramienta REST hacia user-service, que reenvía el JWT del llamante para que user-service aplique RBAC con la identidad real. Al LLM solo se envía una lista blanca de campos (`id`, `name`, `role`, `status`). Sin `ANTHROPIC_API_KEY` el puerto `LlmProvider` selecciona el proveedor `mock` determinista; la recuperación RAG sigue siendo real. Los fragmentos recuperados y la salida de herramientas se tratan como datos no confiables (mitigación de prompt injection). El circuit breaker protege las aristas agent→user y agent→LLM; si el LLM falla, el agente degrada a una respuesta sin generación.

Referencias: ADR-008 (puerto LlmProvider, prompt injection, lista blanca), ADR-009 (RAG, ONNX, Qdrant), ADR-005 (resiliencia agent→user y agent→LLM), ADR-003 (JWT).
