---
spec: agent-docs-demo
change: evaluate-agent-prompts-quality
wave: 1
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — agent-docs-demo

El ejemplo ejecutable (`scripts/agent-demo.sh`, `docs/agent-example.md`) pertenece a `document-diagnosis-delivery` (tarea 3.2); ver nota de traspaso en `tasks.md`.

## ADDED Requirements

### Requirement: Documento de estrategia de prompts
`docs/prompt-engineering.md` SHALL describir system prompt, few-shot, uso acotado de chain-of-thought, defensa contra injection, versionado, y una sección `## Optimización de tokens`. SHALL NOT incluir precios ni IDs de modelo.

#### Scenario: Secciones presentes
- **WHEN** se inspecciona el documento
- **THEN** contiene las secciones de system prompt, few-shot, chain-of-thought, injection y `## Optimización de tokens`

### Requirement: Trazabilidad actualizada
`docs/traceability.md` SHALL reflejar el estado y las rutas reales de las filas EX5 que cubre este cambio.

#### Scenario: Filas actualizadas
- **WHEN** se archiva el cambio
- **THEN** EX5-R04..R07, R15, R16, R21, R22, R24 y R25 no figuran como "Planeado"
