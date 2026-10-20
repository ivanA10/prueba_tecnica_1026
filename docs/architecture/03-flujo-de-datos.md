# 03 — Flujo de datos

Este documento explica cómo viajan los datos entre los microservicios de Toka: qué se resuelve de forma síncrona (REST) y qué de forma asíncrona (eventos en RabbitMQ). Decisiones de fondo: [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md) (eventos) y [ADR-005](../adrs/ADR-005-sync-rest-resilience.md) (REST). Los modos de fallo de cada flujo están en [07-resiliencia.md](07-resiliencia.md).

## Resumen

| Servicio | Puerto | Almacenes | Publica | Consume (cola) |
|---|---|---|---|---|
| `auth-service` | 3001 | Postgres `auth_db`, Redis `auth:*` | `auth.login.succeeded`, `auth.login.failed` | `user.#`, `role.updated` (`auth.user-projection`) |
| `user-service` | 3002 | Postgres `user_db` (incl. `outbox_events`) | `user.created`, `user.updated`, `user.deleted`, `user.role.assigned` (vía outbox) | — |
| `role-service` | 3003 | Postgres `role_db`, Redis `role:*` | `role.created`, `role.updated`, `role.permissions.changed` | — |
| `audit-service` | 3004 | MongoDB `audit_db` | — | `user.#`, `auth.#`, `role.#` (`audit.events`) |
| `ai-agent-service` | 3005 | Qdrant, Redis `agent:*` | — | `role.#` (`agent.ingest`) |
| `web` | 8080 | — | — | — |

El navegador solo habla con `web` (nginx, reverse proxy / gateway ligero), que enruta `/api/{auth,users,roles,audit,agent}` al servicio correspondiente y aplica `limit_req` a `/api/auth/login`. No enruta `/internal/*` ni `/oauth/*`: esos endpoints solo existen en la red interna de Docker.

## Comunicación síncrona

Se usa REST + OpenAPI cuando el llamante necesita la respuesta para continuar o no puede confirmar la operación sin ella. Cada llamada propaga `x-correlation-id` (se genera en el borde si falta) y lleva timeout; los reintentos con backoff y los circuit breakers están en [07-resiliencia.md](07-resiliencia.md).

| Arista | Endpoint | Autenticación | Propósito |
|---|---|---|---|
| web → servicios | `/api/*` vía nginx | JWT de usuario (`aud: toka-api`) | Operaciones del usuario final |
| user → role | `GET /roles/{id}` | JWT de servicio | Validar el rol en el alta |
| user → auth | `PUT /internal/credentials/{userId}` | JWT de servicio (`aud: auth-service`, `scope: svc:internal`) | Aprovisionar credenciales (idempotente por `user_id`) |
| user → auth | `DELETE /internal/credentials/{userId}` | ídem | Compensación del alta (se llama antes de borrar el usuario `PENDING`) |
| agent → user | `GET /users` | JWT del llamante reenviado (delegación) | Herramienta REST del agente; user-service aplica RBAC |
| servicio → auth | `POST /oauth/token` (`client_credentials`) | `client_id/client_secret` | Obtener JWT de servicio (en caché hasta `exp`) |
| servicio → auth | `GET /.well-known/jwks.json` | — | Obtener la clave pública (caché `<svc>:jwks` en Redis) |
| agent → LLM | `LlmProvider` | API key o `mock` | Generación de la respuesta |

### Flujo: login

1. `POST /api/auth/login` (nginx aplica `limit_req`; auth además usa `auth:rl:login:{ip}` en Redis).
2. auth-service lee `credentials` en `auth_db`, verifica argon2id y exige `status=ACTIVE` (`PENDING` y `DISABLED` se rechazan).
3. El rol del claim sale de `user_roles_projection` (`role_id`) unido a `role_names_projection` (`role_name`) en `auth_db`.
4. Emite access token RS256 (cabecera `kid`, claims `sub`, `roles[]`, `jti`, `iat`, `exp`, `iss`, `aud`), guarda el refresh opaco (`refresh_tokens`, `family_id`) y lo entrega en cookie `HttpOnly; SameSite=Strict; Path=/api/auth`. El access token vive solo en memoria del cliente.
5. Publica `auth.login.succeeded` o `auth.login.failed` en `toka.events` (directo, sin outbox: ver [07-resiliencia.md](07-resiliencia.md)).
6. En cada petición posterior, `jwt-guard` de cada servicio valida firma, `aud` y `exp` localmente con el JWKS en caché y consulta en Redis las denylists `auth:deny:jti:{jti}` y `auth:deny:user:{userId}` (único par de claves con lectura cruzada permitida; la segunda rechaza tokens con `iat` anterior a la marca de deshabilitación).
7. Refresco: `POST /auth/refresh` (único camino) con rotación por `family_id`. Logout: `POST /auth/logout` revoca el refresh y escribe el `jti` en el denylist con TTL igual a la vida restante del token.

### Flujo: alta de usuario (crear usuario)

| Paso | Llamada / evento | Origen → destino | Almacén tocado |
|---|---|---|---|
| 1 | `POST /api/users` | web → user-service | `user_db.users` (`status=PENDING`; la contraseña no se persiste ni se loguea) |
| 2 | `GET /roles/{id}` (REST, circuit breaker) | user → role | `role_db` (lectura; caché `role:perm:{roleId}`) |
| 3 | `PUT /internal/credentials/{userId}` (REST, JWT de servicio, idempotente) | user → auth | `auth_db.credentials` (`PENDING`, hash argon2id) y `user_roles_projection` (rol inicial como `role_id`) |
| 4 | Transacción local: `users.status=ACTIVE` + fila `outbox_events(user.created)` | user-service | `user_db` (una sola transacción) |
| 5 | El publicador del outbox emite `user.created` en `toka.events` y marca `published_at` | user → RabbitMQ | `user_db.outbox_events` |
| 6 | Consumo en `auth.user-projection` (binding `user.#`): activa `credentials` solo si estaba `PENDING` y `aggregateVersion > user_last_version` | RabbitMQ → auth | `auth_db` (`credentials`, `processed_events`) |
| 7 | Consumo en `audit.events` (binding `user.#`) | RabbitMQ → audit | `audit_db.audit_events` (Mongo) |

El paso 3 es síncrono porque el alta no debe confirmarse sin credenciales aprovisionadas. El login queda habilitado cuando auth procesa `user.created` (paso 6): consistencia eventual, normalmente segundos. Los pasos 2 y 3 comparten un presupuesto total de ≤10 s (los reintentos cuentan contra él). Si falla el paso 2, 3 o 4 se ejecuta la compensación descrita en [07-resiliencia.md](07-resiliencia.md#compensación-del-alta-de-usuario): primero `DELETE /internal/credentials/{userId}` y, solo tras confirmarse, se elimina el usuario `PENDING`.

Otros cambios de usuario: `PUT /users/{id}/role` emite `user.role.assigned`; `PATCH /users/{id}` emite `user.updated` (con `status=DISABLED` auth marca las credenciales `DISABLED` y revoca refresh tokens); `DELETE /users/{id}` emite `user.deleted` (auth borra credenciales). Todos salen por el outbox de user-service.

### Flujo: consulta del agente (`POST /agent/ask`)

1. El cliente envía JWT; `jwt-guard` lo valida y `agent:rl:{userId}:{route}` (Redis) aplica el rate limit por usuario.
2. El agente genera el embedding de la pregunta (ONNX local) y recupera fragmentos de la colección `knowledge_base` de Qdrant (documentos de conocimiento, nunca PII de usuarios).
3. Si necesita datos de usuarios, llama `GET /users` en user-service **reenviando el JWT del llamante**; solo la lista blanca de campos (`id`, `name`, `role`, `status`) llega al LLM.
4. Llama al `LlmProvider` (Anthropic o `mock` si no hay API key) con el contexto delimitado como datos no confiables y devuelve la respuesta validada contra esquema. Todo el flujo respeta un presupuesto de 30 s (LLM 20 s por llamada, herramienta user 3 s); al agotarse se cancela la petición al LLM y se responde solo con fragmentos, marcando que no hay generación ([07-resiliencia.md](07-resiliencia.md#presupuestos-de-tiempo-jerarquía-nginx--agente--llm)).

### Flujo: consulta de auditoría

`GET /api/audit/events` (filtros: actor, tipo, rango de fechas, paginación) lee directamente de `audit_db` (modelo de lectura de audit-service). No depende de ningún otro servicio en línea.

## Gestión de roles y autorización

1. **Crear / actualizar un rol** (solo admin): `POST /api/roles` o `PUT /api/roles/{id}` llega a role-service, que valida con `jwt-guard` + RBAC, escribe en `role_db` (con `aggregateVersion` del rol, que `GET /roles/{id}` devuelve como `version`), invalida la caché `role:perm:{roleId}` y publica `role.created` / `role.updated` / `role.permissions.changed` en `toka.events` (directo, riesgo aceptado: ver Garantías).
2. **Efectos asíncronos del evento**: `audit.events` lo registra; `auth.user-projection` actualiza `role_names_projection(role_id, role_name, last_version)` solo si la versión es mayor (así el claim de rol refleja el renombrado en el siguiente token); `agent.ingest` regenera el documento del catálogo en Qdrant.
3. **Asignar un rol a un usuario**: `PUT /api/users/{id}/role` en user-service (solo admin) valida el rol con `GET /roles/{id}`, actualiza el usuario y emite `user.role.assigned` por outbox; auth actualiza `user_roles_projection(user_id, role_id, user_last_version)` si la versión es mayor. El nuevo rol aparece en los tokens emitidos a partir de ese momento (los access tokens vigentes conservan el rol anterior hasta expirar).
4. **Comprobación RBAC**: en cada petición, `jwt-guard` valida firma, `aud` y `exp`, consulta las denylists y expone `roles[]` del JWT; el guard de roles de cada endpoint compara esos roles con los permitidos (p. ej. gestión de roles y de usuarios solo `admin`).
5. **Denegación**: si el rol no basta, responde `403` y registra con pino `event=access.denied` (con `correlationId`, `userId` y ruta). No viaja por AMQP (Evolución), así que no aparece en audit-service; la recuperación es por logs.

## Comunicación asíncrona

Se usa RabbitMQ cuando el emisor no necesita la respuesta y varios consumidores reaccionan de forma independiente. Exchange `toka.events` (topic, durable) y `toka.events.dlx` para mensajes muertos. En un topic, `*` casa UNA palabra y `#` cero o más; como las claves tienen 2 o 3 segmentos (`user.role.assigned`), los bindings usan `#`.

| Cola | Bindings | Consumidor | Qué hace |
|---|---|---|---|
| `audit.events` | `user.#`, `auth.#`, `role.#` (`access.#` reservado: Evolución) | audit-service | Inserta en `audit_events` (append-only, índice único `eventId`) |
| `auth.user-projection` | `user.#`, `role.updated` | auth-service | Mantiene `credentials`, `user_roles_projection` y `role_names_projection` |
| `agent.ingest` | `role.#` | ai-agent-service | Regenera los documentos del catálogo de roles/permisos en Qdrant (upsert por `docId` estable) |

Cada cola tiene `<cola>.retry` (retardo por TTL + DLX) y `<cola>.dlq`; el detalle está en [07-resiliencia.md](07-resiliencia.md#reintentos-y-dlq).

### Sobre del evento

`eventId` (UUID), `type` (routing key), `version` (esquema), `aggregateVersion` (monotónico por agregado), `occurredAt` (ISO-8601 UTC), `correlationId`, `actor` (`{userId, roles}` o `system`) y `payload`. Los contratos viven en el paquete `contracts` con compatibilidad hacia atrás.

### Garantías

- **At-least-once** con consumidores idempotentes por `eventId` (índice único en Mongo; `processed_events` o clave de dedupe en proyecciones y en la ingesta del agente).
- **Orden**: las colas de retardo rompen el orden, así que los consumidores de proyección aplican un evento solo si su `aggregateVersion` es mayor que la última versión almacenada **del mismo agregado**: la proyección de auth guarda `user_last_version` por usuario en `user_roles_projection(user_id, role_id, user_last_version)` (eventos `user.*`, sin nombre de rol) y la versión del rol en `role_names_projection(role_id, role_name, last_version)` (eventos `role.updated`, aplicados solo si su versión es mayor). El nombre del rol se obtiene por join al emitir el token. Un `user.created` reintentado nunca reactiva a un usuario `DISABLED`.
- **Publicación**: user-service usa outbox transaccional; auth-service publica directo con respaldo `audit.fallback` en log; role-service publica `role.*` directo (riesgo aceptado como el de auth, ver [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md); recuperación: re-sincronización del catálogo de roles al arrancar, con eventos `actor=system` y `reason=resync` que audit puede filtrar). Las denegaciones 403 no viajan por AMQP: se registran en el log con `event=access.denied` (publicación por AMQP = Evolución).

### Flujo: auditoría de punta a punta

`user-service` (outbox) o `auth-service` / `role-service` (directo) → `toka.events` → cola `audit.events` → audit-service → `audit_db.audit_events` → `GET /api/audit/events`. El `correlationId` del sobre permite enlazar el evento con los logs JSON de cada servicio.

### Flujo: ingesta del agente

- La semilla al arrancar y `POST /agent/ingest` (solo admin) cargan documentos de conocimiento en Qdrant.
- `role.created` / `role.updated` / `role.permissions.changed` llegan por `agent.ingest` y regeneran el documento del catálogo de roles. Chunks ≤256 tokens con solapamiento ~32; embeddings ONNX locales de 384 dimensiones, distancia coseno.

## Referencias

- [ADR-004 — Eventos asíncronos con RabbitMQ](../adrs/ADR-004-async-rabbitmq-events.md)
- [ADR-005 — REST síncrono y resiliencia](../adrs/ADR-005-sync-rest-resilience.md)
- [ADR-003 — Autenticación JWT](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md)
- [07 — Resiliencia y manejo de fallos](07-resiliencia.md)
