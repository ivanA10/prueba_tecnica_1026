---
id: ADR-005
title: Comunicación síncrona REST con timeouts, backoff y circuit breaker selectivo
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0]
---

# ADR-005 — Comunicación síncrona REST con timeouts, backoff y circuit breaker selectivo

## Context

Algunas interacciones requieren respuesta inmediata y consistencia en el momento de la petición: user-service valida el rol del nuevo usuario con role-service y aprovisiona credenciales en auth-service; ai-agent-service consulta usuarios en user-service y llama al proveedor LLM. El Ejercicio 1 exige al menos una comunicación síncrona y resiliencia ante fallos. Sin límites de tiempo ni protección, un servicio lento propaga la degradación en cascada y agota hilos y conexiones.

## Decision

Los servicios exponen **REST + OpenAPI** y se llaman entre sí por HTTP con estas reglas:

1. **Timeouts por arista**, con valor concreto y configurable por variable de entorno, definidos en `docs/architecture/07-resiliencia.md` (user→role, user→auth, agent→user, agent→LLM; este último más largo por la latencia de generación). Cada flujo tiene además un **presupuesto total** que acota los reintentos (los reintentos cuentan contra él): alta de usuario ≤10 s antes de compensar; consulta del agente 30 s extremo a extremo (LLM 20 s por llamada, herramienta user 3 s), con `proxy_read_timeout` de nginx en `/api/agent/` de 40 s (nginx > agente > LLM). Al agotarse el presupuesto del agente se cancela la llamada al LLM y se devuelve una respuesta degradada.
2. **Reintentos con backoff exponencial y jitter** solo en operaciones idempotentes (`GET`, `PUT /internal/credentials/{userId}`, `DELETE /internal/credentials/{userId}`); nunca en `POST` no idempotentes.
3. **Circuit breaker solo en cuatro aristas**: user→role, user→auth, agent→user y agent→LLM. En estado abierto se responde rápido con error controlado (o degradación del agente) en lugar de esperar al timeout.
4. **`x-correlation-id`**: se genera en el borde (nginx/primer servicio) si no existe y se propaga en cabeceras REST y en el sobre de eventos (`correlationId`); aparece en todos los logs (ADR-007).
5. Llamadas internas autenticadas: user→auth usa JWT de servicio (`client_credentials`, `aud: auth-service`, `scope: svc:internal`); agent→user reenvía el JWT del llamante (sin identidad privilegiada del agente).
6. Todos los servicios exponen `GET /health` (liveness) y `GET /ready` (readiness).

## Consequences

### Positivas

- Los fallos quedan acotados: un role-service lento no bloquea indefinidamente a user-service.
- El circuit breaker evita martillar una dependencia caída y da recuperación rápida (half-open).
- La correlación extremo a extremo permite reconstruir un flujo con una sola consulta de logs.
- REST + OpenAPI es herramienta estándar, depurable con `curl` y fácil de documentar para el evaluador.

### Negativas y riesgos

- Acoplamiento temporal: el alta de usuario falla si role-service o auth-service no responden (compensación en ADR-002).
- Mal calibrar timeouts y umbrales del breaker produce falsos positivos o espera excesiva; los valores se documentan y son configurables.
- Los reintentos sobre operaciones no idempotentes duplicarían efectos; por eso se restringen a las idempotentes.
- Las aristas sin breaker (por ejemplo las consultas de lectura del frontend a través de nginx) dependen solo de timeouts.

## Alternatives considered

### Alternativa 1 — gRPC entre servicios

Contratos tipados y menor latencia. Por qué se descartó: añade generación de código, tooling de depuración y un segundo protocolo; el volumen de la prueba no justifica el coste, y REST + OpenAPI es más legible para la revisión.

### Alternativa 2 — Service mesh (sidecars con mTLS, retries y breakers)

Resiliencia transversal sin código en los servicios. Por qué se descartó: requiere orquestador (Kubernetes) y un plano de control ajenos al entorno `docker compose` del alcance; complejidad desproporcionada.

### Alternativa 3 — Circuit breaker en todas las aristas

Uniformidad de política. Por qué se descartó: sobreingeniería frente al tiempo disponible; las aristas elegidas son las que implican dependencia síncrona crítica o servicios externos. El resto se protege con timeouts y healthchecks.

## Implementación

- **Implementado en `build-user-audit-services`**: cliente HTTP con timeout, backoff y circuit breaker en user→role y user→auth; propagación de `x-correlation-id`.
- **Implementado en `harden-compose-resilience-security`**: calibración final de timeouts y umbrales, healthchecks y readiness en compose. El breaker de agent→user y agent→LLM llega con `build-ai-agent-rag-service`.
- **Evolución**: breaker en aristas adicionales y métricas de estado del breaker en un backend de observabilidad.
