---
spec: auth-credentials-projection
change: build-auth-role-services
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — auth-credentials-projection (`apps/auth-service`: canal interno y consumidor `auth.user-projection`)

> Spec canónica promovida desde el cambio archivado `build-auth-role-services`. Describe el comportamiento as-built, incluida la proyección de permisos (migración `0002_role_permissions`).

## Requirements

### Requirement: Aprovisionamiento idempotente de credenciales
`PUT /internal/credentials/{userId}` (cuerpo `{email, password, roleId, roleName?, roleVersion?, rolePermissions?}`) SHALL normalizar el email, crear la credencial en `PENDING` con hash argon2id (o conservar el hash si la contraseña coincide), conservar el estado de una credencial existente, sembrar `user_roles_projection` y, si trae `roleName`, sembrar o actualizar `role_names_projection` (nombre y permisos) cuando `roleVersion` ≥ la versión almacenada. Responde 201 al crear y 200 al repetir. Si el email pertenece a otro `userId` SHALL responder 409 `email_taken`. `DELETE /internal/credentials/{userId}` SHALL borrar la credencial y revocar sus refresh (204, idempotente). Ambos SHALL exigir un token válido con rol `service` (403 en otro caso). Auth SHALL NOT borrar credenciales por ningún camino automático propio.

#### Scenario: Alta idempotente
- **WHEN** user-service llama dos veces `PUT /internal/credentials/{userId}` con el mismo cuerpo
- **THEN** la primera responde 201, la segunda 200, y existe una sola credencial `PENDING`

#### Scenario: Email de otro usuario
- **WHEN** el `email` ya está asociado a otro `userId`
- **THEN** responde 409 y no cambia nada

#### Scenario: Sin token de servicio
- **WHEN** un token de usuario llama `PUT` o `DELETE /internal/credentials/{userId}`
- **THEN** responde 403

### Requirement: Consumidor de proyecciones con versión por agregado
Auth SHALL declarar `auth.user-projection` enlazada a `toka.events` con `QueueBindings['auth.user-projection']` más `role.created`, y afirmar los exchanges con las constantes de `@toka/contracts`. Un `eventId` ya registrado en `processed_events` SHALL ignorarse; tras aplicar un evento SHALL registrarse su `eventId`. Reglas por tipo:
- `user.created`: activa la credencial si está `PENDING` (sin importar el orden respecto de `user.role.assigned`; nunca reactiva un `DISABLED`); si la credencial aún no existe es un error transitorio.
- `user.updated`: se ignora si `aggregateVersion` ≤ `user_last_version`; con `status=DISABLED` deshabilita e invoca `revokeUserSessions`; con `status=ACTIVE` reactiva un `DISABLED`.
- `user.deleted`: borra la credencial e invoca `revokeUserSessions`.
- `user.role.assigned`: actualiza `user_roles_projection` si la versión es mayor y `role_names_projection` (nombre y `rolePermissions`) si `roleVersion` es mayor.
- `role.created` / `role.updated`: actualizan nombre y permisos del rol si `aggregateVersion` ≥ `last_version` (el re-sync con igual versión es idempotente).

#### Scenario: Deshabilitación
- **WHEN** llega `user.updated` con `status=DISABLED` y versión mayor
- **THEN** la credencial pasa a `DISABLED`, se escribe `auth:deny:user:{userId}` y se revocan sus refresh

#### Scenario: Evento viejo o repetido
- **WHEN** llega un `user.updated` con versión ≤ la almacenada, o un `eventId` ya procesado
- **THEN** no se altera ninguna proyección y el mensaje se confirma

#### Scenario: Permisos del rol actualizados
- **WHEN** llega `role.updated` con nuevos `permissions` y versión mayor
- **THEN** los siguientes tokens de los usuarios con ese rol llevan los permisos nuevos

### Requirement: Reintentos con retardo y DLQ
Ante un error transitorio el consumidor SHALL reenviar el mensaje a `auth.user-projection.retry` con `x-retry-count` + 1 y expiración según `RETRY_DELAYS_MS` (`5000,30000,120000` por defecto) hasta `MAX_RETRIES` (3); superado el máximo SHALL enviarlo a `auth.user-projection.dlq`. Un cuerpo que no sea JSON, un sobre inválido, un tipo desconocido o un campo obligatorio ausente SHALL ir directo a la DLQ. Si el broker no está disponible al arrancar, el adaptador SHALL reintentar en segundo plano (`warn` `amqp.unavailable`) sin bloquear el servicio.

#### Scenario: Sobre inválido
- **WHEN** llega un mensaje que no es un sobre válido
- **THEN** va directo a `auth.user-projection.dlq` sin reintentos

#### Scenario: Error transitorio
- **WHEN** el procesamiento falla de forma recuperable
- **THEN** el mensaje vuelve por `.retry` con `x-retry-count` creciente y, al superar `MAX_RETRIES`, termina en la DLQ
