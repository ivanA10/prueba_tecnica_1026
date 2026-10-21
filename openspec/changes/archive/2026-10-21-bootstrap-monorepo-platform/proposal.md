# Proposal — bootstrap-monorepo-platform

> Change 2 de 9. Cubre la base de plataforma del Ejercicio 2 (implementación): workspace pnpm, herramientas compartidas, paquetes transversales (`logger`, `jwt-guard`, `contracts`, `http-client`) e infraestructura local (compose solo de infraestructura). **Sin lógica de negocio de servicios** y sin `apps/*`.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (CLI `opsx` no disponible en el sub-agente planner; ver "Plan metadata" en design.md).

**En simple:** Este cambio deja listo el "terreno" para construir los 5 microservicios: un monorepo que compila, prueba y valida estilo con un solo comando; cuatro librerías pequeñas compartidas (logs JSON con `correlationId`, validación de JWT con lista de revocación, contratos de eventos y un cliente HTTP con timeout/reintentos/circuit breaker); y los contenedores de infraestructura (Postgres con un rol por base, Mongo con su usuario de auditoría, Redis con contraseña, RabbitMQ y Qdrant) con chequeos de salud. Aún no hay ningún servicio: eso viene en los cambios 3 a 7.

## Esquema de identificadores

- Épica: `EP-EX2` (Ejercicio 2 — Implementación). Historias `US-EX2-NN` (tabla abajo), reutilizadas por los cambios 3–5.

| Historia | Descripción |
|---|---|
| US-EX2-01 | Monorepo pnpm con TypeScript, Jest (umbral 70 líneas) y eslint/prettier compartidos |
| US-EX2-02 | Logging JSON estructurado con campos estándar y `correlationId` (`@toka/logger`) |
| US-EX2-03 | Validación local de JWT RS256 + denylist en Redis con fail-open (`@toka/jwt-guard`) |
| US-EX2-04 | Contratos de eventos versionados: sobre, routing keys, payload de `user.role.assigned` (`@toka/contracts`) |
| US-EX2-05 | Cliente HTTP resiliente: timeout, reintentos solo idempotentes, circuit breaker (`@toka/http-client`) |
| US-EX2-06 | Infraestructura local multi-DB con redes, healthchecks y roles por base (`docker-compose.yml`, `infra/`) |
| US-EX2-07 | Entorno y secretos por servicio con script de bootstrap (`.env.example`, `infra/env/*.example`, clave RSA) |
| US-EX2-08 | Verificación integral y trazabilidad (ADR-001 enmendado, `docs/traceability.md`) |

## Problem

Los cambios 3–7 construyen servicios que comparten convenciones de build, test y lint, un formato de log, la validación de JWT, el contrato de eventos y clientes salientes resilientes, y dependen de bases, broker y caché ya inicializados con aislamiento por rol. Sin esa base, cada servicio la reinventaría (deriva entre servicios, `jwt-guard` duplicado, resiliencia saliente copiada en `user-service` y `ai-agent-service`) y el compose del cambio 5 partiría de cero.

## Solution

1. **Workspace** pnpm (`apps/*`, `packages/*`), `tsconfig.base.json`, `jest.config.base.js` (con `coverageThreshold.global.lines: 70` y cobertura activada por defecto, de modo que `pnpm --filter <pkg> test` falla bajo el umbral), eslint + prettier, scripts raíz alineados a `AGENTS.md` → Commands.
2. **Cuatro paquetes `@toka/*` mutuamente independientes**: `contracts`, `logger`, `jwt-guard` y `http-client` (decisión nueva, ver design.md D1). Desarrollados con TDD.
3. **Infraestructura**: `docker-compose.yml` solo con Postgres 17, MongoDB 7, Redis 7 (`requirepass`), RabbitMQ 3.13 y Qdrant; redes y healthchecks según `docs/architecture/04-docker-compose-diseno.md`; scripts de init (Postgres rol por base, Mongo `audit_user`). RabbitMQ arranca solo con credenciales por defecto; `toka.events` y `toka.events.dlx` los afirma cada servicio con las constantes de `@toka/contracts`.
4. **Entorno**: `.env.example` (infra) y `infra/env/<servicio>.env.example`; `scripts/bootstrap-env.sh` genera los `.env` con contraseñas coherentes y la clave RSA (`secrets/jwt_private.pem`), cumpliendo lo que ADR-003 asigna a este cambio.
5. **Cierre documental**: enmienda de ADR-001 (paquete `http-client`; esqueletos de servicio pasan a cada `build-*`) y actualización de `docs/traceability.md`.

## Scope

- Raíz: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `jest.config.base.js`, eslint/prettier, `.gitignore` (adiciones), `.env.example`, `scripts/bootstrap-env.sh`.
- `packages/{contracts,logger,jwt-guard,http-client}` con pruebas (cobertura ≥70 % líneas por paquete).
- `docker-compose.yml`, `infra/postgres/init/`, `infra/mongo/init/`, `infra/env/*.env.example`.
- `docs/adrs/ADR-001-...md` (enmienda de la sección `## Implementación`) y `docs/traceability.md` (estado de filas EX2 de este cambio).

## Out of scope

- `apps/*` (los 5 esqueletos NestJS y `apps/web`): cada `build-*` crea el suyo. ADR-001 los listaba aquí; se enmienda (decisión D2, vetable en el 📋).
- Dependencias específicas de servicio (Prisma, Mongoose, `@nestjs/microservices`/amqplib, SDK de LLM, onnxruntime): las instala el cambio que crea el servicio.
- Servicios de aplicación y `web` en compose, Dockerfiles, nginx: cambio 5 (`harden-compose-resilience-security`) y `build-*`.
- Perfil `observability` (Loki, Alloy, Grafana) y red `grafana-ui`: Evolución opcional, cambio 5 (ADR-007).
- Topología de colas (`audit.events`, `auth.user-projection`, `agent.ingest`, `.retry`, `.dlq`): la declaran los consumidores en `build-*` (TTL por env); ni siquiera los exchanges: los afirma cada servicio (`assertExchange`).
- Guard de roles (`@Roles`), emisión de tokens, JWKS real de auth: `build-auth-role-services`.
- Rotación JWKS, ACL de Redis, discovery OIDC (Evolución declarada).

## Success criteria

1. `pnpm install && pnpm -r build && pnpm -r test -- --coverage && pnpm -r lint` termina con código 0 y cada paquete reporta ≥70 % de líneas.
2. Ningún paquete importa a otro paquete `@toka/*` (independencia verificable con `grep`).
3. `docker compose config -q` pasa y `docker compose up -d --wait` deja sano a todo contenedor de infraestructura.
4. `auth_user` no puede conectarse a `user_db`; `audit_user` autentica en `audit_db`; Redis rechaza el acceso sin contraseña; RabbitMQ autentica con `RABBITMQ_USER/PASSWORD`.
5. `bash scripts/bootstrap-env.sh` es idempotente, no deja `change-me` en los `.env` generados y mantiene coherentes las contraseñas duplicadas (infra ↔ servicio).
6. `jwt-guard` valida firma/`aud`/`kid`, rechaza `jti` y `iat < auth:deny:user:{id}`, y continúa con log `warn` si Redis no responde.
7. Los `.env` reales y `secrets/` están en `.gitignore`; las plantillas `.example` están versionables.
