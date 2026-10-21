---
spec: web-audit-agent
change: build-frontend-user-console
wave: 1
epics: EP-EX3
status: draft
created: 2026-10-20
---

# Spec — web-audit-agent

## ADDED Requirements

### Requirement: Visor de auditoría con filtros
La pantalla de auditoría SHALL consultar `GET /api/audit/events` con los filtros `actor`, `type`, `from`, `to` y `page`, mostrar carga y error, y renderizar `type`, `actorUserId`, `occurredAt` y `correlationId` (clave de fila `eventId`) de cada evento.

#### Scenario: Filtro aplicado
- **WHEN** el usuario filtra por `type=user.created`
- **THEN** la petición incluye `type=user.created` y se muestran los eventos devueltos

#### Scenario: Fallo de consulta
- **WHEN** la petición falla
- **THEN** se muestra `ErrorMessage`

### Requirement: Panel de chat con el agente
El panel SHALL enviar `POST /api/agent/ask` con `{question}` (no vacía, máx. 1000 caracteres, validada), deshabilitar el envío y mostrar carga mientras espera, mostrar `answer` y las fuentes (`docId`, `source`, `score`; `meta` se ignora), y avisar cuando `degraded=true` ("respuesta basada solo en fragmentos"). Ante error SHALL mostrar `ErrorMessage` sin perder la pregunta.

#### Scenario: Pregunta y respuesta
- **WHEN** el usuario envía una pregunta válida y el backend responde
- **THEN** se muestra la respuesta del agente

#### Scenario: Respuesta degradada
- **WHEN** el backend responde `degraded=true`
- **THEN** se muestra el aviso de respuesta basada solo en fragmentos

#### Scenario: Error del agente
- **WHEN** la petición falla con 503
- **THEN** se muestra `ErrorMessage` y el campo conserva la pregunta
