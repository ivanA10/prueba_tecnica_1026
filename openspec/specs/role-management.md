---
spec: role-management
change: build-auth-role-services
wave: 1,2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — role-management (`apps/role-service`)

> Spec canónica promovida desde el cambio archivado `build-auth-role-services`. Describe el comportamiento as-built: autorización por permisos, catálogo de permisos validado y roles semilla.

## Requirements

### Requirement: CRUD de roles con versión
`POST /roles`, `GET /roles`, `GET /roles/{id}` y `PUT /roles/{id}` SHALL gestionar roles `{name, description?, permissions[]}` y devolver `{id, name, description, permissions, version}`. `version` SHALL ser 1 al crear e incrementarse en 1 en cada `PUT`. `PUT` SHALL aceptar `version` opcional y responder 409 `version_conflict` si no coincide. `name` SHALL ser único (409 `role_name_taken`); un id inexistente SHALL responder 404; un id que no sea UUID SHALL responder 400. Cada permiso SHALL pertenecer a `PERMISSIONS` de `@toka/contracts` o ser `*` (400 en otro caso). No existe `DELETE /roles/{id}` ni el evento `role.deleted`, por diseño.

#### Scenario: Crear y actualizar
- **WHEN** se crea un rol y luego se actualiza
- **THEN** la creación devuelve `version=1` y la actualización `version=2`

#### Scenario: Nombre duplicado
- **WHEN** se crea un rol con un `name` existente
- **THEN** responde 409

#### Scenario: Permiso desconocido
- **WHEN** el cuerpo trae `permissions: ['foo:bar']`
- **THEN** responde 400; con `['*']` se acepta

### Requirement: Autorización por permisos
Las rutas SHALL protegerse con `JwtAuthGuard` (`audience=['toka-api','role-service']`, JWKS de `AUTH_JWKS_URL`, `RedisDenylistReader`) y `PermissionsGuard`: `POST` y `PUT` exigen `roles:write`; `GET /roles` y `GET /roles/{id}` exigen `roles:read`; `GET /roles/{id}` admite además tokens de servicio (`@AllowServiceToken()`).

#### Scenario: Permiso insuficiente
- **WHEN** un token sin `roles:write` intenta `POST /roles`
- **THEN** responde 403

#### Scenario: Lectura por servicio
- **WHEN** un token de servicio (`roles=['service']`, `aud=role-service`) llama `GET /roles/{id}`
- **THEN** responde 200; el mismo token en `GET /roles` responde 403

### Requirement: Caché role:perm
`GET /roles/{id}` SHALL usar cache-aside en `role:perm:{roleId}` con TTL `ROLE_CACHE_TTL_SECONDS` (300 por defecto); `PUT` SHALL invalidar la clave. Si Redis falla SHALL leerse de BD y registrarse `warn` `role.cache.unavailable`.

#### Scenario: Cache hit
- **WHEN** se consulta dos veces el mismo rol sin modificarlo
- **THEN** la segunda lectura no consulta la base de datos

### Requirement: Publicación de eventos role
`POST` SHALL publicar `role.created`; `PUT` SHALL publicar `role.updated` con el snapshot del rol y, si cambiaron los permisos, además `role.permissions.changed` con la misma `aggregateVersion`. Los eventos llevan el `correlationId` de la petición y `actor={userId, roles}`. Un fallo de publicación SHALL reintentarse en memoria y, agotado, registrarse con `event=role.publish.failed` sin fallar la operación.

#### Scenario: Cambio de permisos
- **WHEN** un `PUT` modifica `permissions`
- **THEN** se publican `role.updated` y `role.permissions.changed` con la misma `aggregateVersion`

### Requirement: Roles semilla y re-sync al arrancar
Al arrancar, role-service SHALL crear si no existen `admin` (`['*']`), `operador` (`users:read`, `roles:read`, `audit:read`, `agent:ask`) y `auditor` (`audit:read`) con ids fijos (`ADMIN_ROLE_ID`, `OPERADOR_ROLE_ID`, `AUDITOR_ROLE_ID`), publicando `role.created` solo al crearlos; un nombre ya ocupado SHALL omitirse sin error. Después, sin bloquear el arranque, SHALL publicar `role.updated` por cada rol con `actor='system'`, `reason='resync'`, `aggregateVersion=version` y `eventId=deterministicEventId(roleId, version)`; un fallo SHALL registrarse con `warn`.

#### Scenario: Arranque repetido
- **WHEN** el servicio arranca con los roles semilla ya existentes
- **THEN** no los crea de nuevo y el re-sync publica los mismos `eventId` que en el arranque anterior
