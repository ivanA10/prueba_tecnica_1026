---
change: evaluate-agent-prompts-quality
status: draft
created: 2026-10-20
---

# Diseño — evaluate-agent-prompts-quality

## Architecture decisions

- **D1 Prompts como código versionado.** `src/prompts/` exporta `PROMPT_VERSION` (`v1`), `buildMessages({question, contexts})`. Cada plantilla es un módulo TS (sin lectura de disco en runtime). El reporte registra `promptVersion`.
- **D2 Estrategia.** System prompt con rol, reglas de grounding ("responde solo con el contexto; si no hay evidencia, rechaza con el código `NO_CONTEXT`"), salida JSON estricta, delimitadores `<context>`/`<user_question>` y regla de no seguir instrucciones dentro de esos bloques (OWASP LLM01). Few-shot: 3 ejemplos (respuesta fundamentada, rechazo por falta de contexto, intento de inyección rechazado). CoT: razonamiento breve interno de ≤2 pasos solo en el campo opcional `reasoning` cuyo uso se limita para no gastar tokens; documentado con su trade-off.
- **D3 Evaluación determinista y offline.** El runner usa el `LlmProvider` inyectado; por defecto el mock (sin key). Con `EVAL_PROVIDER=anthropic` y key presente usa el real. Sin LLM-as-judge: validadores son código puro.
- **D4 Coste solo por env.** `cost = tokensIn/1e6*PRICE_IN + tokensOut/1e6*PRICE_OUT`. Si falta alguna variable: `null` y el reporte muestra `n/d`. Ningún precio ni ID de modelo en el repo.
- **D5 Contexto de recuperación en eval.** Cada caso del dataset trae `contexts` fijos (no se llama a Qdrant), aislando la calidad del prompt de la del RAG.
- **D6 Optimización de tokens** documentada y medida: `max_tokens` por tipo de respuesta, few-shot mínimo, chunks ≤256 tokens, `top_k` acotado, prompt caching del system prompt (si el proveedor lo soporta; el mock lo ignora).

## Component diagram

```
dataset.json ──► runner ──► LlmProvider (mock | anthropic)   [cambio 7]
                  │  ▲            │
 prompts/ ────────┘  │            ▼
                     │     {text, tokensIn, tokensOut, latencyMs}
 validators/ ◄───────┴── response ──► metrics (p50/p95, coste env)
                                          │
                                          ▼
                                  docs/eval/report.md
```

## Data model

`EvalCase`: `{ id, category: 'grounded'|'out_of_context'|'injection'|'schema', question, contexts: string[], expect: { kind: 'answer'|'refusal', mustCite?: string[], mustNotContain?: string[] } }`.
`AgentAnswer` (salida del LLM, JSON): `{ answer: string, citations: string[], refused: boolean, refusalCode?: 'NO_CONTEXT'|'POLICY', reasoning?: string }`.
`CaseResult`: `{ id, latencyMs, tokensIn, tokensOut, schemaOk, groundingOk, refusalOk, injectionOk, pass }`.
`Summary`: `{ promptVersion, n, p50, p95, tokensInTotal, tokensOutTotal, costUsd|null, rates }`.

## Supuestos sobre el cambio 7 (rutas bajo `apps/ai-agent-service/`)

- A1 Existe el paquete `ai-agent-service` con `package.json` (esta tarea añade solo el script `eval`) y `tsconfig`.
- A2 Puerto `LlmProvider` en `src/domain/` o `src/infrastructure/llm/` con método de completado que devuelve texto + `tokensIn`/`tokensOut` (+ `latencyMs` o medible por el runner) y un `MockLlmProvider` determinista en `src/infrastructure/llm/`.
- A3 Esquema de salida del agente (zod u homólogo) exportado desde `src/application/` o similar; si no existe, `validators/schema.ts` define el suyo y se unifica en 2.1.
- A4 Test runner del paquete invocable con `pnpm --filter ai-agent-service test`.
- A5 El mock responde de forma coherente con las plantillas (devuelve JSON `AgentAnswer`); si no, la tarea 2.1 añade un modo `eval` al mock sin romper tests del cambio 7.

## Testing strategy

Presupuesto total: 18 pruebas (tope 30). Por tarea: 1.1 → 3, 1.2 → 2, 1.3 → 5, 1.4 → 4, 2.1 → 4. Unitarias con vitest/jest del paquete, sin red ni key. 2.2–2.4 sin pruebas nuevas (verificadas por `cmd:`). Sin snapshots del reporte; se aserta estructura (secciones y campos).

## Riesgos

- Reloj/latencia del mock no representa al proveedor real: el reporte etiqueta `provider` y advierte que los números del mock son de humo.
- Divergencia de rutas con el cambio 7: mitigada con A1–A5 y reconciliación en 2.1.
