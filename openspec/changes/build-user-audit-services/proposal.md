# Proposal — build-user-audit-services

> Change 4 de 9. Implementa `apps/user-service` (usuarios, saga de alta, outbox transaccional, eventos) y `apps/audit-service` (consumidor `audit.events`, inserción idempotente en Mongo, API de consulta con RBAC). Parte del Ejercicio 2 (implementación). Contrato: `openspec/changes/archive/2026-10-20-design-architecture-docs/design.md`, ADR-002/004/005/006/007 y `docs/architecture/03` y `07`.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (el sub-agente planner no ejecuta el CLI `opsx` ni `validate-topic-key.sh`).

**En simple:** al terminar este cambio existen dos microservicios que compilan, se prueban (>=70 % de líneas) y se empaquetan en imagen Docker. `user-service` crea usuarios con una saga segura (el usuario nace `PENDING`, valida el rol con role-service, aprovisiona credenciales en auth-service y solo entonces pasa a `ACTIVE`; si algo falla, deshace primero las credenciales y luego borra el usuario pendiente), y publica sus eventos (`user.created`, `user.updated`, `user.deleted`, `user.role.assigned`) con un outbox, de modo que ningún evento se pierda aunque RabbitMQ caiga. `audit-service` escucha todos los eventos de usuarios, auth y roles, los guarda una sola vez en Mongo (aunque lleguen repetidos), ignora los republicados por re-sincronización y manda los mensajes problemáticos a una cola de errores tras 3 reintentos; los administradores consultan la auditoría con `GET /audit/events`.

## Esquema de identificadores

- Épica `EP-EX2`. Historias nuevas de este cambio (numeración alta para no chocar con el cambio 3 que se planifica en paralelo; `needs-verification` al consolidar):

| Historia | Descripción |
|---|---|
| US-EX2-41 | Alta de usuario con saga `PENDING → ACTIVE`, compensación y reconciliación |
| US-EX2-42 | CRUD de usuario, asignación de rol y eventos con `aggregateVersion` vía outbox |
| US-EX2-43 | Consumo idempotente de `audit.events` con reintentos, DLQ y filtro `reason=resync` |
| US-EX2-44 | API de consulta de auditoría con RBAC |
| US-EX2-45 | Empaquetado (Dockerfile por servicio), cobertura >=70 % y trazabilidad |

## Problem

Los cambios 5–7 (compose endurecido, frontend, agente) y la verificación de punta a punta necesitan los servicios de usuarios y auditoría. Sin ellos no hay ejemplo del flujo asíncrono con outbox (EX2-R03), ni de REST resiliente entre servicios (EX2-R02), ni cobertura de pruebas medible en estos dos servicios (EX2-R08). El diseño (cambio 1) fija el comportamiento pero no hay código.

## Solution

1. **user-service** (Clean Architecture: `domain`, `application`, `infrastructure`, `interfaces`; Prisma sobre `user_db`): `POST /users` ejecuta la saga con presupuesto total de 10 s (user→role 2 s, user→auth 3 s, reintentos dentro del presupuesto, vía `@toka/http-client`); compensación `DELETE` de credenciales primero y luego borrado del `PENDING`; barrido de reconciliación con período de gracia (>10 s) solo en user-service; `PATCH /users/{id}`, `DELETE /users/{id}`, `PUT /users/{id}/role`, `GET /users`, `GET /users/{id}`; cada cambio escribe en `outbox_events` en la misma transacción con `aggregateVersion` monotónico; un publicador de outbox emite a `toka.events`.
2. **audit-service** (Mongoose sobre `audit_db`): consumidor de `audit.events` con bindings `user.#`, `auth.#`, `role.#`; reintentos por cola de retardo (TTL + DLX, `x-retry-count`, 3 intentos) y `audit.events.dlq`; inserción idempotente por `eventId` (índice único); descarta los eventos con `reason=resync`; `GET /audit/events` (filtros actor, tipo, rango de fechas, paginación) solo para `admin`.
3. **Dockerfile por servicio**, prueba de humo del pipeline de auditoría contra la infraestructura real de compose (RabbitMQ + Mongo) y actualización de `docs/traceability.md`.

## Scope

- `apps/user-service/**` y `apps/audit-service/**` (código, pruebas, Prisma, Mongoose, Dockerfile).
- Ampliación **aditiva** de `@toka/contracts`: payloads tipados de `user.created|updated|deleted` (ADR-001: cambios solo aditivos).
- Variables de entorno de ambos servicios en `infra/env/{user,audit}-service.env.example` (solo añadir las que falten).
- `scripts/smoke-audit-pipeline.sh`; `docs/traceability.md` (estado de EX2-R02/R03/R08).

## Out of scope

- Agregar los servicios a `docker-compose.yml`, redes, nginx, verificación de egress (cambio 5).
- auth-service y role-service (cambio 3); consumo de `user.#` por auth (cambio 3); ingesta del agente (cambio 7).
- Publicación AMQP de `access.denied` (Evolución); outbox en auth/role (Evolución); retardo escalonado 5 s/30 s/2 min (se usa TTL fijo configurable; escalonado = Evolución).
- Pruebas de integración con contenedores dentro de Jest (la integración se cubre con el script de humo).

## Success criteria

1. `pnpm --filter user-service test` y `pnpm --filter audit-service test` pasan con cobertura de líneas >=70 % (umbral de `jest.config.base.js`).
2. Pruebas demuestran: orden de la compensación (`DELETE` credenciales antes de borrar `PENDING`), que un `DELETE` fallido deja el usuario `PENDING`, presupuesto del alta agotado → compensación, `user.role.assigned` con `userId/roleId/roleName/roleVersion`, idempotencia por `eventId`, filtro `reason=resync` y paso a DLQ tras 3 reintentos.
3. `scripts/smoke-audit-pipeline.sh` termina en 0: un evento válido publicado en `toka.events` aparece una vez en `audit_db`, un duplicado no crea otra fila, un `resync` no se inserta y un mensaje inválido llega a `audit.events.dlq`.
4. Ambas imágenes construyen (`docker build`) y corren como usuario no root.
5. Como máximo 29 pruebas en el cambio (tope 30), 12 tareas, 3 waves.
