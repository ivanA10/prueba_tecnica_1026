---
spec: agent-docs-demo
change: evaluate-agent-prompts-quality
wave: 1
epics: EP-EX5
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — agent-docs-demo

> Spec canónica promovida desde el cambio archivado `evaluate-agent-prompts-quality` (as-built, 2026-10-21).

El ejemplo ejecutable (`scripts/agent-demo.sh`, `docs/agent-example.md`) pertenece a `document-diagnosis-delivery` (tarea 3.2); ver nota de traspaso en `tasks.md`.

## Requirements

### Requirement: Documento de estrategia de prompts
`docs/prompt-engineering.md` SHALL describir system prompt, few-shot, uso acotado de chain-of-thought, defensa contra injection, versionado (`PROMPT_VERSION`), optimización de tokens (`## 5. Optimizacion de tokens y cache`) y evaluación (enlace a `docs/eval/report.md`). SHALL NOT incluir precios ni IDs de modelo.

#### Scenario: Secciones presentes
- **WHEN** se inspecciona el documento
- **THEN** contiene las secciones de system prompt, few-shot, chain-of-thought, injection, optimización de tokens y evaluación

## Evolución

- Filas EX5-R04..R07, R15, R16, R21, R22, R24 y R25 de `docs/traceability.md` en `Implementado` con rutas reales.
