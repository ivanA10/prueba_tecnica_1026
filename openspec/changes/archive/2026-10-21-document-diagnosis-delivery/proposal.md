# Proposal — document-diagnosis-delivery

> Change 9 de 9. Cubre el Ejercicio 4 (diagnóstico de incidente) y la documentación de entrega final: reporte de cobertura fusionado, `README.md` de ejecución del sistema, `apps/web/README.md`, ejemplo ejecutable del agente y cierre de `docs/traceability.md`. Solo documentación y un par de scripts auxiliares; **sin lógica de negocio**.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (CLI `opsx` no disponible en el sub-agente planner).

**En simple:** Este cambio produce la respuesta escrita del Ejercicio 4 (un incidente donde "los usuarios no pueden guardar registros, algunos servicios devuelven 500 y el agente de IA responde lento"), anclada en ESTE sistema: usa la matriz de fallos, los presupuestos de tiempo, los campos de log y la receta por `correlationId` ya diseñados. Además deja lista la entrega: un reporte de cobertura unificado de todos los servicios, el README principal con cómo ejecutar todo, el README del frontend, un ejemplo ejecutable del agente y la matriz PDF → artefacto con los estados finales. La respuesta del Ejercicio 4 no depende de código, así que se escribe primero (Wave 0); lo demás espera a que existan los cambios 3 a 8.

## Esquema de identificadores

- Épicas: `EP-EX4` (Ejercicio 4 — Diagnóstico) y `EP-DLV` (entrega final).

| Historia | Descripción |
|---|---|
| US-EX4-01 | Hipótesis priorizadas (base de datos, comunicación entre servicios, red, agentes IA) |
| US-EX4-02 | Plan de diagnóstico sistemático con logs estructurados, logs centralizados y herramientas de debugging |
| US-EX4-03 | Problemas específicos de microservicios: fallos en cascada, reintentos, DLQ |
| US-EX4-04 | Problemas específicos de agentes IA: latencia, costo de tokens, rate limits (429) |
| US-EX4-05 | Comunicación a stakeholders (plantilla y cadencia) |
| US-DLV-01 | Reporte de cobertura fusionado como artefacto (`docs/coverage.md`, `docs/coverage/`) |
| US-DLV-02 | `README.md` de ejecución del sistema completo y de trazabilidad |
| US-DLV-03 | `apps/web/README.md` de ejecución del frontend (documento separado) |
| US-DLV-04 | Ejemplo ejecutable del agente integrado con los microservicios |
| US-DLV-05 | Cierre de `docs/traceability.md` con estados finales |

## Problem

El PDF exige, además del código, entregables que se omiten con facilidad: la respuesta del Ejercicio 4 (con priorización de hipótesis, uso de logs centralizados, problemas de IA y comunicación a stakeholders), el reporte de cobertura como artefacto (no solo el umbral en CI), dos documentos de ejecución distintos (sistema y frontend), un ejemplo ejecutable del agente y una matriz que demuestre qué requisito del PDF cubre cada artefacto. Sin un cambio dedicado, esos entregables quedan dispersos o genéricos (un diagnóstico "de manual" que no refleja la arquitectura real).

## Solution

1. **`docs/diagnostico-ex4.md`** (Wave 0, independiente del código): respuesta del Ejercicio 4 usando las referencias exactas del sistema: matriz de fallos y presupuestos de `docs/architecture/07-resiliencia.md`, campos de log y receta `jq` por `correlationId` de ADR-007, perfil `observability` (Loki + Alloy + Grafana), manejo de 429 y presupuesto de 30 s de ADR-008, saga de alta de `docs/architecture/03-flujo-de-datos.md`. Incluye tabla de hipótesis priorizadas, plan por fases, receta de logs, sección de agentes IA y plantilla de comunicación a stakeholders.
2. **Reporte de cobertura fusionado** (Wave 1): `scripts/coverage-report.sh` ejecuta las pruebas (Jest ya emite `json-summary` y `lcov`, bootstrap D4), recoge el resumen de cada paquete y servicio (incluido `apps/web`), genera `docs/coverage/summary.json`, `docs/coverage/lcov.info` (fusionado) y `docs/coverage.md` (tabla legible), y falla si algún componente queda bajo el umbral de 70 % de líneas.
3. **Documentación de entrega** (Wave 2): `README.md` raíz (visión general, cómo ejecutar, enlaces, resumen de trazabilidad), `apps/web/README.md`, `docs/agent-example.md` + `scripts/agent-demo.sh` y actualización final de `docs/traceability.md`.

## Scope

- `docs/diagnostico-ex4.md`.
- `scripts/coverage-report.sh`, `docs/coverage.md`, `docs/coverage/` (artefactos generados y versionados).
- `README.md`, `apps/web/README.md`.
- `docs/agent-example.md`, `scripts/agent-demo.sh`.
- `docs/traceability.md` (estados finales + sección de estado de entrega).

## Out of scope

- Código de servicios, pruebas nuevas y cambios en configuración de Jest (el reporte consume lo que cambios 2–8 ya producen).
- Perfil `observability` y sus configuraciones (viven en `harden-compose-resilience-security`); el diagnóstico solo lo referencia y marca como opcional lo que no esté activado.
- Reproducir realmente el incidente: el Ejercicio 4 es analítico; no se inyectan fallos ni se mide latencia real. Cualquier número operativo del diagnóstico es ilustrativo y se marca como configurable.
- Valores de modelo LLM y precios (se citan solo las variables `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK`, sin valores).
- Evolución declarada en los ADRs (outbox de auth, `access.denied` por AMQP, rotación JWKS, etc.), citada como Evolución, no implementada.

## Success criteria

1. `docs/diagnostico-ex4.md` contiene una sección por cada viñeta del Ejercicio 4 (hipótesis, plan sistemático, logs centralizados, agentes IA, comunicación a stakeholders) y las menciona con elementos propios del sistema (`correlationId`, 429, circuit breaker, DLQ, `audit.fallback`, `llm.tokensIn`/`llm.tokensOut`, `latencyMs`).
2. Las hipótesis llevan prioridad explícita y criterio (probabilidad, impacto, costo de verificar) y cubren las cuatro categorías del PDF.
3. `bash scripts/coverage-report.sh` termina en 0, deja `docs/coverage/summary.json`, `docs/coverage/lcov.info` y `docs/coverage.md` con los 5 servicios, `web` y los 4 paquetes `@toka/*`, todos ≥ 70 % de líneas.
4. `README.md` explica cómo levantar el sistema (con `scripts/bootstrap-env.sh` y compose), enlaza solo a rutas existentes y resume la trazabilidad; `apps/web/README.md` es un documento aparte enlazado desde el raíz.
5. `scripts/agent-demo.sh` pasa `bash -n` y `docs/agent-example.md` documenta su ejecución con proveedor `mock` (sin API key) y con clave.
6. `docs/traceability.md` no deja ninguna fila de EX4 ni de los entregables de este cambio en `Planeado`, y conserva los 9 cambios, ≥60 filas y ≥10 etiquetas `[RIESGO]`.

## Estado

Archivado 2026-10-21. 2/6 tareas verificadas en disco (`tasks.md`): `docs/diagnostico-ex4.md` y `README.md`. Specs canónicas en `openspec/specs/` (incident-diagnosis-document, delivery-documentation, coverage-report). Evolución: ver `tasks.md`.
