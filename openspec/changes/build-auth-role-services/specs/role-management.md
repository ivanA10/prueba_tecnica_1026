---
spec: role-management
change: build-auth-role-services
wave: 1,2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — role-management (`apps/role-service`)

Implementa lo que `docs/architecture/03-flujo-de-datos.md` (`## Gestión de roles y autorización`) y ADR-003/004 asignan a role-service.

## Wave 1 — CRUD, caché, RBAC y publicación

### ADDED Requirements

### Requirement: CRUD de roles con versión
`POST /roles`, `GET /roles`, `GET /roles/{id}` y `PUT /roles/{id}` SHALL gestionar roles `{name, description?, permissions[]}`. Cada rol SHALL tener `version` (entero, 1 al crear) que `PUT` incrementa en 1 de forma atómica; `GET /roles/{id}` SHALL devolver `{id, name, description, permissions, version}`. `name` SHALL ser único (409 si se repite); un id inexistente SHALL responder 404. Las entradas SHALL validarse con DTO (`name` no vacío, `permissions` arreglo de textos). `DELETE /roles/{id}` queda fuera de alcance (no existe `role.deleted` en el contrato de eventos).

#### Scenario: Crear y actualizar
- **WHEN** un admin crea un rol y luego lo actualiza
- **THEN** la creación devuelve `version=1` y la actualización `version=2`

#### Scenario: Nombre duplicado
- **WHEN** se crea o renombra un rol con un `name` existente
- **THEN** responde 409 sin modificar datos

### Requirement: RBAC por rol
Los endpoints SHALL protegerse con `JwtAuthGuard` de `@toka/jwt-guard` con `audience=['toka-api','role-service']` y JWKS de `AUTH_JWKS_URL`, más un `RolesGuard`/`@Roles(...)` propio en `interfaces/http`. Escritura (`POST`, `PUT`) y `GET /roles` SHALL exigir rol `admin`; `GET /roles/{id}` SHALL aceptar `admin` o `service`. Un rol insuficiente SHALL responder 403 (la traza `event=access.denied` la emite `RequestLoggingInterceptor` de `@toka/logger`).

#### Scenario: Acceso insuficiente
- **WHEN** un token sin rol `admin` intenta `POST /roles`
- **THEN** responde 403

#### Scenario: Lectura por servicio
- **WHEN** un token de servicio (`roles=['service']`, `aud=role-service`) llama `GET /roles/{id}`
- **THEN** responde 200 con el DTO del rol

### Requirement: Caché role:perm
`GET /roles/{id}` SHALL usar cache-aside en `role:perm:{roleId}` con TTL `ROLE_CACHE_TTL_SECONDS`; `PUT` SHALL invalidar la clave. Si Redis falla SHALL leerse de BD y registrarse `warn` sin fallar la petición.

#### Scenario: Cache hit
- **WHEN** se consulta dos veces el mismo rol sin modificarlo
- **THEN** la segunda lectura no consulta la base de datos

### Requirement: Publicación directa de eventos role
`POST` SHALL publicar `role.created` (`aggregateVersion=1`). `PUT` SHALL publicar `role.updated` con el snapshot `{roleId, name, description, permissions}` y, si cambió `permissions`, además `role.permissions.changed` con la misma `aggregateVersion` y distinto `eventId`. Los eventos SHALL publicarse tras confirmar la escritura, con `correlationId` de la petición y `actor={userId, roles}` del llamante. Un fallo de publicación SHALL registrarse (`event=role.publish.failed`) sin revertir ni fallar la operación.

#### Scenario: Cambio de permisos
- **WHEN** un `PUT` modifica `permissions`
- **THEN** se publican `role.updated` y `role.permissions.changed` con la misma `aggregateVersion`

## Wave 2 — Re-sincronización al arrancar

### ADDED Requirements

### Requirement: Re-sync del catálogo
Al arrancar (`OnApplicationBootstrap`, sin bloquear el arranque) role-service SHALL publicar `role.updated` por cada rol con `actor='system'`, `reason='resync'`, `aggregateVersion` = `version` del rol y `eventId` = `deterministicEventId(roleId, version)`. Si el broker no está disponible SHALL registrar `warn` y continuar.

#### Scenario: Eventos deterministas
- **WHEN** el servicio arranca dos veces sin cambios en los roles
- **THEN** publica los mismos `eventId` ambas veces, con `actor='system'` y `reason='resync'`

#### Scenario: Broker no disponible
- **WHEN** el broker rechaza la conexión durante el arranque
- **THEN** el servicio queda operativo y registra `warn`
