---
spec: web-audit-agent
change: build-frontend-user-console
wave: 1
epics: EP-EX3
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — web-audit-agent

> Spec canónica promovida desde el cambio archivado `build-frontend-user-console`. Describe el comportamiento as-built, incluida la carga de conocimiento.

## Requirements

### Requirement: Visor de auditoría con filtros
La pantalla de auditoría SHALL consultar `GET /api/audit/events` con `type` y `actor` (con debounce de 300 ms; el backend los trata como prefijo), `from`, `to`, `page` y `limit`, y mostrar por evento el tipo, el actor (`system` resaltado; ids largos abreviados), la fecha y el `correlationId`, con paginación Anterior/Siguiente, estado vacío, `Spinner` y `ErrorMessage`. SHALL ofrecer limpiar los filtros.

#### Scenario: Filtro aplicado
- **WHEN** el usuario escribe `user.created` en Tipo
- **THEN** la petición incluye `type=user.created` y se muestran los eventos devueltos

#### Scenario: Fallo de consulta
- **WHEN** la petición falla
- **THEN** se muestra `ErrorMessage`

### Requirement: Panel de chat con el agente
El panel SHALL enviar `POST /api/agent/ask` con `{question}` no vacía (validación local), añadir la pregunta al historial de la sesión de pantalla, deshabilitar el envío mientras espera y mostrar `answer` con sus fuentes (`docId`, `source`, `score`). Si `degraded=true` SHALL mostrar el aviso "Respuesta degradada: el modelo no estuvo disponible.". Ante error SHALL mostrar `ErrorMessage`; la pregunta permanece en el historial.

#### Scenario: Pregunta y respuesta
- **WHEN** el usuario envía una pregunta válida y el backend responde
- **THEN** se muestran la respuesta y las fuentes citadas

#### Scenario: Respuesta degradada
- **WHEN** el backend responde `degraded=true`
- **THEN** se muestra el aviso de respuesta degradada

### Requirement: Carga de conocimiento
Con `agent:ingest` la pantalla SHALL ofrecer un modo "Cargar conocimiento" que envía `POST /api/agent/ingest` con `{docId, source, roleScope, text}` validado con zod (`docId` ≤128, `source` ≤256, `text` ≤200 000; permite leer el texto desde un archivo) y notifica los fragmentos indexados. Sin ese permiso el selector de modo no se muestra.

#### Scenario: Sin permiso de ingesta
- **WHEN** un usuario sin `agent:ingest` abre `/agent`
- **THEN** no aparece el selector de modo

#### Scenario: Documento indexado
- **WHEN** un usuario con `agent:ingest` envía un documento válido
- **THEN** se notifica "Documento indexado: N fragmentos"
