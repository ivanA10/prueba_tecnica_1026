# Proposal — build-auth-role-services

> Change 3 de 9. Implementa `apps/auth-service` y `apps/role-service` (Ejercicio 2, implementación) sobre la plataforma de `bootstrap-monorepo-platform` (cambio 2, en implementación en paralelo). Contrato de arquitectura: `openspec/changes/archive/2026-10-20-design-architecture-docs/design.md` + `handoff.md` + ADR-002..007 (accepted) + `docs/architecture/03`, `06`, `07`.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (CLI `opsx` no disponible en el sub-agente; ver "Desviaciones declaradas" en design.md).

**En simple:** Al terminar este cambio existen los dos servicios que hacen funcionar la identidad del sistema. `auth-service` verifica contraseñas (argon2id), emite JWT RS256 firmados (con `kid` y `aud`), publica su clave pública en un endpoint JWKS, gestiona el refresh en cookie HttpOnly con rotación, el logout y la revocación inmediata de tokens (por `jti` y por usuario), entrega tokens de servicio a los demás servicios, aprovisiona credenciales por un canal interno y mantiene las proyecciones de rol a partir de eventos de RabbitMQ. `role-service` gestiona roles y permisos (con versión), los sirve a otros servicios con caché en Redis y publica eventos `role.*`, incluida una re-sincronización al arrancar. Ambos con capas Clean Architecture, Prisma, logs JSON, Dockerfile y cobertura ≥70 %.

## Esquema de identificadores

- Épica: `EP-EX2`. Las historias `US-EX2-01..08` pertenecen al cambio 2; este cambio reserva `US-EX2-09..16`.

| Historia | Descripción |
|---|---|
| US-EX2-09 | Login con argon2id, emisión de JWT RS256 (`kid`, `aud`, `iss`) y JWKS de una sola clave |
| US-EX2-10 | Refresh en cookie HttpOnly con rotación por familia, logout con denylist por `jti` y revocación por usuario |
| US-EX2-11 | `/oauth/token` (`client_credentials`) y canal interno `PUT/DELETE /internal/credentials/{userId}` idempotente |
| US-EX2-12 | Consumidor `auth.user-projection` (credenciales y proyecciones de rol con versión por agregado, reintentos y DLQ) y publicación `auth.login.*` con respaldo `audit.fallback` |
| US-EX2-13 | `role-service`: CRUD de roles con `version`, `GET /roles/{id}` con caché `role:perm:*`, RBAC por rol y publicación `role.*` |
| US-EX2-14 | Re-sincronización del catálogo de roles al arrancar (`actor=system`, `reason=resync`, `eventId` determinista) |
| US-EX2-15 | Persistencia Prisma por servicio (migraciones aplicables con el rol de servicio) y Dockerfile por servicio |
| US-EX2-16 | Verificación integral (cobertura ≥70 %, contrato `jwt-guard` ↔ tokens de auth) y trazabilidad |

## Problem

Sin `auth-service` nadie puede autenticarse ni obtener tokens de servicio, y sin `role-service` no existe el catálogo de roles que alimenta el claim de rol, la auditoría y el agente. Los cambios 4 (user/audit), 5 (compose) y 7 (agente) dependen del JWKS real, de `/oauth/token`, de `PUT /internal/credentials`, de `GET /roles/{id}` y de los eventos `role.*`/`auth.*` de este cambio.

## Solution

1. **`apps/auth-service` (puerto 3001)**: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /.well-known/jwks.json`, `POST /oauth/token` (solo red interna), `PUT|DELETE /internal/credentials/{userId}` (solo tokens de servicio), `GET /ready`. Consumidor de la cola `auth.user-projection` (bindings de `QueueBindings`), con `<cola>.retry` y `<cola>.dlq`. Publica `auth.login.succeeded|failed` directo con reintento en memoria y respaldo `event=audit.fallback` en log. Escribe `auth:deny:jti:{jti}` y `auth:deny:user:{userId}` (epoch en segundos).
2. **`apps/role-service` (puerto 3003)**: `POST /roles`, `GET /roles`, `GET /roles/{id}`, `PUT /roles/{id}`; RBAC por rol (`admin` para escritura; `admin` o `service` para lectura por id); caché `role:perm:{roleId}`; publica `role.created`, `role.updated`, `role.permissions.changed` directo; re-sync al arrancar.
3. **Transversal a ambos**: Clean Architecture (`domain`, `application`, `infrastructure`, `interfaces`) con puertos y dobles en pruebas; Prisma con base propia (`auth_db`, `role_db`) y migración inicial versionada; `@toka/logger`, `@toka/jwt-guard` y `@toka/contracts` del cambio 2; `Dockerfile` por servicio (contexto raíz del monorepo).
4. **RBAC**: `RolesGuard` y decorador `@Roles` viven en la capa `interfaces` de cada servicio (no en `packages/jwt-guard`, que el cambio 2 está construyendo; ver design D6).

## Scope

- `apps/auth-service/**`, `apps/role-service/**` (código, `prisma/`, `Dockerfile`, pruebas, config de Jest/TS/ESLint por servicio).
- `.gitignore` (adición de `apps/*/src/generated/`), `pnpm-lock.yaml` (única instalación, tarea 1.1).
- `docs/traceability.md` y nota de implementación en `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md` (tarea 3.5).

## Out of scope (recortes declarados; los hereda el cambio indicado)

- **Servicios `auth-service`/`role-service` en `docker-compose.yml`, `infra/env/*.env` nuevas variables, `depends_on`, secreto `jwt_private_key`**: cambio 5 (`harden-compose-resilience-security`). Aquí solo Dockerfile y migraciones verificables.
- **Rate limit de login** (`auth:rl:login:{ip}` y `limit_req` de nginx): cambio 5 (OWASP, EX2-R31). Aquí el login no limita intentos.
- **`DELETE /roles/{id}`**: el contrato de eventos (`RoutingKeys`) no define `role.deleted`; borrar roles sin evento dejaría proyecciones y agente desfasados. Se difiere a Evolución (decisión vetable en el 📋).
- **Seed del primer usuario administrador**: pertenece al cambio 4 (dueño de usuarios). Este cambio solo siembra el **rol** `admin` (idempotente, en role-service al arrancar, tarea 3.1). `SERVICE_CLIENTS` de auth debe aceptar el `SVC_CLIENT_ID/SECRET` de cada servicio (mismo valor en ambos `.env`): lo cablean `bootstrap-env.sh` y el cambio 5.
- **Rotación JWKS, discovery OIDC, ACL de Redis, outbox de auth, barrido de credenciales, `access.denied` por AMQP, claim `permissions[]`** (Evolución declarada en ADR-003/004).
- Pruebas de integración con Postgres/Redis/RabbitMQ reales (solo el smoke de migraciones de la tarea 3.3); las demás son unitarias/HTTP con dobles.
- Paquete compartido para el adaptador AMQP: se duplica un adaptador pequeño por servicio (design D7); promoverlo a paquete se evalúa en el cambio 4.

## Success criteria

1. `pnpm --filter "./apps/*" build && pnpm --filter "./apps/*" test && pnpm --filter "./apps/*" lint` termina con código 0 y cada servicio reporta ≥70 % de líneas.
2. Un token emitido por `auth-service` es aceptado por `JwtAuthGuard` de `@toka/jwt-guard` (firma, `aud`, `kid`) y rechazado tras escribir `auth:deny:user:{id}` con `iat` anterior (prueba de contrato).
3. El login rechaza credenciales `PENDING`/`DISABLED`/inexistentes con la misma respuesta; la reutilización de un refresh rotado revoca la familia.
4. `PUT /internal/credentials/{userId}` es idempotente por `userId`; sin token de servicio responde 403.
5. Un evento `user.*`/`role.updated` con `aggregateVersion` ≤ la última almacenada del mismo agregado no altera las proyecciones; `user.updated(DISABLED)` escribe `auth:deny:user`.
6. `PUT /roles/{id}` incrementa `version`, invalida `role:perm:{id}` y publica `role.updated` (más `role.permissions.changed` si cambiaron los permisos); el re-sync emite `actor=system`, `reason=resync` con `eventId` determinista.
7. Las migraciones iniciales se aplican con `auth_user`/`role_user` sobre sus bases (Postgres del cambio 2) y ambos Dockerfile construyen.
