---
id: ADR-007
title: Observabilidad con logs JSON (pino) y umbral de calidad Jest por servicio
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0, observabilidad, calidad, testing]
---

# ADR-007 — Observabilidad y calidad

## Context
Con cinco servicios y flujos síncronos y asíncronos, diagnosticar un fallo (Ex4) exige poder seguir una petición de extremo a extremo. Además, el PDF pide pruebas y un criterio de calidad verificable. Los logs de texto libre no son consultables y un umbral global de cobertura oculta servicios sin pruebas.

## Decision
1. **Logs JSON con pino**, una línea por evento, mediante el paquete compartido `packages/logger`. Campos estándar: `timestamp`, `level`, `service`, `correlationId`, `userId` (si hay), `route`, `statusCode`, `latencyMs`. En `ai-agent-service` además `llm.provider`, `llm.tokensIn`, `llm.tokensOut` y `ragHits`.
2. **Eventos de seguridad y recuperación** con campo `event`:
   - `event=access.denied` para cada 403 (su publicación por AMQP es Evolución, ver ADR-004).
   - `event=audit.fallback` con el sobre completo del evento de auth no publicado tras agotar reintentos.
3. **Receta de consulta por `correlationId`** (Ex4): `docker compose logs <servicio> | jq 'select(.correlationId=="<id>")'`. El `x-correlation-id` se propaga por REST (ADR-005) y por el sobre del evento (ADR-004). Los eventos `audit.fallback` se recuperan con `jq 'select(.event=="audit.fallback")'`.
4. **Perfil compose opcional `observability`** (Loki + Grafana; etiquetas de imagen `needs-verification`) para logs centralizados. Es opcional y no bloquea el arranque base.
5. **Calidad**: Jest con `coverageThreshold` de **70 por servicio** sobre líneas; las ramas son informativas (se reportan, no rompen el build).
6. **`## Testing strategy` obligatorio** en el `design.md` de cada cambio que escriba código, con presupuesto de pruebas declarado. Sin esa sección rige el tope de proporcionalidad por tarea.
7. Nunca se loguean contraseñas, hashes, tokens ni el cuerpo completo de peticiones de autenticación.

## Consequences
### Positivas
- Un único formato permite filtrar con `jq` por `correlationId`, `event` o `statusCode` sin infraestructura adicional.
- El umbral por servicio evita que un servicio bien probado compense a otro sin pruebas.
- Los campos del agente permiten estimar coste y calidad RAG (con las variables `LLM_PRICE_*`, ADR-008) sin exponer contenido.

### Negativas y riesgos
- Sin el perfil `observability`, la correlación entre servicios requiere ejecutar `jq` por cada contenedor.
- Un umbral de líneas mide volumen, no calidad; se mitiga con revisión del validador y la sección `## Testing strategy`.
- Disciplina requerida: un servicio que omita `correlationId` rompe la trazabilidad (se cubre con pruebas del paquete `logger`).

## Alternatives considered
### Alternativa 1 — Logging de texto libre
Por qué se descartó: no es consultable de forma fiable, impide filtrar por `correlationId` y complica extraer el sobre de `audit.fallback`.

### Alternativa 2 — Sin umbral de cobertura por servicio (o umbral global único)
Por qué se descartó: un valor global permite que un servicio quede sin pruebas; un umbral por servicio es auditable y barato de configurar.

### Alternativa 3 — Trazas distribuidas completas (OpenTelemetry + Jaeger) desde el inicio
Por qué se descartó: sobre-ingeniería para el tiempo disponible; `correlationId` en logs cubre el caso de Ex4.

## Implementación
- **Implementado en `bootstrap-monorepo-platform`**: `packages/logger` (pino, campos estándar) y configuración de `coverageThreshold` 70 por servicio.
- **Implementado en `build-user-audit-services` y `build-ai-agent-rag-service`**: eventos `access.denied`, `audit.fallback` y campos `llm.*` / `ragHits`.
- **Evolución** (opcional): perfil compose `observability` en `harden-compose-resilience-security`; publicación de `access.denied` por AMQP.
