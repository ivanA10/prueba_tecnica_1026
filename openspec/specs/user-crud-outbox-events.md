---
spec: user-crud-outbox-events
change: build-user-audit-services
wave: 0
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — CRUD de usuario y eventos por outbox (`apps/user-service`)

> Spec canónica promovida desde el cambio archivado `build-user-audit-services`. Describe el comportamiento as-built, con autorización por permisos.

## Requirements

### Requirement: Esquema de `user_db`
La BD SHALL contener `users` (email único, `status` `PENDING|ACTIVE|DISABLED`, `version`, índice `status+createdAt`) y `outbox_events` (`seq` autoincremental, `event_id` único, sobre JSON, `aggregate_version`, `published_at` nulo hasta publicar). El esquema SHALL NOT incluir columnas de contraseña.

#### Scenario: Sin datos de credenciales
- **WHEN** se inspecciona `prisma/schema.prisma`
- **THEN** no hay ninguna columna de contraseña ni hash

### Requirement: Eventos con `aggregateVersion`
Cada cambio SHALL escribir su evento en `outbox_events` en la misma transacción que el cambio, con `aggregateVersion` = versión resultante: `PATCH /users/{id}` → `user.updated`; `DELETE /users/{id}` → `user.deleted` (borrado duro); `PUT /users/{id}/role` → `user.role.assigned` con `{userId, roleId, roleName, roleVersion, rolePermissions}` tomados de `GET /roles/{id}`. Los payloads SHALL NOT contener contraseñas. Un email repetido en `PATCH` SHALL responder 409; un usuario inexistente, 404.

#### Scenario: Deshabilitar usuario
- **WHEN** se hace `PATCH` con `status=DISABLED`
- **THEN** la versión aumenta y se escribe `user.updated` con esa `aggregateVersion`

#### Scenario: Asignar rol inexistente
- **WHEN** `GET /roles/{id}` devuelve 404
- **THEN** responde 404 y no se escribe ningún evento

### Requirement: Publicador de outbox
`OutboxPublisher` SHALL leer cada `OUTBOX_POLL_MS` lotes ordenados por `seq` con `FOR UPDATE SKIP LOCKED`, publicar en `toka.events` (`persistent`, `messageId=eventId`, `x-correlation-id`) con confirmación del broker, marcar `published_at` tras confirmar y dejar la fila pendiente si el broker falla.

#### Scenario: Broker caído
- **WHEN** la publicación falla
- **THEN** la fila queda con `published_at` nulo y se reintenta en el siguiente ciclo

### Requirement: Clientes salientes resilientes
Las llamadas user→role (timeout `ROLE_TIMEOUT_MS` 2 s, 2 reintentos) y user→auth (timeout `AUTH_TIMEOUT_MS` 3 s, 3 reintentos) SHALL usar `@toka/http-client` con circuit breaker (5 fallos, 10 s) y un JWT de servicio obtenido por `client_credentials` y cacheado por audiencia hasta poco antes de `exp`. El `DELETE` de credenciales SHALL tratar 404 como éxito.

#### Scenario: Token de servicio en caché
- **WHEN** se hacen dos llamadas seguidas a la misma audiencia antes de `exp`
- **THEN** solo se solicita un token

### Requirement: Listado paginado
`GET /users` SHALL responder `{items, page, limit, total}` con items `{id, email, name, roleId, status}`; `limit` > 100 SHALL responder 400. `GET /users/{id}` devuelve el mismo formato de item.

#### Scenario: Listado
- **WHEN** se llama `GET /users?page=1&limit=20` con `users:read`
- **THEN** responde 200 con esa forma y cada item incluye `roleId`

### Requirement: Semilla del primer admin
Si `ADMIN_SEED_EMAIL` y `ADMIN_SEED_PASSWORD` están definidos, user-service SHALL crear al arrancar ese usuario con el rol `ADMIN_SEED_ROLE_ID` mediante la saga con `actor='system'`, sin bloquear el arranque y reintentando hasta 10 veces cada 3 s; SHALL omitirse si el email existe y SHALL NOT registrar la contraseña.

#### Scenario: Reinicio
- **WHEN** el email semilla ya existe
- **THEN** no se crea nada

### Requirement: Autorización y salud
Las rutas de usuarios SHALL exigir `JwtAuthGuard` + `PermissionsGuard`: lectura (`GET`) con `users:read`; escritura (`POST`, `PATCH`, `DELETE`, `PUT :id/role`) con `users:write`; 403 en otro caso. `GET /health` SHALL responder 200 y `GET /ready` SHALL responder 503 si Postgres o RabbitMQ no están disponibles.

#### Scenario: Permiso insuficiente
- **WHEN** un token válido sin `users:write` llama `POST /users`
- **THEN** responde 403
