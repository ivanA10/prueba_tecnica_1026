# Arquitectura — índice

## Resumen ejecutivo

- **Qué es**: plataforma de gestión de usuarios con autenticación, autorización por roles, auditoría de accesos y un agente de IA con RAG, en monorepo TypeScript/NestJS orquestado con Docker Compose.
- **Piezas**: `web` (React + nginx como reverse proxy / gateway ligero) y cinco servicios: `auth-service`, `user-service`, `role-service`, `audit-service` y `ai-agent-service`; cada uno con su almacén (Postgres, MongoDB, Redis, RabbitMQ, Qdrant).
- **Decisiones clave**:
  - Base de datos por servicio y saga de alta de usuario ([ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md)).
  - JWT RS256 con JWKS, RBAC y denylist en Redis ([ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md)).
  - REST con timeouts y circuit breaker, y eventos sobre RabbitMQ con outbox y DLQ ([ADR-005](../adrs/ADR-005-sync-rest-resilience.md), [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md)).
  - Clean Architecture, DDD y CQRS ligero ([ADR-006](../adrs/ADR-006-clean-architecture-ddd.md)).
  - Puerto `LlmProvider` con mock sin API key, y RAG con embeddings ONNX locales y Qdrant ([ADR-008](../adrs/ADR-008-llm-provider-port.md), [ADR-009](../adrs/ADR-009-rag-onnx-embeddings-qdrant.md)).
- **Cómo leerlo**: empezar por [01-diagramas.md](01-diagramas.md), seguir con 02 y 03; el mapeo del Ejercicio 1 está más abajo. Cada ADR separa lo **Implementado** de la **Evolución**. Trazabilidad con el PDF: [traceability.md](../traceability.md).

Diseño de la plataforma de microservicios (Ejercicio 1): `web` (React + nginx como reverse proxy / gateway ligero), cinco servicios NestJS (`auth-service`, `user-service`, `role-service`, `audit-service`, `ai-agent-service`) y su infraestructura (Postgres, MongoDB, Redis, RabbitMQ, Qdrant). El contrato compartido de nombres, puertos, eventos y claves está fijado en el cambio `design-architecture-docs`.

## Documentos de arquitectura

| # | Documento | Contenido |
|---|---|---|
| 01 | [01-diagramas.md](01-diagramas.md) | C4 de contenedores y secuencias (login/JWKS, `user.created`, consulta RAG) |
| 02 | [02-justificacion-tecnica.md](02-justificacion-tecnica.md) | Por qué cada tecnología y patrón; `## Estrategia multi-DB` |
| 03 | [03-flujo-de-datos.md](03-flujo-de-datos.md) | Flujo de datos; comunicación síncrona y asíncrona |
| 04 | [04-docker-compose-diseno.md](04-docker-compose-diseno.md) | Diseño de `docker-compose.yml` (normativo vs ilustrativo) |
| 05 | [05-ddd-clean-cqrs.md](05-ddd-clean-cqrs.md) | Contextos, agregados, capas y CQRS |
| 06 | [06-seguridad-escalabilidad.md](06-seguridad-escalabilidad.md) | Seguridad (OWASP), secretos, rate limiting, escalabilidad |
| 07 | [07-resiliencia.md](07-resiliencia.md) | Modos de fallo, timeouts, circuit breaker, DLQ, compensación |
| 08 | [08-integracion-ia-rag.md](08-integracion-ia-rag.md) | Agente IA, RAG, proveedor mock, prompt injection |

## ADRs

| ADR | Decisión |
|---|---|
| [ADR-001](../adrs/ADR-001-monorepo-typescript-nestjs.md) | Monorepo pnpm, TypeScript + NestJS, paquetes compartidos transversales |
| [ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md) | Límites de servicio y base de datos por servicio; saga de alta de usuario |
| [ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md) | JWT RS256, JWKS, RBAC, denylist y refresh |
| [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md) | RabbitMQ, eventos, outbox, reintentos y DLQ |
| [ADR-005](../adrs/ADR-005-sync-rest-resilience.md) | REST síncrono, timeouts, backoff y circuit breaker |
| [ADR-006](../adrs/ADR-006-clean-architecture-ddd.md) | Clean Architecture, DDD y CQRS ligero |
| [ADR-007](../adrs/ADR-007-observability-quality-testing.md) | Observabilidad, calidad y pruebas |
| [ADR-008](../adrs/ADR-008-llm-provider-port.md) | Puerto `LlmProvider`, mock, prompt injection |
| [ADR-009](../adrs/ADR-009-rag-onnx-embeddings-qdrant.md) | RAG con embeddings ONNX locales y Qdrant |
| [ADR-010](../adrs/ADR-010-frontend-react-rtk-nginx-gateway.md) | Frontend React + RTK y nginx como reverse proxy / gateway ligero |

Trazabilidad de requisitos del PDF a artefactos: [docs/traceability.md](../traceability.md).

Los ADRs marcan en su sección `## Implementación` qué está **Implementado en `<cambio>`** y qué es **Evolución** (no implementado, riesgo aceptado).

## Mapeo al Ejercicio 1

### Entregables

| Entregable del Ejercicio 1 | Documento y sección | Trazabilidad |
|---|---|---|
| Diagrama de arquitectura con todos los microservicios e interacciones (visual o Mermaid) | [01-diagramas.md](01-diagramas.md) (C4 de contenedores y secuencias) | EX1-R06 |
| Justificación de decisiones técnicas | [02-justificacion-tecnica.md](02-justificacion-tecnica.md); decisiones en los [ADRs](../adrs/ADR-001-monorepo-typescript-nestjs.md) 001 a 010 | EX1-R07 |
| Breve explicación del flujo de datos entre microservicios | [03-flujo-de-datos.md](03-flujo-de-datos.md) (`## Comunicación síncrona`, `## Comunicación asíncrona`) | EX1-R08 |
| Diseño de `docker-compose.yml` (estructura básica) | [04-docker-compose-diseno.md](04-docker-compose-diseno.md) | EX1-R09 |
| Cómo se aplican DDD y Clean Architecture | [05-ddd-clean-cqrs.md](05-ddd-clean-cqrs.md) (`## Contextos delimitados`, `## Agregados`, `## Regla de dependencia`) | EX1-R10 |

### Criterios de evaluación

| Criterio de evaluación | Documento y sección | Trazabilidad |
|---|---|---|
| Claridad y cohesión arquitectónica | Este índice y [01-diagramas.md](01-diagramas.md) | EX1-R11 |
| Uso de patrones adecuados (DDD, Clean Architecture, CQRS si aplica) | [05-ddd-clean-cqrs.md](05-ddd-clean-cqrs.md) (`## CQRS`), [ADR-006](../adrs/ADR-006-clean-architecture-ddd.md) | EX1-R12 |
| Seguridad y escalabilidad | [06-seguridad-escalabilidad.md](06-seguridad-escalabilidad.md), [ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md) | EX1-R13 |
| Comunicación entre microservicios (síncrona y asíncrona) | [03-flujo-de-datos.md](03-flujo-de-datos.md), [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md), [ADR-005](../adrs/ADR-005-sync-rest-resilience.md) | EX1-R14 |
| Estrategia de datos multi-DB bien justificada | [02-justificacion-tecnica.md](02-justificacion-tecnica.md) (`## Estrategia multi-DB`), [ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md) | EX1-R15 |
| Integración de IA en la arquitectura | [08-integracion-ia-rag.md](08-integracion-ia-rag.md), [ADR-008](../adrs/ADR-008-llm-provider-port.md), [ADR-009](../adrs/ADR-009-rag-onnx-embeddings-qdrant.md) | EX1-R16 |
| Dockerización completa y funcional | Diseño en [04-docker-compose-diseno.md](04-docker-compose-diseno.md); la dockerización completa y su verificación funcional se implementan en el cambio `harden-compose-resilience-security` (cambio 5) | EX1-R17 |
| Resiliencia y manejo de fallos entre servicios | [07-resiliencia.md](07-resiliencia.md), [ADR-005](../adrs/ADR-005-sync-rest-resilience.md), [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md) | EX1-R18 |

## Convenciones

- Diagramas en Mermaid (el PDF acepta formato visual o Mermaid).
- nginx se denomina "reverse proxy / gateway ligero"; no media tokens.
- No se fijan en la documentación IDs de modelo LLM ni precios: son configurables por variables de entorno y se verifican en `build-ai-agent-rag-service`.
