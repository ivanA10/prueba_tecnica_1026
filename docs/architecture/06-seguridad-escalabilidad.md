# 06 — Seguridad y escalabilidad

Este documento resume los controles de seguridad de diseño y la estrategia de escalado de la plataforma. Decisiones de fondo: [ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md), [ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md), [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md), [ADR-005](../adrs/ADR-005-sync-rest-resilience.md), [ADR-008](../adrs/ADR-008-llm-provider-port.md) y [ADR-010](../adrs/ADR-010-frontend-react-rtk-nginx-gateway.md). La topología de red y el compose están en [04-docker-compose-diseno.md](04-docker-compose-diseno.md).

## Autenticación y autorización

- **Tokens de usuario**: JWT firmado con **RS256**, emitido solo por `auth-service`. Cabecera con `kid`; claims `sub`, `roles[]`, `jti`, `iat`, `exp`, `iss` y `aud` (`toka-api`). Vida corta del access token (configurable, ≤15 min).
- **Validación distribuida**: cada servicio valida firma, `aud` y `exp` localmente con la clave pública del JWKS (`GET /.well-known/jwks.json`, cacheado por servicio) mediante la librería `jwt-guard`. Además consulta en Redis (solo lectura) el denylist por token `auth:deny:jti:*` y la revocación por usuario `auth:deny:user:{userId}`.
- **Generación de la clave RSA y `kid`**: el script de bootstrap genera el par RSA al preparar el entorno; la privada se monta como secreto de Docker (nunca en git ni en la imagen) y la pública se publica en el JWKS con un `kid` configurable (`JWT_KID`). Hay **una sola clave activa**. La rotación con clave actual + previa y el discovery OIDC son **Evolución**.
- **RBAC por rol**: el claim de rol procede de `user_roles_projection` en auth-service (`user_id`, `role_id`, `user_last_version`) más `role_names_projection(role_id, role_name, last_version)`; el nombre del rol se resuelve por join al emitir el token y `role.updated` solo lo actualiza si su versión es mayor). Los permisos de role-service son informativos (evolución a claim `permissions[]`).
- **Tokens de servicio**: cada servicio tiene `client_id/client_secret` en su propio `infra/env/<servicio>.env` y obtiene tokens con `client_credentials` vía `POST /oauth/token`, **solo en la red interna** (nginx no enruta `/oauth/*`). El `aud` es el servicio destino y los endpoints `/internal/*` exigen `scope: svc:internal`.
- **Refresh**: token opaco con rotación por `family_id`; único camino `POST /auth/refresh`. Se entrega en cookie `HttpOnly; SameSite=Strict; Path=/api/auth`. El access token vive solo en memoria del cliente (nunca en `localStorage`).
- **Cookie `Secure` configurable**: `COOKIE_SECURE=true` por defecto; se puede desactivar para desarrollo local en HTTP. El README de ejecución indica acceder por `localhost` (los navegadores tratan `localhost` como contexto seguro y aceptan la cookie `Secure`).
- **Revocación**: dos claves de Redis, escritas solo por auth-service y leídas por `jwt-guard` en solo lectura.
  - `auth:deny:jti:{jti}`: logout y detección de reutilización de refresh, con TTL igual a la vida restante del token.
  - `auth:deny:user:{userId}` = marca de tiempo: al consumir `user.updated(DISABLED)` o el borrado, auth-service la escribe con TTL igual a la vida máxima del access token; `jwt-guard` rechaza los tokens con `iat` anterior a esa marca. Es efectiva tras la propagación del evento (normalmente segundos), no al instante.
  - Ambas claves forman la excepción de lectura cruzada de Redis (ADR-002/ADR-003): auth escribe, el resto solo lee.
  - Si Redis no responde, `jwt-guard` falla abierto **solo en el denylist** (log `warn` y métrica; firma, `aud` y `exp` se siguen validando), acotado por la vida corta del access token (ADR-003).

## Hashing de contraseñas

- Algoritmo único: **argon2id**, aplicado **solo en `auth-service`**. Ningún otro servicio hashea ni almacena contraseñas.
- En el alta, user-service envía la contraseña inicial en claro únicamente por `PUT /internal/credentials/{userId}` (red interna, JWT de servicio); no se persiste en user-service ni se escribe en logs (los serializadores de pino redactan `password`).
- Los parámetros de costo (memoria, iteraciones, paralelismo) son configurables por variables de entorno y se calibran en `build-auth-role-services`.

## Gestión de secretos

| Secreto | Mecanismo | Regla |
|---|---|---|
| Clave privada RSA | Secreto de Docker (`secrets:`) montado en `/run/secrets` | Generada por bootstrap; fuera de git y de las imágenes |
| Contraseñas de BD (un rol por base) | `.env` raíz (solo la lee el contenedor de la base) y `infra/env/<servicio>.env` (solo la URL del propio servicio) | Ambos en `.gitignore`; solo plantillas `.example` con placeholders. Ningún servicio recibe el `.env` completo |
| `client_secret` de servicios | `infra/env/<servicio>.env` | Uno por servicio y solo en su archivo; rotables cambiando el valor |
| Contraseña de Redis | `.env` raíz (`REDIS_PASSWORD`, `requirepass`) y `REDIS_URL` de cada servicio | Evita que un contenedor de la red `backend` escriba en el denylist; ACL por usuario = Evolución |
| Credenciales de RabbitMQ | `.env` raíz y `RABBITMQ_URL` de cada servicio | Usuario dedicado de aplicación |
| `ANTHROPIC_API_KEY` | `infra/env/ai-agent-service.env` | Opcional; sin clave se usa el proveedor `mock`; solo el agente la recibe |

Los logs no incluyen secretos ni contraseñas; el gate de la entrega no admite valores reales en el repositorio. Gestor de secretos externo = Evolución.

## OWASP

Mapa de riesgos relevantes con el control de diseño y el servicio responsable (referencia: OWASP Top 10 y OWASP Top 10 para LLM).

| Riesgo | Control de diseño | Servicio responsable |
|---|---|---|
| Inyección (SQL/NoSQL) | DTO validados con `class-validator` (`whitelist`, `forbidNonWhitelisted`); Prisma con consultas parametrizadas; Mongoose con esquema tipado y saneamiento de operadores (`$`) en filtros de `GET /audit/events` | user, role, auth (Prisma); audit (Mongoose) |
| Autenticación rota / fuerza bruta en login | `argon2id`; `limit_req` de nginx en `/api/auth/login`; contador `auth:rl:login:{ip}` en Redis; mensaje de error uniforme (sin enumeración de usuarios); credenciales `PENDING`/`DISABLED` rechazadas | `web` (nginx) y auth-service |
| Almacenamiento de tokens | Cookie `HttpOnly` + `SameSite=Strict` + `Path=/api/auth` para el refresh; access token solo en memoria; rotación y detección de reutilización | auth-service y `web` |
| Suplantación entre servicios / audiencia incorrecta | Validación de `aud` (`toka-api` para usuarios; nombre del servicio destino para tokens de servicio); `scope: svc:internal` en `/internal/*` | `jwt-guard` en todos los servicios |
| Control de acceso roto | RBAC por rol en cada servicio; denylist de `jti` y revocación por usuario (`auth:deny:user:*`); `/internal/*` y `/oauth/*` sin ruta en nginx; los 403 se registran con pino `event=access.denied` | todos (`jwt-guard`) |
| Confused deputy del agente | La herramienta REST del agente reenvía el JWT del llamante a user-service; el agente no tiene identidad privilegiada y user-service aplica RBAC sobre ese token | ai-agent-service y user-service |
| Prompt injection (OWASP LLM01) | Contenido recuperado y salida de herramientas tratados como datos no confiables (delimitados); salida validada contra esquema; herramientas de solo lectura; `max_tokens` acotado | ai-agent-service |
| Exposición de datos sensibles | Lista blanca de campos al LLM (`id`, `name`, `role`, `status`); sin hash ni email completo; RAG sobre documentos de conocimiento, no sobre PII | ai-agent-service |
| Configuración insegura | Solo `web` publicado al host; contenedores sin privilegios; redes separadas (`edge` y `backend` internas, sin salida a Internet; `public` solo para `web`; `egress` solo para el agente, que es el único servicio con salida); un archivo de entorno por servicio; Redis con `requirepass`; healthchecks; imágenes con etiqueta fijada | compose (04) |
| Consumo desmedido / DoS | `limit_req` en login; rate limit por usuario del agente (`agent:rl:{userId}:{route}`); límites de tamaño de cuerpo en nginx | `web` y ai-agent-service |
| Componentes vulnerables | Lockfile de pnpm; auditoría de dependencias en CI (`pnpm audit`) como práctica recomendada | monorepo |

## Rate limiting

- **Login**: `limit_req` de nginx sobre `/api/auth/login` (ráfaga pequeña por IP) como primera barrera, más contador por IP en Redis en auth-service.
- **Agente**: límite por usuario y ruta en Redis (`agent:rl:*`) y limitador de concurrencia hacia el proveedor LLM; los 429 del proveedor se manejan con reintentos del SDK (ADR-008).
- Los umbrales concretos son configurables y se fijan en `harden-compose-resilience-security`.

## Escalabilidad

- **Servicios sin estado**: ninguno guarda sesión en memoria; el estado vive en Postgres, Mongo, Redis y Qdrant. Los access tokens se validan localmente con JWKS, de modo que cualquier réplica atiende cualquier petición.
- **Escalado horizontal**: cada servicio puede replicarse detrás de nginx/DNS de Docker (`docker compose up --scale <servicio>=N`) retirando el nombre fijo de contenedor. Los healthchecks `/ready` alimentan al balanceo.
- **Particionado de colas**: las colas de RabbitMQ admiten varios consumidores competitivos (competing consumers); la idempotencia por `eventId` y el orden por `aggregateVersion` ([ADR-004](../adrs/ADR-004-async-rabbitmq-events.md)) hacen seguro escalar consumidores. Para preservar orden por agregado a mayor volumen, el diseño admite particionar por clave de agregado (cola por partición con hash de `aggregateId`) como evolución.
- **Caché**: `role:perm:{roleId}` (permisos), `<svc>:jwks` (JWKS) y denylists de revocación (`jti` y usuario) en Redis, siempre con TTL. El modelo de lectura de audit-service (CQRS ligero) evita consultas pesadas sobre el modelo de escritura.
- **Publicador de outbox**: en user-service, con varias réplicas se usan lecturas con bloqueo (`FOR UPDATE SKIP LOCKED`) para evitar doble publicación; los consumidores son idempotentes de todos modos.
- **Agente**: la generación depende del proveedor LLM (latencia y cuota); el escalado se limita por rate limit y concurrencia. Las embeddings locales (ONNX) son CPU-bound y escalan con réplicas.

### Límites conocidos del despliegue local

- Una instancia por almacén (Postgres, Mongo, Redis, RabbitMQ, Qdrant): sin alta disponibilidad ni réplicas.
- Un único nodo Docker: no hay escalado real entre máquinas ni autoescalado.
- Una sola clave de firma: la rotación sin interrupción requiere JWKS con clave actual + previa (**Evolución**).
- Con el perfil `observability`, Alloy monta el socket de Docker (acceso equivalente a root en el host): uso solo en desarrollo.
- Redis con una contraseña única (`requirepass`) y sin usuarios ACL: los prefijos por servicio son convención (**Evolución**).
- HTTP en local; TLS terminado en un proxy externo en un despliegue real (**Evolución**).
- Los eventos de auth se publican sin outbox: riesgo aceptado documentado en ADR-004 y [07-resiliencia.md](07-resiliencia.md).
