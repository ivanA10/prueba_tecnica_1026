# Matriz de trazabilidad — PDF → cambio → artefacto

Fuente: `Prueba_Tecnica_Desarrollador_Fullstack IA.pdf` (Senior Full-Stack Engineer IA, Toka). Cada viñeta de "Requisitos técnicos", "Tecnologías requeridas/sugeridas", "Requisitos de entrega" y "Evaluación" de los 5 ejercicios, las 5 viñetas de la instrucción del Ejercicio 4 y la sección "Entregables Esperados" tiene una fila con su cambio responsable y la ruta del artefacto esperado. Las rutas siguen el contrato de `openspec/changes/design-architecture-docs/design.md`; las rutas de código (`apps/`, `packages/`, `infra/`, según el "Planned layout" de AGENTS.md) son las previstas y las reconcilia el cambio que las implementa.

Convenciones:

- **ID**: `EX<n>-R<NN>` por ejercicio; `EX0-R<NN>` para "Entregables Esperados".
- **Tipo**: técnico / tecnología / entrega / evaluación / instrucción.
- **Estado**: `Planeado` (cambio aún sin ejecutar), `Implementado` (artefacto existente en disco), `En diseño` (lo produce el cambio 1, `design-architecture-docs`, en curso). Los estados se actualizan al archivar cada cambio.
- **[RIESGO]**: requisito propenso a omitirse; el validador lo revisa de forma explícita.
- Evolución declarada (no implementada, riesgo aceptado, ver ADRs): adaptador OpenAI/Azure OpenAI, outbox de auth, `access.denied` por AMQP, rotación de claves JWKS, discovery OIDC, ACL de Redis, barrido de credenciales en auth.

## Cambios planeados

1. `design-architecture-docs` — arquitectura, 10 ADRs y esta matriz (solo documentación).
2. `bootstrap-monorepo-platform` — monorepo pnpm, paquetes compartidos (`logger`, `jwt-guard` completo, `contracts`, `http-client`) e init de Postgres.
3. `build-auth-role-services` — auth-service y role-service (JWT RS256/JWKS, RBAC, refresh, denylist).
4. `build-user-audit-services` — user-service y audit-service (saga de alta, outbox, RabbitMQ, auditoría en Mongo).
5. `harden-compose-resilience-security` — docker-compose completo, healthchecks, resiliencia como código, seguridad OWASP, perfil `observability`.
6. `build-frontend-user-console` — frontend React + RTK + nginx reverse proxy / gateway ligero.
7. `build-ai-agent-rag-service` — ai-agent-service con RAG (Qdrant, embeddings locales), proveedor Anthropic y mock.
8. `evaluate-agent-prompts-quality` — evaluación del agente y calidad de prompts (latencia, costo de tokens, validación de respuestas).
9. `document-diagnosis-delivery` — diagnóstico del Ejercicio 4, README de ejecución y entrega final.

## Ejercicio 1

| ID | Requisito (cita del PDF) | Tipo | Cambio | Artefacto | Estado |
|---|---|---|---|---|---|
| EX1-R01 | Microservicios: diseñar al menos 3-4 microservicios independientes | técnico | design-architecture-docs | `docs/architecture/01-diagramas.md`, `docs/adrs/ADR-002-service-boundaries-db-per-service.md` | En diseño |
| EX1-R02 | Comunicación: síncrona (REST) y asíncrona (RabbitMQ o Kafka) entre microservicios | técnico | design-architecture-docs | `docs/architecture/03-flujo-de-datos.md`, `docs/adrs/ADR-004-async-rabbitmq-events.md`, `docs/adrs/ADR-005-sync-rest-resilience.md` | En diseño |
| EX1-R03 | Estrategia de datos: multi-DB (Postgres transaccional, MongoDB auditorías, Redis caching) | técnico | design-architecture-docs | `docs/architecture/02-justificacion-tecnica.md` (`## Estrategia multi-DB`), `docs/adrs/ADR-002-service-boundaries-db-per-service.md` | En diseño |
| EX1-R04 | Integración de IA: microservicio o módulo de agentes (OpenAI/Azure OpenAI) con RAG. Desviación declarada: el proveedor por defecto es Anthropic (permitido en Ex5, con razones técnicas en ADR-008); el puerto `LlmProvider` mantiene una ranura de adaptador OpenAI/Azure OpenAI (Evolución), de modo que el requisito se cumple por arquitectura | técnico | design-architecture-docs | `docs/architecture/08-integracion-ia-rag.md`, `docs/adrs/ADR-008-llm-provider-port.md`, `docs/adrs/ADR-009-rag-onnx-embeddings-qdrant.md` | En diseño |
| EX1-R05 | Ambiente dockerizado: ejecutable localmente con Docker Compose, con todos los servicios necesarios | técnico | design-architecture-docs | `docs/architecture/04-docker-compose-diseno.md` | En diseño |
| EX1-R06 | Entrega: diagrama de arquitectura (visual o Mermaid) con todos los microservicios e interacciones | entrega | design-architecture-docs | `docs/architecture/01-diagramas.md` | En diseño |
| EX1-R07 | Entrega: justificación de decisiones técnicas (por qué cada tecnología/patrón) | entrega | design-architecture-docs | `docs/architecture/02-justificacion-tecnica.md`, `docs/adrs/ADR-001-monorepo-typescript-nestjs.md` … `ADR-010` | En diseño |
| EX1-R08 | Entrega: breve explicación del flujo de datos entre microservicios [RIESGO] | entrega | design-architecture-docs | `docs/architecture/03-flujo-de-datos.md` | En diseño |
| EX1-R09 | Entrega: diseño de docker-compose.yml (estructura básica) que orqueste todos los servicios | entrega | design-architecture-docs | `docs/architecture/04-docker-compose-diseno.md` | En diseño |
| EX1-R10 | Entrega: explicación de cómo se aplican DDD y Clean Architecture [RIESGO] (se pide también en Ex2) | entrega | design-architecture-docs | `docs/architecture/05-ddd-clean-cqrs.md`, `docs/adrs/ADR-006-clean-architecture-ddd.md` | En diseño |
| EX1-R11 | Evaluación: claridad y cohesión arquitectónica | evaluación | design-architecture-docs | `docs/architecture/README.md`, `docs/architecture/01-diagramas.md` | En diseño |
| EX1-R12 | Evaluación: uso de patrones adecuados (DDD, Clean Architecture, CQRS si aplica) | evaluación | design-architecture-docs | `docs/architecture/05-ddd-clean-cqrs.md` (`## CQRS`), `docs/adrs/ADR-006-clean-architecture-ddd.md` | En diseño |
| EX1-R13 | Evaluación: consideración de seguridad y escalabilidad | evaluación | design-architecture-docs | `docs/architecture/06-seguridad-escalabilidad.md`, `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md` | En diseño |
| EX1-R14 | Evaluación: diseño de comunicación entre microservicios (síncrona y asíncrona) | evaluación | design-architecture-docs | `docs/architecture/03-flujo-de-datos.md`, `docs/adrs/ADR-004-async-rabbitmq-events.md`, `docs/adrs/ADR-005-sync-rest-resilience.md` | En diseño |
| EX1-R15 | Evaluación: estrategia de datos multi-DB bien justificada | evaluación | design-architecture-docs | `docs/architecture/02-justificacion-tecnica.md` (`## Estrategia multi-DB`) | En diseño |
| EX1-R16 | Evaluación: integración de IA en la arquitectura | evaluación | design-architecture-docs | `docs/architecture/08-integracion-ia-rag.md`, `docs/adrs/ADR-008-llm-provider-port.md` | En diseño |
| EX1-R17 | Evaluación: Dockerización completa y funcional (diseño en cambio 1; implementación y verificación funcional en el cambio 5) | evaluación | harden-compose-resilience-security | `docs/architecture/04-docker-compose-diseno.md` (diseño), `docker-compose.yml` | Planeado |
| EX1-R18 | Evaluación: resiliencia y manejo de fallos entre servicios [RIESGO] (resiliencia como código en el cambio 5) | evaluación | design-architecture-docs | `docs/architecture/07-resiliencia.md`, `docs/adrs/ADR-005-sync-rest-resilience.md`, `docs/adrs/ADR-004-async-rabbitmq-events.md` | En diseño |
| EX1-R19 | Instrucción del Ejercicio 1: sistema con autenticación, autorización, auditoría de accesos, gestión de roles y escalable [RIESGO]. Autenticación: JWT RS256/JWKS (ADR-003). Autorización: RBAC por rol en `jwt-guard`. Auditoría de accesos: eventos `auth.#` consumidos por audit-service y denegaciones 403 registradas en logs con `event=access.denied` (su publicación por AMQP es Evolución). Gestión de roles: role-service y `role.#`. Escalabilidad: servicios sin estado y réplicas | instrucción | design-architecture-docs | `docs/architecture/06-seguridad-escalabilidad.md`, `docs/architecture/03-flujo-de-datos.md`, `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md`, `docs/adrs/ADR-004-async-rabbitmq-events.md` | En diseño |

## Ejercicio 2

| ID | Requisito (cita del PDF) | Tipo | Cambio | Artefacto | Estado |
|---|---|---|---|---|---|
| EX2-R01 | Microservicios: implementar al menos 3-4 microservicios independientes del sistema diseñado | técnico | build-auth-role-services | `apps/auth-service/`, `apps/role-service/` (continúa en `build-user-audit-services`: `apps/user-service/`, `apps/audit-service/`) | Planeado |
| EX2-R02 | Comunicación: REST síncrono entre microservicios | técnico | build-user-audit-services | `apps/user-service/` (user→role, user→auth), `packages/contracts/` | Planeado |
| EX2-R03 | Comunicación: al menos un ejemplo asíncrono (RabbitMQ o Kafka) para eventos | técnico | build-user-audit-services | `apps/user-service/` (outbox), `apps/audit-service/` (consumidor `audit.events`), `docs/adrs/ADR-004-async-rabbitmq-events.md` | Planeado |
| EX2-R04 | Arquitectura: aplicar DDD y Clean Architecture en cada microservicio | técnico | build-auth-role-services | `apps/*/src/{domain,application,infrastructure,interfaces}`, `docs/architecture/05-ddd-clean-cqrs.md` | Planeado |
| EX2-R05 | Autenticación: OAuth2/OIDC distribuida entre microservicios (puede usar JWT con validación distribuida) | técnico | build-auth-role-services | `apps/auth-service/` (RS256, JWKS, `/oauth/token`), `packages/jwt-guard/`, `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md` | Planeado |
| EX2-R06 | Base de datos: estrategia multi-DB según diseño (Postgres, MongoDB, Redis) | técnico | bootstrap-monorepo-platform | `infra/postgres/init/01-roles-and-databases.sh` (rol por base), `docs/architecture/02-justificacion-tecnica.md` | Implementado |
| EX2-R07 | Dockerización: cada microservicio con su Dockerfile y un docker-compose.yml que orqueste servicios y dependencias | técnico | harden-compose-resilience-security | `apps/*/Dockerfile`, `docker-compose.yml`, `.env.example` | Planeado |
| EX2-R08 | Tests: unitarios con coverage mínimo del 70% | técnico | build-user-audit-services | `apps/*/jest.config.*` (`coverageThreshold` 70 por servicio), `docs/adrs/ADR-007-observability-quality-testing.md` | Planeado |
| EX2-R09 | Logging: logging estructurado (JSON) en cada microservicio | técnico | bootstrap-monorepo-platform | `packages/logger/`, `docs/adrs/ADR-007-observability-quality-testing.md` | Implementado |
| EX2-R10 | Tecnología: lenguaje libre (C#, Python FastAPI o Node.js Express/NestJS) | tecnología | bootstrap-monorepo-platform | `docs/adrs/ADR-001-monorepo-typescript-nestjs.md`, `package.json`, `pnpm-workspace.yaml` | Implementado |
| EX2-R11 | Tecnología: ORM (EF Core, SQLAlchemy o equivalente según stack) | tecnología | build-auth-role-services | `apps/*/prisma/schema.prisma`, `docs/architecture/02-justificacion-tecnica.md` | Planeado |
| EX2-R12 | Tecnología: base de datos Postgres, MongoDB y Redis (contenedores) | tecnología | harden-compose-resilience-security | `docker-compose.yml` (`postgres`, `mongo`, `redis`) | Planeado |
| EX2-R13 | Tecnología: mensajería RabbitMQ o Kafka (contenedores) | tecnología | harden-compose-resilience-security | `docker-compose.yml` (`rabbitmq`), definiciones de exchange y colas | Planeado |
| EX2-R14 | Tecnología: contenedores Docker y Docker Compose | tecnología | harden-compose-resilience-security | `docker-compose.yml`, `apps/*/Dockerfile` | Planeado |
| EX2-R15 | Entrega: código fuente de todos los microservicios implementados | entrega | build-user-audit-services | `apps/` | Planeado |
| EX2-R16 | Entrega: Dockerfiles para cada microservicio | entrega | harden-compose-resilience-security | `apps/*/Dockerfile` | Planeado |
| EX2-R17 | Entrega: docker-compose.yml funcional que orqueste todos los servicios | entrega | harden-compose-resilience-security | `docker-compose.yml` | Planeado |
| EX2-R18 | Entrega: tests unitarios con coverage report [RIESGO] (el reporte debe quedar como artefacto) | entrega | document-diagnosis-delivery | `apps/*/coverage/`, `docs/coverage.md` | Planeado |
| EX2-R19 | Entrega: documentación básica de cómo ejecutar el sistema completo [RIESGO] (dos documentos de ejecución: sistema y frontend) | entrega | document-diagnosis-delivery | `README.md` | Planeado |
| EX2-R20 | Entrega: explicación de cómo se aplicaron DDD y Clean Architecture [RIESGO] (explicado también en Ex1) | entrega | document-diagnosis-delivery | `docs/architecture/05-ddd-clean-cqrs.md`, `docs/adrs/ADR-006-clean-architecture-ddd.md`, `README.md` | Planeado |
| EX2-R21 | Evaluación: cumplimiento funcional de los microservicios | evaluación | build-user-audit-services | `apps/*/test/`, `openapi.yaml` por servicio | Planeado |
| EX2-R22 | Evaluación: uso correcto de ORM y acceso a datos | evaluación | build-auth-role-services | `apps/*/src/infrastructure/` (repositorios Prisma / Mongoose) | Planeado |
| EX2-R23 | Evaluación: código limpio, seguro y siguiendo principios SOLID | evaluación | build-auth-role-services | `apps/*/src/`, `docs/adrs/ADR-006-clean-architecture-ddd.md` | Planeado |
| EX2-R24 | Evaluación: aplicación correcta de DDD y Clean Architecture | evaluación | build-auth-role-services | `apps/*/src/{domain,application,infrastructure,interfaces}` | Planeado |
| EX2-R25 | Evaluación: comunicación síncrona y asíncrona bien implementada | evaluación | build-user-audit-services | `apps/user-service/`, `apps/audit-service/`, `packages/contracts/` | Planeado |
| EX2-R26 | Evaluación: independencia y desacoplamiento entre microservicios (BD por servicio, sin dominio compartido) | evaluación | bootstrap-monorepo-platform | `docs/adrs/ADR-001-monorepo-typescript-nestjs.md`, `docs/adrs/ADR-002-service-boundaries-db-per-service.md`, `infra/postgres/init/01-roles-and-databases.sh` | Implementado |
| EX2-R27 | Evaluación: autenticación distribuida funcionando correctamente; incluye autorización además de autenticación [RIESGO] (RBAC por rol) | evaluación | build-auth-role-services | `packages/jwt-guard/`, `apps/role-service/`, `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md` | Planeado |
| EX2-R28 | Evaluación: tests con coverage adecuado | evaluación | build-user-audit-services | `apps/*/coverage/`, `docs/adrs/ADR-007-observability-quality-testing.md` | Planeado |
| EX2-R29 | Evaluación: Dockerización completa y funcional (compose, healthchecks, `depends_on` con `service_healthy`) | evaluación | harden-compose-resilience-security | `docker-compose.yml`, `docs/architecture/04-docker-compose-diseno.md` | Planeado |
| EX2-R30 | Evaluación: logging estructurado implementado | evaluación | bootstrap-monorepo-platform | `packages/logger/`, `docs/adrs/ADR-007-observability-quality-testing.md` | Implementado |
| EX2-R31 | Evaluación: seguridad OWASP (validación de inputs, sanitización, etc.) [RIESGO] (OWASP mapeado a código, no solo a texto) | evaluación | harden-compose-resilience-security | `docs/architecture/06-seguridad-escalabilidad.md` (`## OWASP`), validación en `apps/*/src/interfaces/`, `limit_req` en nginx | Planeado |
| EX2-R32 | Evaluación: resiliencia como código [RIESGO] (timeouts, backoff, circuit breaker en 4 aristas, DLQ) — complementa la evaluación de Ex1 | evaluación | harden-compose-resilience-security | `packages/http-client/` (cliente HTTP transversal sin dominio, con timeout, backoff y breaker; decidido y entregado en `bootstrap-monorepo-platform`; solo user-service y ai-agent-service lo usan en sus aristas salientes con breaker, desde su capa `infrastructure`; ni `packages/contracts/` ni `packages/jwt-guard/`), `docs/architecture/07-resiliencia.md` | Planeado |

## Ejercicio 3

| ID | Requisito (cita del PDF) | Tipo | Cambio | Artefacto | Estado |
|---|---|---|---|---|---|
| EX3-R01 | Framework: React o Angular con TypeScript | técnico | build-frontend-user-console | `apps/web/`, `docs/adrs/ADR-010-frontend-react-rtk-nginx-gateway.md` | Planeado |
| EX3-R02 | State management: Redux/Zustand o NGRX o similar | técnico | build-frontend-user-console | `apps/web/src/store/` (Redux Toolkit + RTK Query) | Planeado |
| EX3-R03 | Integración: consumir los microservicios del ejercicio 2 (servicio de agregación o BFF básico si es necesario) | técnico | build-frontend-user-console | `apps/web/nginx.conf` (reverse proxy / gateway ligero), `apps/web/src/api/` | Planeado |
| EX3-R04 | UI/UX: manejo de estados de carga (loading states) | técnico | build-frontend-user-console | `apps/web/src/components/`, `apps/web/src/pages/` | Planeado |
| EX3-R05 | UI/UX: manejo de errores (error states y mensajes) | técnico | build-frontend-user-console | `apps/web/src/components/`, `apps/web/src/api/` | Planeado |
| EX3-R06 | UI/UX: validación de formularios | técnico | build-frontend-user-console | `apps/web/src/features/users/`, `apps/web/src/features/auth/` | Planeado |
| EX3-R07 | UI/UX: feedback visual al usuario | técnico | build-frontend-user-console | `apps/web/src/components/` (notificaciones y estados) | Planeado |
| EX3-R08 | Tests: básicos con Jest + React Testing Library | técnico | build-frontend-user-console | `apps/web/src/**/*.test.tsx`, `apps/web/jest.config.*` (`config.ts` envuelve `import.meta.env`) | Planeado |
| EX3-R09 | Dockerización: incluir el front-end en el docker-compose.yml del ejercicio 2 [RIESGO] | técnico | build-frontend-user-console | `apps/web/Dockerfile`, `docker-compose.yml` (servicio `web`) | Planeado |
| EX3-R10 | Tecnología: front-end React con TypeScript | tecnología | build-frontend-user-console | `apps/web/package.json`, `apps/web/tsconfig.json` | Planeado |
| EX3-R11 | Tecnología: state management Redux Toolkit/Zustand | tecnología | build-frontend-user-console | `apps/web/src/store/` | Planeado |
| EX3-R12 | Tecnología: testing Jest + React Testing Library | tecnología | build-frontend-user-console | `apps/web/jest.config.*` | Planeado |
| EX3-R13 | Tecnología: HTTP client Axios, Fetch API o HttpClient | tecnología | build-frontend-user-console | `apps/web/src/api/` (RTK Query sobre Fetch API) | Planeado |
| EX3-R14 | Tecnología: build con Vite, CRA o Angular CLI | tecnología | build-frontend-user-console | `apps/web/vite.config.ts` | Planeado |
| EX3-R15 | Entrega: código fuente de la aplicación front-end | entrega | build-frontend-user-console | `apps/web/src/` | Planeado |
| EX3-R16 | Entrega: configuración de state management | entrega | build-frontend-user-console | `apps/web/src/store/` | Planeado |
| EX3-R17 | Entrega: tests básicos de componentes y lógica | entrega | build-frontend-user-console | `apps/web/src/**/*.test.tsx` | Planeado |
| EX3-R18 | Entrega: integración con los microservicios del ejercicio 2 | entrega | build-frontend-user-console | `apps/web/nginx.conf`, `apps/web/src/api/` | Planeado |
| EX3-R19 | Entrega: documentación de cómo ejecutar el front-end [RIESGO] (documento separado del de sistema) | entrega | document-diagnosis-delivery | `apps/web/README.md` | Planeado |
| EX3-R20 | Entrega: actualización del docker-compose.yml para incluir el front-end | entrega | build-frontend-user-console | `docker-compose.yml` (servicio `web` en el compose principal) | Planeado |
| EX3-R21 | Evaluación: funcionalidad de la UI y cumplimiento de requisitos | evaluación | build-frontend-user-console | `apps/web/src/features/` | Planeado |
| EX3-R22 | Evaluación: uso correcto de state management | evaluación | build-frontend-user-console | `apps/web/src/store/` | Planeado |
| EX3-R23 | Evaluación: integración correcta con los microservicios (access token en memoria, refresh en cookie HttpOnly) | evaluación | build-frontend-user-console | `apps/web/src/api/`, `docs/adrs/ADR-010-frontend-react-rtk-nginx-gateway.md` | Planeado |
| EX3-R24 | Evaluación: manejo adecuado de estados (loading, error, éxito) | evaluación | build-frontend-user-console | `apps/web/src/components/` | Planeado |
| EX3-R25 | Evaluación: calidad del código TypeScript | evaluación | build-frontend-user-console | `apps/web/tsconfig.json`, lint | Planeado |
| EX3-R26 | Evaluación: tests implementados y funcionando | evaluación | build-frontend-user-console | `apps/web/src/**/*.test.tsx` | Planeado |
| EX3-R27 | Evaluación: UX básica (feedback al usuario, validaciones) | evaluación | build-frontend-user-console | `apps/web/src/features/` | Planeado |
| EX3-R28 | Evaluación: dockerización del front-end (en el mismo compose) [RIESGO] | evaluación | build-frontend-user-console | `apps/web/Dockerfile`, `docker-compose.yml` | Planeado |

## Ejercicio 4

| ID | Requisito (cita del PDF) | Tipo | Cambio | Artefacto | Estado |
|---|---|---|---|---|---|
| EX4-R01 | Instrucción: formular hipótesis sobre posibles causas (base de datos, comunicación entre servicios, red, agentes IA) | instrucción | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Hipótesis`) | Planeado |
| EX4-R02 | Instrucción: describir un plan de diagnóstico sistemático usando logs estructurados y herramientas de debugging | instrucción | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Plan de diagnóstico`) | Planeado |
| EX4-R03 | Instrucción: explicar cómo usaría logs centralizados para identificar el problema (referencia ADR-007 y perfil `observability`) [RIESGO] | instrucción | document-diagnosis-delivery | `docs/diagnostico-ex4.md`, `docs/adrs/ADR-007-observability-quality-testing.md`, perfil compose `observability` | Planeado |
| EX4-R04 | Instrucción: problemas específicos de agentes IA (alta latencia, costos elevados de tokens, rate limiting) | instrucción | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Agentes IA`), `docs/architecture/08-integracion-ia-rag.md` | Planeado |
| EX4-R05 | Instrucción: explicar cómo comunicaría el avance a stakeholders [RIESGO] | instrucción | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Comunicación a stakeholders`) | Planeado |
| EX4-R06 | Evaluación: lógica del análisis y priorización de hipótesis | evaluación | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Hipótesis`) | Planeado |
| EX4-R07 | Evaluación: prioridad de acciones (qué verificar primero) | evaluación | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Plan de diagnóstico`) | Planeado |
| EX4-R08 | Evaluación: uso adecuado de logs y herramientas de debugging (receta por `correlationId`, `docker compose logs` con `jq`) | evaluación | document-diagnosis-delivery | `docs/diagnostico-ex4.md`, `docs/adrs/ADR-007-observability-quality-testing.md` | Planeado |
| EX4-R09 | Evaluación: problemas específicos de microservicios (comunicación, fallos en cascada) | evaluación | document-diagnosis-delivery | `docs/diagnostico-ex4.md`, `docs/architecture/07-resiliencia.md` (matriz de fallos) | Planeado |
| EX4-R10 | Evaluación: diagnóstico de problemas de agentes IA (latencia, costos, rate limits) | evaluación | document-diagnosis-delivery | `docs/diagnostico-ex4.md`, métricas del agente (`llm.tokensIn`, `llm.tokensOut`, `latencyMs`) | Planeado |
| EX4-R11 | Evaluación: comunicación clara y estructurada del avance | evaluación | document-diagnosis-delivery | `docs/diagnostico-ex4.md` (`## Comunicación a stakeholders`) | Planeado |
| EX4-R12 | Entregable: respuesta del ejercicio de diagnóstico (Ex4) | entrega | document-diagnosis-delivery | `docs/diagnostico-ex4.md` | Planeado |

## Ejercicio 5

| ID | Requisito (cita del PDF) | Tipo | Cambio | Artefacto | Estado |
|---|---|---|---|---|---|
| EX5-R01 | Agente de IA: integrar un agente usando OpenAI, Azure OpenAI, Anthropic o Gemini APIs (Anthropic + mock; adaptador OpenAI = Evolución) | técnico | build-ai-agent-rag-service | `apps/ai-agent-service/`, `docs/adrs/ADR-008-llm-provider-port.md` | Planeado |
| EX5-R02 | RAG básico: implementar RAG con vector database (Qdrant local) | técnico | build-ai-agent-rag-service | `apps/ai-agent-service/src/infrastructure/qdrant/`, `docs/adrs/ADR-009-rag-onnx-embeddings-qdrant.md` | Planeado |
| EX5-R03 | RAG básico: crear pipeline de embeddings para documentos/contexto | técnico | build-ai-agent-rag-service | `apps/ai-agent-service/src/application/ingest/`, `docs/architecture/08-integracion-ia-rag.md` (`## Pipeline de ingesta`) | Planeado |
| EX5-R04 | Prompt engineering: diseñar y documentar estrategia (system prompts, few-shot, chain-of-thought si aplica) | técnico | evaluate-agent-prompts-quality | `docs/prompt-engineering.md`, `apps/ai-agent-service/src/prompts/` | Planeado |
| EX5-R05 | Evaluación: métricas de latencia (tiempo de respuesta) | técnico | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/`, campo de log `latencyMs` | Planeado |
| EX5-R06 | Evaluación: coste de tokens (input/output) [RIESGO] (vía `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK`, sin valores en docs) | técnico | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/`, campos `llm.tokensIn` / `llm.tokensOut` | Planeado |
| EX5-R07 | Evaluación: validación básica de calidad de respuesta [RIESGO] (como código, contra esquema) | técnico | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/validators/` | Planeado |
| EX5-R08 | Integración: el agente se integra con al menos uno de los microservicios del ejercicio 2 (consulta a user-service reenviando el JWT del llamante) | técnico | build-ai-agent-rag-service | `apps/ai-agent-service/src/infrastructure/user-client/`, `docs/architecture/08-integracion-ia-rag.md` (`## Identidad y datos`) | Planeado |
| EX5-R09 | Tecnología sugerida: APIs de IA (OpenAI, Azure OpenAI, Anthropic, Gemini) | tecnología | build-ai-agent-rag-service | `docs/adrs/ADR-008-llm-provider-port.md` | Planeado |
| EX5-R10 | Tecnología sugerida: frameworks (LangChain, Semantic Kernel o implementación directa) | tecnología | build-ai-agent-rag-service | `apps/ai-agent-service/` (implementación directa tras puerto `LlmProvider`) | Planeado |
| EX5-R11 | Tecnología sugerida: vector DB (Qdrant contenedor local, Chroma, Pinecone, Weaviate, Azure Cognitive Search) | tecnología | harden-compose-resilience-security | `docker-compose.yml` (`qdrant`), `docs/adrs/ADR-009-rag-onnx-embeddings-qdrant.md` | Planeado |
| EX5-R12 | Tecnología sugerida: embeddings (OpenAI, Azure OpenAI o modelos locales; ONNX MiniLM local) | tecnología | build-ai-agent-rag-service | `apps/ai-agent-service/`, `docs/adrs/ADR-009-rag-onnx-embeddings-qdrant.md` | Planeado |
| EX5-R13 | Entrega: código del microservicio o módulo de IA integrado | entrega | build-ai-agent-rag-service | `apps/ai-agent-service/` | Planeado |
| EX5-R14 | Entrega: pipeline de embeddings implementado | entrega | build-ai-agent-rag-service | `apps/ai-agent-service/src/application/ingest/` | Planeado |
| EX5-R15 | Entrega: documentación de la estrategia de prompt engineering | entrega | evaluate-agent-prompts-quality | `docs/prompt-engineering.md` | Planeado |
| EX5-R16 | Entrega: código de evaluación de respuestas (latencia, costos) | entrega | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/` | Planeado |
| EX5-R17 | Entrega: ejemplo de uso del agente integrado con los microservicios [RIESGO] (ejemplo ejecutable) | entrega | document-diagnosis-delivery | `docs/agent-example.md`, `scripts/agent-demo.sh` | Planeado |
| EX5-R18 | Entrega: explicación de cómo se integra con el sistema existente | entrega | build-ai-agent-rag-service | `docs/architecture/08-integracion-ia-rag.md` | Planeado |
| EX5-R19 | Evaluación: integración funcional del agente con los microservicios | evaluación | build-ai-agent-rag-service | `apps/ai-agent-service/test/` | Planeado |
| EX5-R20 | Evaluación: implementación correcta de RAG con vector database | evaluación | build-ai-agent-rag-service | `apps/ai-agent-service/src/infrastructure/qdrant/` | Planeado |
| EX5-R21 | Evaluación: calidad de la estrategia de prompt engineering | evaluación | evaluate-agent-prompts-quality | `docs/prompt-engineering.md` | Planeado |
| EX5-R22 | Evaluación: evaluación de respuestas implementada (métricas de latencia y costos) | evaluación | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/` | Planeado |
| EX5-R23 | Evaluación: manejo adecuado de errores y rate limiting de APIs de IA [RIESGO] (429, limitador de concurrencia y rate limit por usuario en Redis, como código) | evaluación | build-ai-agent-rag-service | `apps/ai-agent-service/src/infrastructure/llm/`, `docs/adrs/ADR-008-llm-provider-port.md` | Planeado |
| EX5-R24 | Evaluación: consideración de costos y optimización de tokens [RIESGO] | evaluación | evaluate-agent-prompts-quality | `docs/prompt-engineering.md` (`## Optimización de tokens`), `max_tokens` y chunks ≤256 tokens | Planeado |
| EX5-R25 | Evaluación: validación de respuestas del agente (incluye mitigación de prompt injection, OWASP LLM01) | evaluación | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/validators/`, `docs/architecture/08-integracion-ia-rag.md` (`## Prompt injection`) | Planeado |

## Entregables esperados (global)

Sección "Entregables Esperados" del PDF (repositorio o carpeta comprimida). Los IDs usan el prefijo `EX0-`.

| ID | Entregable (cita del PDF) | Tipo | Cambio | Artefacto | Estado |
|---|---|---|---|---|---|
| EX0-R01 | Arquitectura: diagrama(s) de arquitectura y justificación técnica | entrega | design-architecture-docs | `docs/architecture/01-diagramas.md`, `docs/architecture/02-justificacion-tecnica.md` | En diseño |
| EX0-R02 | Arquitectura: diseño de docker-compose.yml (estructura básica) | entrega | design-architecture-docs | `docs/architecture/04-docker-compose-diseno.md` | En diseño |
| EX0-R03 | Arquitectura: explicación de aplicación de DDD y Clean Architecture | entrega | design-architecture-docs | `docs/architecture/05-ddd-clean-cqrs.md` | En diseño |
| EX0-R04 | Microservicios: código fuente de todos los microservicios implementados | entrega | build-user-audit-services | `apps/` | Planeado |
| EX0-R05 | Microservicios: Dockerfiles para cada microservicio | entrega | harden-compose-resilience-security | `apps/*/Dockerfile` | Planeado |
| EX0-R06 | Microservicios: docker-compose.yml funcional completo | entrega | harden-compose-resilience-security | `docker-compose.yml` | Planeado |
| EX0-R07 | Microservicios: tests unitarios con coverage report [RIESGO] | entrega | document-diagnosis-delivery | `apps/*/coverage/`, `docs/coverage.md` | Planeado |
| EX0-R08 | Microservicios: documentación de ejecución del sistema | entrega | document-diagnosis-delivery | `README.md` | Planeado |
| EX0-R09 | IA y Agentes: código del microservicio o módulo de IA | entrega | build-ai-agent-rag-service | `apps/ai-agent-service/` | Planeado |
| EX0-R10 | IA y Agentes: pipeline de embeddings | entrega | build-ai-agent-rag-service | `apps/ai-agent-service/src/application/ingest/` | Planeado |
| EX0-R11 | IA y Agentes: documentación de estrategia de prompt engineering | entrega | evaluate-agent-prompts-quality | `docs/prompt-engineering.md` | Planeado |
| EX0-R12 | IA y Agentes: código de evaluación de respuestas | entrega | evaluate-agent-prompts-quality | `apps/ai-agent-service/src/evaluation/` | Planeado |
| EX0-R13 | Front-end: código fuente de la aplicación front-end | entrega | build-frontend-user-console | `apps/web/src/` | Planeado |
| EX0-R14 | Front-end: configuración de state management | entrega | build-frontend-user-console | `apps/web/src/store/` | Planeado |
| EX0-R15 | Front-end: tests de componentes | entrega | build-frontend-user-console | `apps/web/src/**/*.test.tsx` | Planeado |
| EX0-R16 | Análisis: respuesta del ejercicio de diagnóstico (ejercicio 4) | entrega | document-diagnosis-delivery | `docs/diagnostico-ex4.md` | Planeado |

## Notas

- Todos los cambios nombrados existen en la lista de `## Cambios planeados`; una fila con cambio vacío o ajeno a esa lista invalida el documento.
- Duración estimada del PDF (Ex1 90 min, Ex2 120 min, Ex3 90 min, Ex4 30 min, Ex5 90 min): el alcance fuera de lo implementable en esos tiempos está marcado como Evolución en los ADRs.
