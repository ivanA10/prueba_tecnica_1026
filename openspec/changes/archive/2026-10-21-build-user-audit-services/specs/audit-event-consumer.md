---
spec: audit-event-consumer
change: build-user-audit-services
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — Consumidor de auditoría (`apps/audit-service`)

Implementa `audit.events` de `03-flujo-de-datos.md` y "Reintentos y DLQ" de `07-resiliencia.md`. Decisiones: `design.md` D10–D14.

## Wave 0 — Persistencia

### Requirement: Colección append-only con índice único
`audit_events` SHALL tener índice único sobre `eventId` e índices de consulta (`occurredAt`, `type+occurredAt`, `actorUserId+occurredAt`). El repositorio SHALL NOT exponer actualización ni borrado.

#### Scenario: Esquema
- **WHEN** se inspecciona el esquema
- **THEN** `eventId` es único y existe el campo `actorUserId`

## Wave 1 — Consumidor

### Requirement: Inserción idempotente y mapeo
`ProcessAuditEvent` SHALL validar el sobre con `isEventEnvelope`, mapear `actor` (`{userId, roles}` o `system`) y insertar; una clave duplicada de `eventId` SHALL tratarse como éxito sin segundo documento.

#### Scenario: Evento duplicado
- **WHEN** llega dos veces el mismo `eventId`
- **THEN** existe un solo documento y ambos mensajes se confirman (`ack`)

### Requirement: Filtro de re-sync
Los eventos con `reason='resync'` SHALL NOT insertarse en `audit_events`; se confirman y se registran a nivel `debug` con su `eventId`.

#### Scenario: Re-sync de role-service
- **WHEN** llega `role.updated` con `reason=resync` y `actor=system`
- **THEN** no se inserta documento alguno

### Requirement: Reintentos y DLQ
El consumidor SHALL declarar `audit.events` (bindings `user.#`, `auth.#`, `role.#` de `QueueBindings`), `audit.events.retry` (TTL `AUDIT_RETRY_TTL_MS`, DLX de vuelta a la principal) y `audit.events.dlq`. Ante un fallo transitorio SHALL publicar una copia en `.retry` con `x-retry-count+1` y hacer `ack` del original; con `x-retry-count >= 3` (`AUDIT_MAX_RETRIES`) o error permanente (JSON o sobre inválido) SHALL enviar el mensaje a `.dlq` con `x-error` y `x-failed-at` y registrar `eventId`/`correlationId`.

#### Scenario: Fallo transitorio
- **WHEN** Mongo falla con `x-retry-count=0`
- **THEN** se publica una copia en `audit.events.retry` con `x-retry-count=1` y se confirma el original

#### Scenario: Reintentos agotados o mensaje inválido
- **WHEN** `x-retry-count=3` o el cuerpo no es un sobre válido
- **THEN** el mensaje llega a `audit.events.dlq` con su causa

## Wave 2 — Humo

### Requirement: Pipeline real de punta a punta
`scripts/smoke-audit-pipeline.sh` SHALL verificar contra RabbitMQ y Mongo reales: un evento válido produce 1 documento (también tras duplicarlo), un `resync` produce 0 y un cuerpo inválido deja >=1 mensaje en `audit.events.dlq`.

#### Scenario: Humo verde
- **WHEN** se ejecuta el script con la infraestructura de compose
- **THEN** termina en 0 y limpia sus contenedores
