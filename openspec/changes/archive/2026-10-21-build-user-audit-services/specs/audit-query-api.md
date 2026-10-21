---
spec: audit-query-api
change: build-user-audit-services
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — API de consulta de auditoría (`apps/audit-service`)

Implementa "Flujo: consulta de auditoría" de `03-flujo-de-datos.md`. Lee solo de `audit_db`; no depende de otros servicios en línea.

## ADDED Requirements

### Requirement: Consulta filtrada y paginada
`GET /audit/events` SHALL aceptar `actor`, `type`, `from`, `to` (ISO-8601), `page` (>=1) y `limit` (1..100, por defecto 20) y devolver `{items, page, limit, total}` ordenado por `occurredAt` descendente.

#### Scenario: Filtro por tipo y rango
- **WHEN** un admin consulta `?type=user.created&from=...&to=...`
- **THEN** recibe 200 con solo eventos de ese tipo dentro del rango

#### Scenario: Parámetros inválidos
- **WHEN** `limit>100`, `from>to` o una fecha no es ISO-8601
- **THEN** la respuesta es 400

### Requirement: RBAC y disponibilidad
El endpoint SHALL exigir `JwtAuthGuard` y rol `admin` (403 en otro caso). Si Mongo no responde SHALL devolver 503. El servicio SHALL exponer `GET /health` y `GET /ready` (Mongo y consumidor conectados).

#### Scenario: Sin rol admin
- **WHEN** un token válido sin rol `admin` consulta la auditoría
- **THEN** la respuesta es 403
