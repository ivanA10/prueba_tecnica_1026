---
spec: user-crud-outbox-events
change: build-user-audit-services
wave: 0
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — CRUD de usuario y eventos por outbox (`apps/user-service`)

Cubre `PATCH/DELETE/PUT role`, el outbox transaccional y los eventos `user.*` de `03-flujo-de-datos.md`. Todas las rutas exigen `JwtAuthGuard` y rol `admin`.

## Wave 0 — Persistencia

### Requirement: Esquema de `user_db`
La BD SHALL contener `users` (email único, `version`, `status`) y `outbox_events` (`seq`, `eventId` único, `envelope` JSON, `published_at` nulo hasta publicar). El esquema SHALL NOT incluir columnas de contraseña.

#### Scenario: Migración reproducible
- **WHEN** se valida `schema.prisma` y existe la migración inicial
- **THEN** `prisma validate` termina en 0 y el SQL contiene `outbox_events` y `users_email_key`

## Wave 0 — Casos de uso

### Requirement: Eventos con `aggregateVersion`
Cada cambio de usuario SHALL escribir su evento en `outbox_events` en la misma operación transaccional que el cambio de estado, con `aggregateVersion = version` resultante: `PATCH` → `user.updated`; `DELETE` → `user.deleted` (borrado duro); `PUT /users/{id}/role` → `user.role.assigned` con `{userId, roleId, roleName, roleVersion}` obtenidos de `GET /roles/{id}`. Los payloads SHALL NOT contener contraseñas ni hashes.

#### Scenario: Deshabilitar usuario
- **WHEN** un admin hace `PATCH` con `status=DISABLED`
- **THEN** `version` aumenta en 1 y se escribe `user.updated` con `status=DISABLED` y esa `aggregateVersion`

#### Scenario: Asignar rol inexistente
- **WHEN** `GET /roles/{id}` devuelve 404
- **THEN** la respuesta es 404 y no se escribe ningún evento

## Wave 1 — Adaptadores

### Requirement: Publicador de outbox
`OutboxPublisher` SHALL leer lotes ordenados por `seq` con `FOR UPDATE SKIP LOCKED`, publicar en `toka.events` con confirmación (`persistent`, `messageId=eventId`, `x-correlation-id`), marcar `published_at` tras la confirmación y dejar la fila pendiente si el broker falla, reintentando en el siguiente ciclo.

#### Scenario: Broker caído
- **WHEN** la publicación falla
- **THEN** la fila queda con `published_at` nulo y se reintenta, sin perder el evento

### Requirement: Clientes salientes resilientes
Las llamadas user→role (timeout 2 s, 2 reintentos) y user→auth (timeout 3 s, 3 reintentos; `PUT`/`DELETE` idempotentes) SHALL usar `@toka/http-client` con JWT de servicio obtenido por `client_credentials` y cacheado hasta `exp`. El `DELETE` SHALL tratar 404 como éxito.

#### Scenario: Token de servicio en caché
- **WHEN** se hacen dos llamadas seguidas a la misma audiencia antes de `exp`
- **THEN** solo se solicita un token

### Requirement: Listado paginado
`GET /users` SHALL responder `{items, page, limit, total}` con items `{id, email, name, roleId, status}` (sin datos de credenciales).

#### Scenario: Listado
- **WHEN** un admin llama `GET /users?page=1&limit=20`
- **THEN** recibe 200 con esa forma y cada item incluye `roleId`

### Requirement: Semilla del primer admin
Si `ADMIN_SEED_EMAIL` y `ADMIN_SEED_PASSWORD` están definidos, user-service SHALL crear al arrancar ese usuario con rol `admin` mediante `CreateUser` con `actor=system`; SHALL ser idempotente (no hace nada si el email existe) y SHALL NOT registrar la contraseña.

#### Scenario: Primer arranque
- **WHEN** el email semilla no existe
- **THEN** se crea con `actor=system` y se emite `user.created`

#### Scenario: Reinicio
- **WHEN** el email semilla ya existe
- **THEN** no se crea nada

### Requirement: Autorización y salud
Las rutas de usuarios SHALL exigir rol `admin` (403 en otro caso) y el servicio SHALL exponer `GET /health` (liveness) y `GET /ready` (Postgres y broker).

#### Scenario: Rol insuficiente
- **WHEN** un token válido sin rol `admin` llama `POST /users`
- **THEN** la respuesta es 403
