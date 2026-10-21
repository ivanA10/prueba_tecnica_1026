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
- **D4 Coste solo por env, reutilizando el cambio 7.** El coste se obtiene de `src/infrastructure/llm/cost.ts` (cambio 7), que lee `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK`. Si falta alguna: `null` y el reporte muestra `n/d`. Ningún precio ni ID de modelo en el repo.
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
`AgentAnswer` (salida del LLM, JSON): se IMPORTA de `src/domain/agent-answer.ts` (cambio 7): `{ answer, sources, ... }` con `refused` opcional; este cambio no define un esquema propio.
`CaseResult`: `{ id, latencyMs, tokensIn, tokensOut, schemaOk, groundingOk, refusalOk, injectionOk, pass }`.
`Summary`: `{ promptVersion, n, p50, p95, tokensInTotal, tokensOutTotal, costUsd|null, rates }`.

## Supuestos sobre el cambio 7 (rutas bajo `apps/ai-agent-service/`)

- A1 Existe el paquete `ai-agent-service` con `package.json` (esta tarea añade solo el script `eval`) y `tsconfig`.
- A2 Puerto `LlmProvider` en `src/application/ports/llm-provider.port.ts` con `generate(req)` (req con `system` + `messages`) que devuelve texto + `tokensIn`/`tokensOut` (+ `latencyMs` o medible por el runner) y un `MockLlmProvider` determinista en `src/infrastructure/llm/`.
- A3 Esquema `AgentAnswer` en `src/domain/agent-answer.ts` (`{answer, sources, ...}`, `refused` opcional); se importa tal cual.
- A4 Jest 30 en el paquete; subconjuntos con `pnpm --filter ai-agent-service exec jest --coverage=false <patrón>`. Ningún gate ejecuta `pnpm install`.
- A5 El mock emite JSON conforme a `AgentAnswer`.
- A6 Utilidad de coste en `src/infrastructure/llm/cost.ts`.

## Testing strategy

Presupuesto total: 16 pruebas (tope 30). Por tarea: 1.1 → 3, 1.2 → 2, 1.3 → 5, 1.4 → 2, 2.1 → 4. Unitarias con Jest del paquete (subconjuntos: `pnpm --filter ai-agent-service exec jest --coverage=false <patrón>`), sin red ni key. 2.2–2.3 sin pruebas nuevas (verificadas por `cmd:`). Sin snapshots del reporte; se aserta estructura (secciones y campos).

## Riesgos

- Reloj/latencia del mock no representa al proveedor real: el reporte etiqueta `provider` y advierte que los números del mock son de humo.
- Divergencia de rutas con el cambio 7: mitigada con A1–A5 y reconciliación en 2.1.
