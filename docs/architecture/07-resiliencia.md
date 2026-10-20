# 07 — Resiliencia y manejo de fallos

Describe, por interacción entre servicios, qué ocurre cuando algo falla y qué mecanismo lo contiene. Decisiones de fondo: [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md) (mensajería, reintentos, outbox, DLQ), [ADR-005](../adrs/ADR-005-sync-rest-resilience.md) (timeouts, backoff, circuit breaker) y [ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md) (política de `jwt-guard` ante Redis caído). Los flujos están en [03-flujo-de-datos.md](03-flujo-de-datos.md).

## Principios

- **Timeout en toda llamada REST**, con valor por arista configurable por variable de entorno.
- **Reintentos con backoff exponencial y jitter solo en operaciones idempotentes** (`GET`, `PUT` y `DELETE /internal/credentials/{userId}`); nunca en `POST` no idempotentes.
- **Circuit breaker solo en cuatro aristas**: user→role, user→auth, agent→user y agent→LLM. Abierto, responde rápido con error controlado (o degradación del agente) en vez de esperar al timeout.
- **At-least-once + idempotencia** en eventos; orden por `aggregateVersion`.
- **Healthchecks**: todos los servicios exponen `GET /health` (liveness) y `GET /ready` (readiness: dependencias críticas alcanzables). En compose, `depends_on` con `condition: service_healthy`.
- **Fallos visibles**: logs JSON con `correlationId`; los fallos de seguridad y respaldo llevan `event` (`access.denied`, `audit.fallback`).

### Timeouts por arista

Valores por defecto de diseño (configurables por env; se reconcilian en la implementación).

| Arista | Timeout | Reintentos (backoff + jitter) | Circuit breaker |
|---|---|---|---|
| user → role (`GET /roles/{id}`) | 2 s | 2 (200 ms, 400 ms) | Sí |
| user → auth (`PUT`/`DELETE /internal/credentials/{userId}`) | 3 s | 3 (250 ms, 500 ms, 1 s) | Sí |
| agent → user (`GET /users`) | 3 s | 2 (200 ms, 400 ms) | Sí |
| agent → LLM (`LlmProvider`) | 20 s por llamada (mayor por la latencia de generación) | como máximo 1, solo si queda presupuesto del agente (ver abajo) | Sí |
| servicio → auth (`/oauth/token`, JWKS) | 2 s | 2 | No (caché hasta `exp` y `<svc>:jwks`) |
| web (nginx) → servicio | 30 s de lectura; 5 s de conexión | No | No |
| web (nginx) → `/api/agent/` | `proxy_read_timeout` 40 s; 5 s de conexión | No | No |

Umbral típico del breaker (configurable): se abre tras 5 fallos consecutivos o 50 % de errores en una ventana; semiabierto tras 30 s con una petición de prueba.

### Presupuestos de tiempo (jerarquía nginx > agente > LLM)

Los timeouts por arista no bastan: cada flujo tiene un presupuesto total que acota los reintentos, y el borde espera más que el flujo interno para que la degradación llegue al cliente.

| Flujo | Presupuesto total | Composición | Al agotarse |
|---|---|---|---|
| `POST /agent/ask` | **30 s** extremo a extremo | llamada al LLM 20 s, como máximo 1 reintento solo si queda presupuesto, herramienta user 3 s (con sus reintentos dentro del presupuesto) | Se deja de esperar la petición en vuelo al LLM (`AbortController` cierra la conexión; el consumo ya iniciado en el proveedor puede facturarse, acotado por `max_tokens`) y se devuelve la respuesta degradada (solo fragmentos recuperados, indicando que no hay generación) |
| `/api/agent/` en nginx | **40 s** (`proxy_read_timeout`) | mayor que el presupuesto del agente (30 s) | El agente responde (degradado) antes de que nginx corte; nunca un 504 sin que el agente haya aplicado su degradación |
| `POST /users` (alta) | **≤10 s** antes de iniciar la compensación | validación de rol (2 s por intento) y aprovisionamiento en auth (3 s por intento) más sus reintentos, todos dentro del mismo presupuesto | Los reintentos cuentan contra el presupuesto: al agotarse no se reintenta más, se ejecuta la compensación y se responde 503 |

El período de gracia de la reconciliación del alta es mayor que los 10 s del presupuesto, para no barrer altas en vuelo. Una respuesta 429 del LLM se trata dentro del mismo presupuesto del agente (ver la matriz de fallos).

## Matriz de fallos

| Interacción | Modo de fallo | Mecanismo | Resultado para el cliente / estado |
|---|---|---|---|
| user → role durante `POST /users` | role-service no responde o lento | Timeout 2 s, 2 reintentos con backoff dentro del presupuesto del alta (≤10 s), circuit breaker; luego compensación | Error 503 controlado; el usuario `PENDING` se elimina; **nunca queda un usuario `ACTIVE`**; con el breaker abierto responde rápido |
| user → auth (`PUT /internal/credentials`) | auth-service caído, timeout o 5xx | Timeout 3 s, 3 reintentos (idempotente por `user_id`) dentro del presupuesto del alta (≤10 s), circuit breaker; compensación | Error al cliente; se llama `DELETE /internal/credentials/{userId}` y, solo tras confirmarse, se elimina `PENDING` (si el `DELETE` falla, el usuario sigue `PENDING` y la reconciliación reintenta) |
| user → auth: `409` por email duplicado | Email ya existe en auth | Sin reintento; compensación | `409` al cliente (user-service es la fuente de verdad del email) |
| agent → user (herramienta REST) | user-service lento o caído | Timeout 3 s, reintentos en `GET`, circuit breaker | El agente responde sin datos de usuarios, indicándolo; sigue usando RAG |
| agent → LLM | Timeout, 5xx o 429 | Timeout 20 s por llamada dentro del presupuesto de 30 s del agente, como máximo 1 reintento, limitador de concurrencia, circuit breaker, rate limit por usuario en Redis. Ante un 429 del LLM se respeta `retry-after` si cabe en el presupuesto; si no, degradación | Degradación: solo los fragmentos recuperados, marcando que no hay generación (nunca texto del proveedor `mock` a usuarios reales); 429 al usuario si excede su límite |
| ai-agent sin API key | No hay `ANTHROPIC_API_KEY` | Selección automática del proveedor `mock` determinista | Funciona sin clave; respuesta determinista (pruebas y evaluación) |
| RabbitMQ caído (publicación desde user-service) | Broker inalcanzable | **Outbox transaccional**: `outbox_events` se escribe en la misma transacción; el publicador reintenta hasta que el broker vuelve | No se pierde ningún evento de user; la activación de credenciales y la auditoría se retrasan (consistencia eventual) |
| RabbitMQ caído (publicación desde auth-service) | Broker inalcanzable más tiempo que la ventana de reintento en memoria | Reintento en memoria; al agotarse, el sobre completo se escribe como log estructurado `event="audit.fallback"` (recuperable con `jq`, ADR-007) | El login no se ve afectado; el evento no llega a audit por AMQP hasta recuperarlo del log. **Riesgo aceptado** (ver abajo) |
| RabbitMQ caído (consumo) | Los consumidores pierden la conexión | Reconexión automática; colas y mensajes durables conservan los eventos pendientes | Auditoría y proyección se retrasan, no se pierden |
| Consumidor con error transitorio | Excepción al procesar | Colas de retardo (TTL + DLX), `x-retry-count`, hasta N reintentos, luego DLQ | Ver [Reintentos y DLQ](#reintentos-y-dlq) |
| Mensaje duplicado | Re-entrega at-least-once | Idempotencia por `eventId` (índice único en Mongo; `processed_events`; dedupe en el agente) | Sin efectos duplicados |
| Mensaje fuera de orden | Reintento con retardo adelantado por otro evento | Se aplica solo si `aggregateVersion` es mayor que la última versión del mismo agregado (`user_last_version` en `user_roles_projection`; `last_version` en `role_names_projection`) | Un `user.created` retrasado no reactiva a un usuario `DISABLED` |
| Redis caído | Redis no responde en `jwt-guard` (denylists `auth:deny:jti:*` y `auth:deny:user:*`) | Timeout corto; **fail-open solo en el denylist**: la petición continúa validando firma, `aud` y `exp`; log `warn` + métrica | Servicio operativo; un token revocado podría aceptarse hasta su expiración, riesgo acotado por el access token corto (≤5–15 min). Se descartó fallar cerrado: tumbaría los 5 servicios |
| Redis caído (otros usos) | Caché de permisos, JWKS o rate limit | Caché: se lee de la fuente (role_db; JWKS de auth); rate limit del agente: se degrada con log; `limit_req` de nginx sigue activo | Más latencia; el rate limit por Redis puede dejar de aplicarse temporalmente |
| Postgres de un servicio caído | `/ready` falla | El healthcheck saca al servicio del tráfico; nginx devuelve 502/503; los demás servicios no se ven afectados (BD por servicio) | Fallo aislado al contexto afectado |
| MongoDB caído | audit no puede escribir | Fallo transitorio del consumidor: reintentos con retardo, luego DLQ; `GET /audit/events` devuelve 503 | Los eventos esperan en cola o DLQ y se re-drive |
| Qdrant caído | Falla la recuperación RAG | `/ready` del agente lo refleja; el agente responde sin contexto recuperado, indicándolo | Degradación; los demás servicios no se ven afectados |
| Arranque en frío | Dependencia aún no lista | `healthcheck` + `depends_on: condition: service_healthy` | Los servicios arrancan en orden |

### Riesgo aceptado: pérdida de eventos de auth sin outbox

auth-service publica `auth.login.*` y role-service publica `role.*`, ambos directo y sin outbox. Un fallo del proceso entre la operación y la publicación, o una caída de RabbitMQ más larga que la ventana de reintento, pierde esos eventos (auditoría y, en role, también la proyección del claim y la ingesta del agente). Mitigación: respaldo `audit.fallback` en el log estructurado con el sobre completo, recuperable con la receta `jq` de ADR-007; además, role-service re-sincroniza su catálogo de roles al arrancar (republica el estado vigente para proyección y agente). Los eventos republicados llevan `actor=system` y `reason=resync`, para que audit pueda filtrarlos y no se confundan con cambios de rol reales. Outbox de auth y `access.denied` por AMQP = **Evolución**. El outbox se limita a user-service porque ahí el evento es la base de la activación de credenciales y de la auditoría de cambios de usuario; replicarlo en todos los servicios excede el alcance.

## Compensación del alta de usuario

El alta combina una llamada REST síncrona a auth-service y un evento asíncrono: dos escrituras en bases distintas (**riesgo de doble escritura**: `user_db` y `auth_db` no comparten transacción). Se resuelve con una saga `PENDING → ACTIVE` con compensación, y con outbox en user-service para que el cambio de estado y el evento `user.created` se confirmen atómicamente.

**Camino feliz**

1. user-service crea `users(status=PENDING)`.
2. Valida el rol con role-service (REST, circuit breaker).
3. `PUT /internal/credentials/{userId}` a auth-service (idempotente): crea `credentials(status=PENDING)`; el login se rechaza mientras esté `PENDING`.
4. En una sola transacción, user-service marca `ACTIVE` y escribe `outbox_events(user.created)`.
5. El publicador emite `user.created`; auth-service activa las credenciales solo si están `PENDING` y `aggregateVersion > user_last_version`.

**Presupuesto del alta.** Todo el alta (pasos 2 y 3, con sus reintentos) tiene un presupuesto total de **≤10 s** antes de iniciar la compensación; los reintentos cuentan contra ese presupuesto.

**Compensación.** Si falla el paso 2, 3 o 4:

1. user-service llama `DELETE /internal/credentials/{userId}` (idempotente; con reintento y backoff) **primero**.
2. Solo tras confirmarse el `DELETE` elimina el usuario `PENDING`.
3. Responde error al cliente.

Si el `DELETE` falla, el usuario **sigue `PENDING`** (el email permanece reservado) y la reconciliación de user-service reintenta el `DELETE` y después elimina el usuario. Así el email nunca queda bloqueado por credenciales huérfanas en auth: siempre existe una fila en user-service que reconciliar.

**Reconciliación con período de gracia.** Si user-service se cae entre pasos, o el `DELETE` de compensación falla, quedan `PENDING` huérfanos. Un barrido **solo en user-service** (fuente de verdad) busca usuarios `PENDING` más antiguos que el período de gracia (configurable, mayor que el presupuesto de 10 s del alta), llama `DELETE /internal/credentials/{userId}` y, solo cuando se confirma, los elimina. Sin dependencia inversa auth→user y sin carrera con altas en vuelo.

**auth-service nunca borra credenciales automáticamente.** Las credenciales `PENDING` solo se activan con `user.created` y solo se eliminan por el `DELETE` de compensación de user-service o por `user.deleted`. Un barrido propio de auth por antigüedad = **Evolución**: podría borrar credenciales de un usuario ya `ACTIVE` si el evento se demora (broker caído o DLQ), porque la contraseña inicial no se guarda en otro sitio.

**Orden por `aggregateVersion`.** Los eventos pueden llegar fuera de orden tras reintentos. Los consumidores de proyección ignoran cualquier evento con `aggregateVersion` menor o igual que la última versión almacenada del mismo agregado (`user_last_version` por usuario; `last_version` por rol en `role_names_projection`): un `user.updated(DISABLED)` posterior no se deshace con un `user.created` retrasado.

**Otras garantías**: unicidad de email decidida por user-service (`users.email unique`); un `409` de auth dispara compensación; la contraseña inicial viaja en claro solo por el canal interno con JWT de servicio (`aud: auth-service`, `scope: svc:internal`) y nunca se loguea ni se persiste fuera de auth (hash argon2id).

## Reintentos y DLQ

Cada cola principal (`audit.events`, `auth.user-projection`, `agent.ingest`) tiene `<cola>.retry` y `<cola>.dlq`, enlazadas a `toka.events.dlx`.

1. El consumidor falla con un error transitorio y rechaza el mensaje (sin reencolado directo).
2. El mensaje va a `<cola>.retry` con TTL según `x-retry-count` (por defecto 5 s, 30 s y 2 min; configurables); al expirar, el DLX lo devuelve a la cola principal.
3. El contador viaja en la cabecera `x-retry-count`; se permiten hasta N reintentos (configurable, por defecto 3).
4. Agotados los reintentos, el mensaje pasa a `<cola>.dlq` con su causa en cabeceras y log (`correlationId`, `eventId`).
5. Los errores permanentes (esquema inválido) van directo a la DLQ sin reintentos.

Las colas de retardo rompen el orden: la idempotencia por `eventId` y el control por `aggregateVersion` lo compensan.

### Procedimiento de re-drive de la DLQ

1. Revisar los mensajes de `<cola>.dlq` (consola de gestión en el puerto `15672`) y localizar la causa por `correlationId` en los logs (`docker compose logs <servicio> | jq 'select(.correlationId=="<id>")'`).
2. Corregir la causa (bug, dependencia caída, dato inválido) y desplegar la corrección.
3. Mover los mensajes de vuelta a la cola principal (shovel o la función de mover mensajes de la consola de gestión), reiniciando `x-retry-count`.
4. Confirmar el consumo y que la DLQ queda vacía. La idempotencia por `eventId` hace seguro el re-drive aunque el mensaje ya se hubiese procesado parcialmente.
5. Para eventos de auth recuperados del log `audit.fallback`: extraer el sobre con `jq` y publicarlo en `toka.events`; audit lo deduplica por `eventId`.

## Referencias

- [ADR-003 — Autenticación JWT y política de `jwt-guard`](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md)
- [ADR-004 — Eventos asíncronos con RabbitMQ](../adrs/ADR-004-async-rabbitmq-events.md)
- [ADR-005 — REST síncrono y resiliencia](../adrs/ADR-005-sync-rest-resilience.md)
- [ADR-007 — Observabilidad (receta `jq`, `audit.fallback`)](../adrs/ADR-007-observability-quality-testing.md)
- [03 — Flujo de datos](03-flujo-de-datos.md)
