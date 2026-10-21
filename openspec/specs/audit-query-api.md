---
spec: audit-query-api
change: build-user-audit-services
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — API de consulta de auditoría (`apps/audit-service`)

> Spec canónica promovida desde el cambio archivado `build-user-audit-services`. Describe el comportamiento as-built, incluidos los filtros por prefijo y la autorización por permisos.

## Requirements

### Requirement: Consulta filtrada y paginada
`GET /audit/events` SHALL aceptar `actor` y `type` (texto ≤128), `from` y `to` (ISO-8601), `page` (≥1) y `limit` (1..100, 20 por defecto) y devolver `{items, page, limit, total}` ordenado por `occurredAt` descendente. `from > to`, una fecha no ISO-8601 o `limit > 100` SHALL responder 400.

#### Scenario: Rango de fechas
- **WHEN** se consulta `?from=...&to=...`
- **THEN** solo se devuelven eventos con `occurredAt` dentro del rango

#### Scenario: Parámetros inválidos
- **WHEN** `limit=101`, `from>to` o una fecha no es ISO-8601
- **THEN** responde 400

### Requirement: Filtros por prefijo escapado
`type` y `actor` SHALL recortarse y aplicarse como prefijo anclado (`^`), sin distinguir mayúsculas, con los metacaracteres de expresión regular escapados; un valor vacío tras recortar SHALL ignorarse. Un `actor` que sea prefijo de `system` SHALL devolver también los eventos de sistema (`actorIsSystem`).

#### Scenario: Prefijo de tipo
- **WHEN** se consulta `?type=user`
- **THEN** se devuelven `user.created`, `user.updated`, `user.deleted` y `user.role.assigned`

#### Scenario: Metacaracteres
- **WHEN** se consulta `?type=user.*`
- **THEN** el valor se busca literalmente (`^user\.\*`) y no como expresión regular

#### Scenario: Eventos de sistema
- **WHEN** se consulta `?actor=sys`
- **THEN** se devuelven los eventos con actor de sistema, o una lista vacía, sin error

### Requirement: Autorización y disponibilidad
El endpoint SHALL exigir `JwtAuthGuard` + `PermissionsGuard` con `audit:read` (403 en otro caso). Si la consulta a Mongo falla SHALL responder 503. `GET /health` SHALL responder 200 y `GET /ready` SHALL responder 503 si Mongo o el consumidor no están conectados.

#### Scenario: Sin permiso
- **WHEN** un token válido sin `audit:read` consulta la auditoría
- **THEN** responde 403
