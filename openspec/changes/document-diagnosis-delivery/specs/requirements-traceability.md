---
spec: requirements-traceability
change: document-diagnosis-delivery
wave: 2
epics: EP-DLV
status: draft
created: 2026-10-20
---

# Spec — requirements-traceability (delta final de entrega)

## ADDED Requirements

### Requirement: Estados finales verificados contra el disco
Al cerrar el último cambio, `docs/traceability.md` SHALL actualizar la columna Estado de cada fila: `Implementado` (artefacto de código existente), `Entregado` (documento o artefacto generado existente) o `Planeado` solo si la ruta del artefacto no existe (con nota explicativa). Ninguna fila de EX4 ni de los entregables de este cambio (`EX2-R18`, `EX2-R19`, `EX2-R20`, `EX3-R19`, `EX5-R17`, `EX0-R07`, `EX0-R08`, `EX0-R16`) SHALL permanecer `Planeado`.

#### Scenario: Ex4 entregado
- **WHEN** se listan las filas `| EX4-`
- **THEN** ninguna contiene `Planeado`

### Requirement: Sección de estado final de entrega
La matriz SHALL incluir `## Estado final de entrega` con el conteo de filas por estado y la lista de excepciones (filas aún `Planeado` con su motivo), y SHALL reflejar `docs/coverage.md` y `docs/coverage/` en las filas de cobertura.

#### Scenario: Sección presente
- **WHEN** se busca el encabezado `## Estado final de entrega`
- **THEN** existe y contiene una tabla de conteos

### Requirement: Invariantes de la matriz se conservan
La actualización SHALL conservar `## Cambios planeados` con los 9 nombres, al menos 8 filas por ejercicio, al menos 60 filas `EX1-`…`EX5-` y al menos 10 etiquetas `[RIESGO]`.

#### Scenario: Sin pérdida de filas
- **WHEN** se ejecutan los conteos de `design-architecture-docs` sobre el documento final
- **THEN** todos se cumplen
