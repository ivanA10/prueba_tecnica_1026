---
spec: agent-docs-demo
change: evaluate-agent-prompts-quality
wave: 1
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — agent-docs-demo

## ADDED Requirements

### Requirement: Documento de estrategia de prompts
`docs/prompt-engineering.md` SHALL describir system prompt, few-shot, uso acotado de chain-of-thought, defensa contra injection, versionado, y una sección `## Optimización de tokens`. SHALL NOT incluir precios ni IDs de modelo.

#### Scenario: Secciones presentes
- **WHEN** se inspecciona el documento
- **THEN** contiene las secciones de system prompt, few-shot, chain-of-thought, injection y `## Optimización de tokens`

### Requirement: Ejemplo ejecutable
`scripts/agent-demo.sh` (bash POSIX) SHALL ejecutar un flujo de punta a punta (consulta al agente con JWT de un usuario, respuesta con citas) usando el mock cuando no hay API key, e imprimir tokens y latencia. `docs/agent-example.md` SHALL documentar el comando, la salida esperada y `## Integración con el sistema existente` enlazando a `docs/architecture/08-integracion-ia-rag.md`.

#### Scenario: Demo sin key
- **WHEN** se ejecuta `bash scripts/agent-demo.sh` sin `ANTHROPIC_API_KEY`
- **THEN** termina con exit 0 e imprime respuesta, citas, `tokensIn`, `tokensOut` y `latencyMs`
