---
spec: auth-credentials-projection
change: build-auth-role-services
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — auth-credentials-projection (`apps/auth-service`: canal interno y consumidor `auth.user-projection`)

Implementa lo que `docs/architecture/03-flujo-de-datos.md` y `07-resiliencia.md` asignan a auth: aprovisionamiento idempotente de credenciales y proyecciones con versión por agregado.

## ADDED Requirements

### Requirement: Aprovisionamiento idempotente de credenciales
`PUT /internal/credentials/{userId}` (cuerpo `{email, password, roleId, roleName?, roleVersion?}`) SHALL crear la credencial en estado `PENDING` con hash argon2id, sembrar `user_roles_projection` (`role_id`, `user_last_version=0`) y, si trae `roleName`/`roleVersion`, sembrar `role_names_projection` cuando falte la fila. Si el `email` ya pertenece a otro `userId`, SHALL responder 409 sin modificar datos. Repetir la llamada para el mismo `userId` SHALL ser idempotente (sin duplicados y sin degradar un estado `ACTIVE`/`DISABLED`). `DELETE /internal/credentials/{userId}` SHALL borrar la credencial y revocar sus refresh, y ser idempotente. Ambos SHALL exigir un token válido con rol `service`; en otro caso responden 403. Auth SHALL NOT borrar credenciales por ningún otro camino automático.

#### Scenario: Alta idempotente
- **WHEN** user-service llama dos veces `PUT /internal/credentials/{userId}` con el mismo cuerpo
- **THEN** existe una sola fila `PENDING` con proyección sembrada y ambas llamadas responden éxito

#### Scenario: Email de otro usuario
- **WHEN** `PUT /internal/credentials/{userId}` trae un `email` ya asociado a otro `userId`
- **THEN** responde 409 y no cambia nada

#### Scenario: Sin token de servicio
- **WHEN** un token de usuario (rol `admin`) llama a `PUT` o `DELETE /internal/credentials/{userId}`
- **THEN** responde 403 y no cambia nada

### Requirement: Consumidor de proyecciones con versión por agregado
Auth SHALL declarar la cola `auth.user-projection` con los bindings de `QueueBindings` (`user.#`, `role.updated`), `auth.user-projection.retry` y `auth.user-projection.dlq`, afirmando los exchanges con las constantes de `@toka/contracts`. Cada evento SHALL registrarse en `processed_events` en la misma transacción que el cambio de proyección (idempotencia por `eventId`). Eventos `user.*` SHALL aplicarse solo si `aggregateVersion > user_last_version`; `role.updated` solo si `aggregateVersion > last_version` del rol. Un evento con versión menor o igual SHALL ignorarse con `ack`.

Reglas por tipo: `user.created` activa la credencial si está `PENDING` **sin importar el orden de versión respecto de `user.role.assigned`** (nunca reactiva un `DISABLED`; la versión solo gobierna la proyección de rol); `user.updated` con `status=DISABLED` marca la credencial `DISABLED` e invoca `RevokeUserSessions`; `user.deleted` borra la credencial e invoca `RevokeUserSessions`; `user.role.assigned` actualiza `user_roles_projection` y siembra `role_names_projection` si falta; `role.updated` actualiza `role_name`.

#### Scenario: Evento viejo o repetido
- **WHEN** llega un evento con `aggregateVersion` ≤ la última versión almacenada del mismo agregado, o un `eventId` ya procesado
- **THEN** no se altera ninguna proyección y el mensaje se confirma (`ack`)

#### Scenario: Deshabilitación
- **WHEN** llega `user.updated` con `status=DISABLED` y versión mayor
- **THEN** la credencial pasa a `DISABLED`, se escribe `auth:deny:user:{userId}` y se revocan sus refresh

### Requirement: Reintentos con retardo y DLQ
Ante un error transitorio el consumidor SHALL reenviar el mensaje a `auth.user-projection.retry` con `x-retry-count` incrementado y expiración según `RETRY_DELAYS_MS` (por defecto 5 s, 30 s, 120 s), hasta `MAX_RETRIES` (por defecto 3); superado el máximo SHALL enviarlo a `auth.user-projection.dlq`. Un mensaje que no cumpla `isEventEnvelope`, de tipo desconocido o con campos obligatorios ausentes SHALL ir directo a la DLQ sin reintentos. El consumo SHALL NOT bloquear la validación de tokens.

#### Scenario: Esquema inválido
- **WHEN** llega un mensaje que no es un sobre válido
- **THEN** va directo a `auth.user-projection.dlq` sin reintentos

#### Scenario: Error transitorio
- **WHEN** el procesamiento lanza un error recuperable
- **THEN** el mensaje se publica en `.retry` con `x-retry-count` + 1 y, al superar `MAX_RETRIES`, en la DLQ
