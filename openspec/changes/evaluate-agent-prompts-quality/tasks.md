# Tareas — evaluate-agent-prompts-quality

Precondición global: el cambio 7 (`build-ai-agent-rag-service`) ha creado `apps/ai-agent-service/` (supuestos A1–A5 en `design.md`). Total: 8 tareas, 2 waves (4 + 4). Presupuesto de pruebas: 18 (ver `design.md` → Testing strategy).

## Wave 0 — Prompts, dataset, validadores y métricas

- [ ] 1.1 Plantillas de prompt versionadas (system + few-shot) con defensa contra injection
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/prompt-templates.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R04, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `src/prompts/{system.v1.ts,fewshot.v1.ts,index.ts}` exportan `PROMPT_VERSION` y `buildMessages`; delimitadores neutralizados; 3 pruebas (construcción, delimitador incrustado, contexto vacío); sin IDs de modelo ni precios.
  - **Verification gate:** cmd:pnpm --filter ai-agent-service test -- src/prompts
  - **mockup_ref:** n/a

- [ ] 1.2 Dataset de evaluación (≥10 casos) y cargador validado
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R07, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `src/evaluation/dataset.json` con ≥10 casos (≥2 `injection`, ≥2 `out_of_context`) y `dataset.ts` que valida forma; 2 pruebas (dataset válido, caso inválido rechazado).
  - **Verification gate:** cmd:pnpm --filter ai-agent-service test -- src/evaluation/dataset
  - **mockup_ref:** n/a

- [ ] 1.3 Validadores de calidad (schema, grounding, refusal, injection)
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R07, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `src/evaluation/validators/*.ts` puros con `index.ts`; 5 pruebas (schema inválido, cita inexistente, rechazo esperado/no esperado, inyección obedecida, caso feliz).
  - **Verification gate:** cmd:pnpm --filter ai-agent-service test -- src/evaluation/validators
  - **mockup_ref:** n/a

- [ ] 1.4 Métricas de latencia y coste de tokens desde variables de entorno
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R05, EX5-R06, EX5-R24
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `src/evaluation/metrics.ts` con percentiles p50/p95 y `computeCost` leyendo `LLM_PRICE_INPUT_PER_MTOK`/`LLM_PRICE_OUTPUT_PER_MTOK`; `null` si faltan; 4 pruebas (p50/p95, lista vacía, coste con precios, coste sin precios). Sin valores de precio en el repo.
  - **Verification gate:** cmd:pnpm --filter ai-agent-service test -- src/evaluation/metrics
  - **mockup_ref:** n/a

## Wave 1 — Runner, reporte y documentación

- [ ] 2.1 Runner, generador de reporte y script `eval` (mock por defecto)
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/evaluation-harness.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R05, EX5-R06, EX5-R07, EX5-R16, EX5-R22
  - **Owner profile:** backend
  - **Dependencies:** 1.1, 1.2, 1.3, 1.4 (y cambio 7: `LlmProvider` + mock, supuestos A2/A3/A5)
  - **Definition of done:** `src/evaluation/{runner.ts,report.ts,cli.ts}`; script `eval` en `apps/ai-agent-service/package.json`; reconcilia rutas con el cambio 7 (esquema único, modo eval del mock si hace falta); `docs/eval/report.md` generado con p50/p95, tokens, coste/`n/d`, tasas y tabla por caso; `EVAL_STRICT=1` aplica umbrales; 4 pruebas (runner con proveedor fake, reporte contiene secciones, sin key usa mock, strict falla bajo umbral).
  - **Verification gate:** cmd:pnpm --filter ai-agent-service test -- src/evaluation/runner && env -u ANTHROPIC_API_KEY pnpm --filter ai-agent-service eval && test -s docs/eval/report.md && grep -q "p95" docs/eval/report.md
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

- [ ] 2.3 Ejemplo ejecutable `scripts/agent-demo.sh` y `docs/agent-example.md` con explicación de integración
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/agent-docs-demo.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R17, EX5-R18
  - **Owner profile:** backend
  - **Dependencies:** 2.1 (y cambio 7: endpoint de consulta del agente; ruta exacta se toma de su `design.md`)
  - **Definition of done:** script bash POSIX, `set -eu`, funciona con mock sin key, imprime respuesta, citas, `tokensIn`, `tokensOut`, `latencyMs`; `docs/agent-example.md` con comando, salida esperada y `## Integración con el sistema existente` enlazando a `docs/architecture/08-integracion-ia-rag.md`.
  - **Verification gate:** cmd:bash -n scripts/agent-demo.sh && env -u ANTHROPIC_API_KEY bash scripts/agent-demo.sh | grep -q "tokensIn" && grep -q "## Integración con el sistema existente" docs/agent-example.md
  - **mockup_ref:** n/a

- [ ] 2.4 Actualizar trazabilidad y verificación final del cambio
  - **Change:** evaluate-agent-prompts-quality
  - **Spec:** `openspec/changes/evaluate-agent-prompts-quality/specs/agent-docs-demo.md`
  - **Spec wave slice:** n/a
  - **Stories:** EX5-R04, EX5-R05, EX5-R06, EX5-R07, EX5-R15, EX5-R16, EX5-R17, EX5-R21, EX5-R22, EX5-R24, EX5-R25
  - **Owner profile:** backend
  - **Dependencies:** 2.1, 2.2, 2.3
  - **Definition of done:** filas EX5-R04..R07, R15, R16, R21, R22, R24, R25 (y R17 reasignada o anotada) en `docs/traceability.md` con estado actualizado y rutas reales; suite del paquete en verde.
  - **Verification gate:** opsx:verify evaluate-agent-prompts-quality
  - **mockup_ref:** n/a
