# Implementation Handoff — bootstrap-monorepo-platform

## Change summary
- **Change name:** bootstrap-monorepo-platform (change 2 de 9)
- **Approved proposal:** `openspec/changes/bootstrap-monorepo-platform/proposal.md`
- **Approved design:** `openspec/changes/bootstrap-monorepo-platform/design.md`
- **Approved tasks:** `openspec/changes/bootstrap-monorepo-platform/tasks.md` (11 tareas, 3 waves: 4 + 4 + 3)

## Goal
Dejar un monorepo pnpm que compila, prueba (umbral 70 % líneas) y valida estilo con los comandos de `AGENTS.md`, con 4 paquetes transversales independientes (`@toka/contracts`, `@toka/logger`, `@toka/jwt-guard`, `@toka/http-client`) y un compose solo de infraestructura (Postgres rol por base, Mongo `audit_user`, Redis con contraseña, RabbitMQ con `toka.events`/`toka.events.dlx`, Qdrant) con healthchecks y redes de 04. Sin `apps/*` ni lógica de negocio.

## In scope
- Raíz del workspace, bases de tsconfig/jest/eslint/prettier, `.env.example`, `scripts/bootstrap-env.sh`, `.gitignore`/`.gitattributes`.
- Paquetes, init de infra y compose de infraestructura (ver proposal → Scope).
- Enmienda de ADR-001 y estado en `docs/traceability.md` (tarea 3.3, tras el 📋).

## Out of scope
- `apps/*`, Dockerfiles, nginx, servicios en compose, perfil `observability`, topología de colas, guard de roles, emisión de tokens, dependencias específicas de servicio (Prisma, Mongoose, amqplib, SDK LLM, onnx).

## Decisions already closed
- D1 `http-client` compartido (mecanismo en paquete; valores por arista en cada servicio, 07-resiliencia). D2 sin `apps/*` aquí. D3 alcance `@toka/*`, paquetes sin dependencias entre sí. D4 cobertura 70 % en `jest.config.base.js`. D5 observabilidad diferida al cambio 5. D6 RabbitMQ: solo exchanges en definitions. D7 logger = middleware (contexto) + interceptor (log de petición). D8 jwt-guard con puertos (`DenylistReader`, logger pino-like). D9 JWKS en caché de memoria. D10 breaker propio por fallos consecutivos.
- `auth:deny:user:{id}` = epoch en segundos; rechazo si `iat <` valor. Timeout de denylist por defecto 200 ms.
- Presupuesto de pruebas: 18 (contracts 3, logger 4, jwt-guard 6, http-client 5); 0 en infra.

## Open risks / follow-ups
- Prerrequisito: pnpm no instalado; 1.1 ejecuta `corepack enable && corepack prepare pnpm@<versión> --activate` y fija `packageManager`; 1.1 precrea los 4 manifiestos y hace la única instalación (2.x sin `pnpm add`). `.gitattributes` = `* text=auto eol=lf` (repo con `core.autocrlf=true`). RabbitMQ sin `load_definitions`: los servicios afirman `toka.events`/`toka.events.dlx` (cambios 3–7). JOSE fijado a v5. Riesgos: sondas de salud de Qdrant/Mongo (`needs-verification`); umbral 70 % en paquetes pequeños (ver design → Risks).
- Cambio 3 (`build-auth-role-services`): escribir `auth:deny:user:*` en epoch segundos; integrar `JwtAuthGuard` con el JWKS real; añadir `@Roles`.
- Cambio 4: completar payloads de eventos en `@toka/contracts` (solo aditivo); configurar `http-client` para user→role/user→auth (2 s/3 s, presupuesto 10 s).
- Cambio 5 (`harden-compose-resilience-security`): reconciliar 04 con este compose, añadir servicios/redes `edge`/`egress`/`public` en uso, perfil `observability`, verificación de egress; `<svc>:jwks` en Redis queda sin usar (D9).
- Cambio 7: `http-client` para agent→user (reenvío del JWT) y agent→LLM.
- Brecha de documentación: `AGENTS.md` conserva "Status: planned" en Stack y Commands; actualizar solo vía re-ejecución de `agent-prep`.

## Source-of-truth files
- `openspec/changes/bootstrap-monorepo-platform/{proposal,design,tasks}.md` y `specs/{monorepo-workspace,infra-compose,shared-packages,jwt-guard}.md`
- `openspec/changes/archive/2026-10-20-design-architecture-docs/design.md` y `handoff.md`
- `docs/architecture/04-docker-compose-diseno.md`, `docs/architecture/07-resiliencia.md`
- `docs/adrs/ADR-001`, `ADR-003`, `ADR-007`

## Implementation guidance
- Wave 0: 1.1, 1.2 y 1.3 son independientes; 1.4 depende de 1.2 y 1.3. Wave 1: 2.1–2.4 en paralelo (solo requieren 1.1). Wave 2: 3.1 y 3.2 en paralelo; 3.3 al final.
- TDD en Wave 1: escribir la prueba, verla fallar, implementar. No exceder 6 pruebas por tarea, 8 por archivo, 30 por cambio.
- Fijar versiones al instalar (`needs-verification`); no inventar números en los artefactos.
- Si la implementación contradice el diseño, pausar y enmendar antes de continuar.

## Verification guidance
- Cada tarea trae gate `cmd:` ejecutable. El gate 3.2 necesita Docker y deja el entorno limpio (`down -v`).
- Después: validador (`forge:verify`) y gate ✅ manual.

## Suggested implement prompt
Ejecutar `forge:orchestrate` para `bootstrap-monorepo-platform`: Wave 0 (1.1–1.4), Wave 1 (2.1–2.4 en paralelo) y Wave 2 (3.1–3.3), con checkpoint tras cada wave y gate ✅ al final.

## Suggested checkpoints
- Planning-approved (📋), fin de Wave 0, fin de Wave 1, pre-verify, post-verify.
