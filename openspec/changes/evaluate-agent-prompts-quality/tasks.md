# Tareas — evaluate-agent-prompts-quality

Precondición global: el cambio 7 (`build-ai-agent-rag-service`) ha creado `apps/ai-agent-service/` (supuestos A1–A5 en `design.md`). Total: 7 tareas, 2 waves (4 + 3). Presupuesto de pruebas: 16 (ver `design.md` → Testing strategy). Ningún gate ejecuta `pnpm install`.

## Wave 0 — Prompts, dataset, validadores y métricas

- [ ] 1.1 Plantillas de prompt versionadas (system + few-shot) con defensa contra injection
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/prompt-templates.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R04, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `src/prompts/{system.v1.ts,fewshot.v1.ts,index.ts}` exportan `PROMPT_VERSION` y `buildMessages` que devuelve `{system, messages}` compatible con la petición de `generate(req)` del puerto `src/application/ports/llm-provider.port.ts`; los few-shot usan la forma `AgentAnswer` de `src/domain/agent-answer.ts` (`sources`); delimitadores neutralizados; 3 pruebas; sin IDs de modelo ni precios.
  - **Verification gate:** cmd:pnpm --filter ai-agent-service exec jest --coverage=false src/prompts
  - **mockup_ref:** n/a

- [ ] 1.2 Dataset de evaluación (>=10 casos) y cargador validado
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R07, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `src/evaluation/dataset.json` con >=10 casos (>=2 `injection`, >=2 `out_of_context`) y `dataset.ts` que valida forma; 2 pruebas (dataset válido, caso inválido rechazado).
  - **Verification gate:** cmd:pnpm --filter ai-agent-service exec jest --coverage=false src/evaluation/dataset
  - **mockup_ref:** n/a

- [ ] 1.3 Validadores de calidad (schema, grounding, refusal, injection)
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R07, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** none (importa el esquema de `src/domain/agent-answer.ts`, cambio 7)
  - **Definition of done:** `src/evaluation/validators/*.ts` puros con `index.ts`; `schema` reutiliza el esquema del cambio 7 (no define uno propio); grounding sobre `sources`; 5 pruebas (schema inválido, fuente inexistente, rechazo esperado/no esperado, inyección obedecida, caso feliz).
  - **Verification gate:** cmd:pnpm --filter ai-agent-service exec jest --coverage=false src/evaluation/validators
  - **mockup_ref:** n/a

- [ ] 1.4 Métricas de latencia (p50/p95) y coste vía utilidad del cambio 7
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R05, EX5-R06, EX5-R24
  - **Owner profile:** backend
  - **Dependencies:** none (importa `src/infrastructure/llm/cost.ts`, cambio 7)
  - **Definition of done:** `src/evaluation/metrics.ts` con percentiles p50/p95 y agregación de tokens; el coste se obtiene importando la utilidad de `src/infrastructure/llm/cost.ts` (no se reimplementa; `null` -> `n/d`); 2 pruebas (p50/p95, lista vacía). Sin precios en el repo.
  - **Verification gate:** cmd:pnpm --filter ai-agent-service exec jest --coverage=false src/evaluation/metrics
  - **mockup_ref:** n/a

## Wave 1 — Runner, reporte y documentación

- [ ] 2.1 Runner, generador de reporte y script `eval` (mock por defecto)
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R05, EX5-R06, EX5-R07, EX5-R16, EX5-R22
  - **Owner profile:** backend
  - **Dependencies:** 1.1, 1.2, 1.3, 1.4 (y cambio 7: `LlmProvider` + mock que emite JSON `AgentAnswer`)
  - **Definition of done:** `src/evaluation/{runner.ts,report.ts,cli.ts}`; script `eval` en `apps/ai-agent-service/package.json`; `docs/eval/report.md` con p50/p95, tokens, coste/`n/d`, tasas y tabla por caso; `EVAL_STRICT=1` aplica umbrales; 4 pruebas (runner con proveedor fake, reporte con secciones, sin key usa mock, strict falla bajo umbral).
  - **Verification gate:** cmd:pnpm --filter ai-agent-service exec jest --coverage=false src/evaluation/runner && env -u ANTHROPIC_API_KEY pnpm --filter ai-agent-service eval && test -s docs/eval/report.md && grep -q "p95" docs/eval/report.md
  - **mockup_ref:** n/a

- [ ] 2.2 Documento `docs/prompt-engineering.md`
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/agent-docs-demo.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R04, EX5-R15, EX5-R21, EX5-R24
  - **Owner profile:** backend
  - **Dependencies:** 1.1 (alcance de escritura: `docs/**`)
  - **Definition of done:** secciones system prompt, few-shot, chain-of-thought (trade-off), defensa contra injection, versionado, evaluación (enlaza a `docs/eval/report.md`) y `## Optimización de tokens`; en español; sin precios ni IDs de modelo.
  - **Verification gate:** cmd:test -s docs/prompt-engineering.md && grep -q "## Optimización de tokens" docs/prompt-engineering.md && ! grep -Eiq 'claude-[a-z0-9.-]+|[$][0-9]+' docs/prompt-engineering.md
  - **mockup_ref:** n/a

- [ ] 2.3 Actualizar trazabilidad y verificación final del cambio
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/agent-docs-demo.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R04, EX5-R05, EX5-R06, EX5-R07, EX5-R15, EX5-R16, EX5-R21, EX5-R22, EX5-R24, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** 2.1, 2.2
  - **Definition of done:** filas EX5-R04..R07, R15, R16, R21, R22, R24, R25 en `docs/traceability.md` con estado y rutas reales (R17 queda con `document-diagnosis-delivery`); suite del paquete en verde.
  - **Verification gate:** opsx:verify evaluate-agent-prompts-quality
  - **mockup_ref:** n/a

## Nota de traspaso al cambio 9 (`document-diagnosis-delivery`, tarea 3.2)

Este cambio NO crea `scripts/agent-demo.sh` ni `docs/agent-example.md`. Para el cambio 9: el script debe imprimir `tokensIn`, `tokensOut` y `latencyMs`, funcionar con mock sin key, y el documento debe incluir `## Integración con el sistema existente` enlazando a `docs/architecture/08-integracion-ia-rag.md`. Puede apoyarse en `pnpm --filter ai-agent-service eval` y `docs/eval/report.md`.
