---
spec: audit-event-consumer
change: build-user-audit-services
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — Consumidor de auditoría (`apps/audit-service`)

> Spec canónica promovida desde el cambio archivado `build-user-audit-services`. Describe el comportamiento as-built. Topología en `docs/architecture/03-flujo-de-datos.md` y `07-resiliencia.md`.

## Requirements

### Requirement: Colección append-only con índice único
`audit_events` SHALL tener índice único sobre `eventId` e índices `occurredAt`, `type+occurredAt` y `actorUserId+occurredAt`. El repositorio SHALL exponer solo `insert` y `query`.

#### Scenario: Esquema
- **WHEN** se inspecciona el esquema Mongoose
- **THEN** `eventId` es único y existen `actorUserId` y `actorIsSystem`

### Requirement: Inserción idempotente y mapeo
El procesador SHALL validar el sobre con `isEventEnvelope`, mapear `actor` (`{userId, roles}` → `actorUserId`, `actorRoles`; `'system'` → `actorIsSystem`) e insertar; un `eventId` duplicado (código 11000) SHALL tratarse como éxito.

#### Scenario: Evento duplicado
- **WHEN** llega dos veces el mismo `eventId`
- **THEN** existe un solo documento y ambos mensajes se confirman

### Requirement: Filtro de re-sync
Los eventos con `reason='resync'` SHALL NOT insertarse; se confirman y se registran a nivel `debug`.

#### Scenario: Re-sync de role-service
- **WHEN** llega `role.updated` con `reason=resync` y `actor=system`
- **THEN** no se inserta documento alguno

### Requirement: Reintentos y DLQ
El consumidor SHALL declarar `audit.events` (bindings `user.#`, `auth.#`, `role.#` de `QueueBindings`), `audit.events.retry` (`x-message-ttl` = `AUDIT_RETRY_TTL_MS`, 5000 por defecto, con retorno a la principal por `toka.events.dlx`) y `audit.events.dlq`, con `prefetch` y `ack` manual. Ante un fallo transitorio SHALL publicar una copia en `.retry` con `x-retry-count` + 1 y confirmar el original; con `x-retry-count` ≥ `AUDIT_MAX_RETRIES` (3) o error permanente (cuerpo no JSON o sobre inválido) SHALL enviar el mensaje a `.dlq` con `x-error` y `x-failed-at` y registrar `eventId`/`correlationId`.

#### Scenario: Fallo transitorio
- **WHEN** Mongo falla con `x-retry-count=0`
- **THEN** se publica una copia en `audit.events.retry` con `x-retry-count=1` y se confirma el original

#### Scenario: Reintentos agotados o mensaje inválido
- **WHEN** `x-retry-count=3` o el cuerpo no es un sobre válido
- **THEN** el mensaje llega a `audit.events.dlq` con su causa en `x-error`
