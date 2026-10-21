---
change: evaluate-agent-prompts-quality
wave: 0-1
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Propuesta — evaluate-agent-prompts-quality

## Problema

El Ejercicio 5 exige documentar una estrategia de prompt engineering y entregar código de evaluación de respuestas (latencia, coste de tokens in/out, validación básica de calidad), además de un ejemplo de uso del agente integrado con los microservicios. `build-ai-agent-rag-service` (cambio 7) construye el servicio, pero sin prompts versionados ni evaluación medible no hay evidencia de calidad, coste ni resistencia a prompt injection (EX5-R04..R07, R15, R16, R21, R22, R24, R25).

## Solución

1. Plantillas de prompt versionadas (system + few-shot, con CoT acotado) en `apps/ai-agent-service/src/prompts/`.
2. Módulo de evaluación en `apps/ai-agent-service/src/evaluation/` con dataset (≥10 casos), validadores (esquema, grounding, rechazo, inyección), métricas (latencia p50/p95, tokens, coste desde env) y runner.
3. Comando `pnpm --filter ai-agent-service eval` que genera `docs/eval/report.md`; funciona sin API key con el proveedor mock.
4. Documentación: `docs/prompt-engineering.md` (con `## Optimización de tokens`) (el ejemplo ejecutable `scripts/agent-demo.sh` + `docs/agent-example.md` pertenece al cambio 9, tarea 3.2).

## Alcance

- Prompts versionados, dataset, validadores, métricas, runner, reporte.
- `docs/prompt-engineering.md`. Demo y `agent-example.md`: fuera (cambio 9; nota de traspaso en `tasks.md`).
- Actualización de filas EX5-* en `docs/traceability.md` (estado Planeado → Implementado al archivar).

## Fuera de alcance

- Construir el servicio, puerto `LlmProvider`, RAG, ingesta, cliente de user-service (cambio 7).
- `docs/architecture/08-integracion-ia-rag.md` (cambio 7; aquí solo se enlaza).
- Escribir identificadores de modelo o precios en código/docs: los precios llegan solo por `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK`.
- Evaluación con LLM-as-judge, adaptador OpenAI (Evolución).

## Criterios de éxito

- `pnpm --filter ai-agent-service eval` termina con exit 0 sin `ANTHROPIC_API_KEY` y escribe `docs/eval/report.md` con p50/p95, tokens in/out, coste y tasas de esquema/grounding/rechazo.
- Dataset ≥10 casos, incluye ≥2 de prompt injection y ≥2 fuera de contexto.
- Si faltan variables de precio, el reporte indica `coste: n/d` sin fallar.
- Pruebas (16) ≤30 en el cambio.

## Supuestos (dependencia del cambio 7)

Ver `design.md` → "Supuestos sobre el cambio 7". Si las rutas difieren, se reconcilian en la tarea 2.1 sin cambiar el contrato de esta propuesta.

## Nota de trazabilidad

EX5-R17 (`docs/agent-example.md`, `scripts/agent-demo.sh`) y R18 quedan en `document-diagnosis-delivery` / cambio 7 según la matriz; este cambio no los toca.
