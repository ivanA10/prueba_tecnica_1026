# Tasks — build-user-audit-services

> 12 tareas, 5 specs, 3 waves (Wave 0 = 4, Wave 1 = 5, Wave 2 = 3). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` (sin frontend). TDD obligatorio en 1.3–2.5 (prueba primero; presupuesto en `design.md` → `## Testing strategy`: 28 pruebas, tope por tarea 6, por archivo 8, por cambio 30).
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin backticks internos ni `grep -P`. Los gates de prueba usan `--coverage=false` para ejecuciones parciales (el umbral de 70 solo se exige en 3.3). Versiones de librerías: `needs-verification` — fijar al instalar. Suposiciones A1–A9 sobre los cambios 2 y 3: `design.md` (reconciliar tras ellos).
> Dependencias entre pistas: user (1.3 → 1.4 → 2.1 → 2.2) y audit (1.2 → 2.3 → 2.4 → 2.5) son independientes tras 1.1. Estructura por servicio: `src/{domain,application,infrastructure,interfaces}`; pruebas `*.spec.ts` junto al código.
> Envelopes: `database` → `apps/user-service/prisma/**`, `apps/*/src/infrastructure/mongo/*.schema.ts`, manifiestos y configuración de ambas apps (solo 1.1 y 1.2); `backend` → el resto de `apps/user-service/**` y `apps/audit-service/**`, `packages/contracts/src/**` (solo tipos, 1.3), `infra/env/*.example`, `scripts/**`, `docs/**` (solo 3.3).

## Wave 0 — Persistencia y núcleo de user-service

- [ ] 1.1 Manifiestos de ambas apps, instalación única y Prisma (`schema`, migración) de user-service
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 0 — Persistencia`
  - **Stories:** US-EX2-42
  - **Owner profile:** database
  - **Dependencies:** none
  - **Definition of done:** `apps/user-service` y `apps/audit-service` con `package.json` (`name: user-service` / `audit-service`; scripts `build` = `nest build` o `tsc -p tsconfig.build.json`, `test` = `jest`, `lint` = `eslint src`), `tsconfig.json` y `jest.config.js` que extienden la base (con las exclusiones de cableado de design D15), `nest-cli.json` si aplica y un `src/main.ts` mínimo (arranque Nest) para que `tsc` y `lint` no fallen; **todas** las dependencias de ambos servicios declaradas y una única `pnpm install` (lockfile único; las tareas siguientes no ejecutan `pnpm add`): `@nestjs/*`, `rxjs`, `reflect-metadata`, `class-validator`, `class-transformer`, `amqplib` (+ tipos), `ioredis`, `workspace:*` de `@toka/{contracts,logger,jwt-guard,http-client}`; en user-service `prisma` + `@prisma/client`; en audit-service `mongoose`; `supertest` y tipos como devDependencies. `apps/user-service/prisma/schema.prisma` exactamente como el modelo de `design.md` (`User`, `OutboxEvent`, enum `UserStatus`; sin columna de contraseña) y una migración SQL generada sin BD con `prisma migrate diff --from-empty --to-schema-datamodel ... --script` en `prisma/migrations/<timestamp>_init/migration.sql`, más `migration_lock.toml`. Versiones fijadas al instalar (Prisma mayor 6 o 7: ajustar la forma de configurar la URL).
  - **Verification gate:** cmd:test -f apps/user-service/package.json && test -f apps/audit-service/package.json && pnpm install && export DATABASE_URL=postgresql://u:p@localhost:5432/user_db && pnpm --filter user-service exec prisma validate && pnpm --filter user-service exec prisma generate && ls apps/user-service/prisma/migrations/*/migration.sql >/dev/null && grep -q 'outbox_events' apps/user-service/prisma/migrations/*/migration.sql && grep -q 'users_email_key' apps/user-service/prisma/migrations/*/migration.sql && ! grep -qi 'password' apps/user-service/prisma/schema.prisma && pnpm --filter user-service exec tsc --noEmit && pnpm --filter audit-service exec tsc --noEmit
  - **mockup_ref:** n/a

- [ ] 1.2 Esquema Mongoose `audit_events` con índice único `eventId` e índices de consulta
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 0 — Persistencia`
  - **Stories:** US-EX2-43
  - **Owner profile:** database
  - **Dependencies:** 1.1
  - **Definition of done:** `apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts` con colección `audit_events` y los campos de `design.md` (`eventId` único, `type`, `version`, `aggregateVersion`, `occurredAt` Date, `receivedAt`, `correlationId`, `actorUserId?`, `actorRoles[]`, `actorIsSystem`, `routingKey`, `payload` Mixed); índices `{eventId:1}` único, `{occurredAt:-1}`, `{type:1, occurredAt:-1}`, `{actorUserId:1, occurredAt:-1}`; `timestamps` desactivados (campos propios); sin métodos de actualización ni borrado.
  - **Verification gate:** cmd:pnpm --filter audit-service exec tsc --noEmit && grep -q 'audit_events' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts && grep -qE 'unique: *true' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts && grep -q 'occurredAt' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts && grep -q 'actorUserId' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts
  - **mockup_ref:** n/a

- [ ] 1.3 user-service: dominio, puertos y caso de uso `CreateUser` (saga con compensación y presupuesto) + payloads en `@toka/contracts` (TDD, 5 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-signup-saga.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-41
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** prueba primero en `apps/user-service/src/application/create-user.spec.ts` (5 casos de `design.md`). Implementa `domain/user.ts` (estados `PENDING|ACTIVE|DISABLED`, `version`), `domain/errors.ts` (`EmailTaken`, `SignupFailed`, `RoleNotFound`...), `application/ports.ts` (`UserRepository` con `createPending`, `persistWithOutbox`, `deleteWithOutbox`, `deletePending`, `findById`, `findPendingOlderThan`, `list`; `RoleClient`; `AuthCredentialsClient`; `Clock`; `IdGenerator`), `application/deadline.ts` y `application/create-user.ts` con el orden de D5 y el presupuesto de D4 (`budgetMs = deadline.remaining()` por llamada). El evento `user.created` (`aggregateVersion=2`, payload sin contraseña) se construye con `createEnvelope` de `@toka/contracts`; se añaden **solo tipos** `UserCreatedPayload`, `UserUpdatedPayload`, `UserDeletedPayload` (aditivo) y se reconstruye el paquete. La contraseña solo vive en memoria durante la saga.
  - **Verification gate:** cmd:pnpm --filter @toka/contracts build && pnpm --filter user-service exec tsc --noEmit && pnpm --filter user-service exec jest --coverage=false src/application/create-user && n=$(grep -cE '^[[:space:]]*(it|test)\(' apps/user-service/src/application/create-user.spec.ts) && test "$n" -ge 4 && test "$n" -le 6 && grep -q 'UserCreatedPayload' packages/contracts/src/payloads.ts
  - **mockup_ref:** n/a

- [ ] 1.4 user-service: casos de uso `UpdateUser`, `DeleteUser`, `AssignRole`, `ReconcilePending` (TDD, 5 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 0 — Casos de uso`
  - **Stories:** US-EX2-42, US-EX2-41
  - **Owner profile:** backend
  - **Dependencies:** 1.3
  - **Definition of done:** prueba primero en `apps/user-service/src/application/user-lifecycle.spec.ts` (5 casos). Casos de uso con los puertos de 1.3: `update-user.ts` (cambia nombre/email/estado, `version+1`, outbox `user.updated`), `delete-user.ts` (outbox `user.deleted` con `version+1` y borrado duro en la misma operación del repositorio), `assign-role.ts` (valida con `RoleClient`, 404 si no existe sin evento; outbox `user.role.assigned` con `{userId, roleId, roleName, roleVersion}`) y `reconcile-pending.ts` (D6: `findPendingOlderThan(now - grace)`, `DELETE` credenciales y solo si se confirma `deletePending`; un fallo no aborta el resto). Todos fijan `actor` y `correlationId` recibidos del llamante.
  - **Verification gate:** cmd:pnpm --filter user-service exec tsc --noEmit && pnpm --filter user-service exec jest --coverage=false src/application/user-lifecycle && n=$(grep -cE '^[[:space:]]*(it|test)\(' apps/user-service/src/application/user-lifecycle.spec.ts) && test "$n" -ge 4 && test "$n" -le 6 && grep -q 'roleVersion' apps/user-service/src/application/assign-role.ts && grep -q 'roleName' apps/user-service/src/application/assign-role.ts
  - **mockup_ref:** n/a

## Wave 1 — Adaptadores y HTTP de user-service; audit-service completo

- [ ] 2.1 user-service infraestructura: repositorio Prisma con outbox transaccional, `OutboxPublisher`, clientes HTTP y `ServiceTokenProvider` (TDD, 4 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 1 — Adaptadores`
  - **Stories:** US-EX2-41, US-EX2-42
  - **Owner profile:** backend
  - **Dependencies:** 1.4
  - **Definition of done:** pruebas primero en `apps/user-service/src/infrastructure/**/*.spec.ts` (4 casos de `design.md`; total entre las 4). Implementa `infrastructure/prisma/prisma-user.repository.ts` (`persistWithOutbox`/`deleteWithOutbox` con una sola `$transaction`; `createPending` traduce la violación de unicidad a `EmailTaken`), `infrastructure/outbox/outbox-publisher.ts` (D7: `FOR UPDATE SKIP LOCKED`, `ConfirmChannel`, `assertExchange` de `EVENTS_EXCHANGE`, marca `published_at`, reintento en el siguiente ciclo, ciclo de vida de arranque/parada), `infrastructure/http/{role.client,auth-credentials.client,service-token.provider}.ts` (A1, A5–A7: timeouts/reintentos de D4 por env; `PUT/DELETE` con `idempotent: true`; `DELETE` trata 404 como éxito; token por audiencia en caché hasta `exp` menos margen) y `infrastructure/config.ts` (lectura validada de env con valores por defecto de `design.md`). Ningún `console.log`; sin secretos ni contraseñas en logs.
  - **Verification gate:** cmd:pnpm --filter user-service exec tsc --noEmit && pnpm --filter user-service exec jest --coverage=false src/infrastructure && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/user-service/src/infrastructure --include=*.spec.ts | wc -l) && test "$n" -ge 3 && test "$n" -le 6 && grep -rq 'SKIP LOCKED' apps/user-service/src/infrastructure && grep -rq 'assertExchange' apps/user-service/src/infrastructure && grep -rq 'client_credentials' apps/user-service/src/infrastructure
  - **mockup_ref:** n/a

- [ ] 2.2 user-service interfaces: `UsersController`, `RolesGuard`, filtro de errores, `health`/`ready`, módulo, `main.ts` y runner de reconciliación (TDD, 3 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 1 — Adaptadores`
  - **Stories:** US-EX2-41, US-EX2-42
  - **Owner profile:** backend
  - **Dependencies:** 2.1
  - **Definition of done:** pruebas primero en `apps/user-service/src/interfaces/**/*.spec.ts` (3 casos de `design.md`). Rutas `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`, `PUT /users/:id/role`, `GET /health` (liveness) y `GET /ready` (Postgres y broker alcanzables); `JwtAuthGuard` (A3) + `RolesGuard` local con `@Roles('admin')` (D8/D9); DTOs con `class-validator` (la contraseña llega solo en `POST /users` y no se devuelve ni se loguea); filtro de excepciones: `EmailTaken`/`409` de auth → 409, `SignupFailed` → 503, `RoleNotFound` → 404; `app.module.ts` cablea puertos con adaptadores, `@toka/logger` (A4), `correlationId` y el arranque del `OutboxPublisher` y del runner de reconciliación (intervalo `RECONCILE_INTERVAL_MS`); `main.ts` escucha en `PORT` (3002 por defecto).
  - **Verification gate:** cmd:pnpm --filter user-service exec tsc --noEmit && pnpm --filter user-service exec jest --coverage=false src/interfaces && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/user-service/src/interfaces --include=*.spec.ts | wc -l) && test "$n" -ge 2 && test "$n" -le 4 && grep -rq 'RolesGuard' apps/user-service/src/interfaces && grep -rq "'health'" apps/user-service/src/interfaces && grep -rq "'ready'" apps/user-service/src/interfaces && pnpm --filter user-service build
  - **mockup_ref:** n/a

- [ ] 2.3 audit-service aplicación: `ProcessAuditEvent` (idempotente, filtro `resync`) y `RetryPolicy` (TDD, 5 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 1 — Consumidor`
  - **Stories:** US-EX2-43
  - **Owner profile:** backend
  - **Dependencies:** 1.2
  - **Definition of done:** prueba primero en `apps/audit-service/src/application/process-audit-event.spec.ts` (5 casos). `application/ports.ts` (`AuditEventRepository` con `insert(doc) → 'inserted'|'duplicate'` y `query(filter, page)`), `application/process-audit-event.ts` (valida con `isEventEnvelope`: inválido → resultado `permanent-failure`; `reason==='resync'` → `skipped` (D12); mapea actor `{userId, roles}` o `system` al documento; inserta y trata `'duplicate'` como éxito; errores del repositorio → `transient-failure`) y `application/retry-policy.ts` (`decide(result, retryCount, maxRetries=3)` → `ack | retry | dlq`; permanente → `dlq` sin reintentos).
  - **Verification gate:** cmd:pnpm --filter audit-service exec tsc --noEmit && pnpm --filter audit-service exec jest --coverage=false src/application && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/audit-service/src/application --include=*.spec.ts | wc -l) && test "$n" -ge 4 && test "$n" -le 6 && grep -rq 'resync' apps/audit-service/src/application && grep -rq 'isEventEnvelope' apps/audit-service/src/application
  - **mockup_ref:** n/a

- [ ] 2.4 audit-service infraestructura: repositorio Mongo y consumidor AMQP con topología, reintentos y DLQ (TDD, 3 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 1 — Consumidor`
  - **Stories:** US-EX2-43
  - **Owner profile:** backend
  - **Dependencies:** 2.3
  - **Definition of done:** pruebas primero en `apps/audit-service/src/infrastructure/**/*.spec.ts` (3 casos de `design.md`). `infrastructure/mongo/mongo-audit-event.repository.ts` (insert con traducción del código 11000 a `'duplicate'`; `query` con filtros actor/tipo/rango, `skip/limit`, orden `occurredAt` desc y `total`; sin update/delete) y `infrastructure/amqp/audit-consumer.ts` (D10, D11, D14: `assertExchange` de ambos exchanges, colas `audit.events`, `.retry` con `x-message-ttl=AUDIT_RETRY_TTL_MS`, `.dlq`, bindings tomados de `QueueBindings` de `@toka/contracts`, `prefetch`, `ack` manual; fallo transitorio → copia a `.retry` con `x-retry-count+1` y `ack`; agotado o permanente → copia a `.dlq` con `x-error`/`x-failed-at` y log con `eventId`/`correlationId`; reconexión con espera acotada; arranque/parada del ciclo de vida).
  - **Verification gate:** cmd:pnpm --filter audit-service exec tsc --noEmit && pnpm --filter audit-service exec jest --coverage=false src/infrastructure && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/audit-service/src/infrastructure --include=*.spec.ts | wc -l) && test "$n" -ge 3 && test "$n" -le 5 && grep -rq 'QueueBindings' apps/audit-service/src/infrastructure && grep -rq 'x-message-ttl' apps/audit-service/src/infrastructure && grep -rq 'audit.events.dlq' apps/audit-service/src/infrastructure
  - **mockup_ref:** n/a

- [ ] 2.5 audit-service interfaces: `GET /audit/events` con RBAC, validación de consulta, `health`/`ready`, módulo y `main.ts` (TDD, 3 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-query-api.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-44
  - **Owner profile:** backend
  - **Dependencies:** 2.4
  - **Definition of done:** pruebas primero en `apps/audit-service/src/interfaces/**/*.spec.ts` (3 casos de `design.md`). `application/query-audit.ts` (delegación al repositorio con `page`/`limit`), `interfaces/http/audit.controller.ts` (`GET /audit/events` con `actor`, `type`, `from`, `to`, `page`, `limit` 1..100, 20 por defecto; `from>to` o fecha inválida → 400; Mongo caído → 503), `JwtAuthGuard` (A3) + `RolesGuard` local `@Roles('admin')`, `GET /health` y `GET /ready` (Mongo y consumidor conectados), `app.module.ts` con `@toka/logger` (A4) y arranque del consumidor, `main.ts` en `PORT` (3004 por defecto).
  - **Verification gate:** cmd:pnpm --filter audit-service exec tsc --noEmit && pnpm --filter audit-service exec jest --coverage=false src/interfaces && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/audit-service/src/interfaces --include=*.spec.ts | wc -l) && test "$n" -ge 2 && test "$n" -le 4 && grep -rq 'RolesGuard' apps/audit-service/src/interfaces && grep -rq "'ready'" apps/audit-service/src/interfaces && pnpm --filter audit-service build
  - **mockup_ref:** n/a

## Wave 2 — Empaquetado, humo y cierre

- [ ] 3.1 Dockerfile por servicio, `.dockerignore` y variables de entorno faltantes
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/service-packaging-quality.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado`
  - **Stories:** US-EX2-45
  - **Owner profile:** backend
  - **Dependencies:** 2.2, 2.5
  - **Definition of done:** `apps/user-service/Dockerfile` y `apps/audit-service/Dockerfile` multi-etapa según D16 (contexto raíz; pnpm vía corepack con la versión de `packageManager`; compila `@toka/*` y el servicio; `prisma generate` en user-service; imagen final con `USER node`, `NODE_ENV=production`, `HEALTHCHECK`, `CMD node dist/main.js`); `.dockerignore` en la raíz (excluye `node_modules`, `dist`, `.git`, `.env`, `infra/env/*.env`, `secrets/`, `coverage`). `infra/env/user-service.env.example` y `infra/env/audit-service.env.example` completos con las variables de `design.md` y de `config.ts` (solo se **añaden** las faltantes, con valores por defecto no secretos; los marcadores secretos existentes no se tocan). No se modifica `docker-compose.yml` (cambio 5).
  - **Verification gate:** cmd:docker build -f apps/user-service/Dockerfile -t toka/user-service:dev . && docker build -f apps/audit-service/Dockerfile -t toka/audit-service:dev . && test "$(docker run --rm --entrypoint id toka/user-service:dev -u)" != "0" && test "$(docker run --rm --entrypoint id toka/audit-service:dev -u)" != "0" && grep -q 'node_modules' .dockerignore && grep -q 'secrets' .dockerignore && grep -q 'RECONCILE_GRACE_MS' infra/env/user-service.env.example && grep -q 'AUDIT_RETRY_TTL_MS' infra/env/audit-service.env.example
  - **mockup_ref:** n/a

- [ ] 3.2 Prueba de humo del pipeline de auditoría (RabbitMQ + Mongo reales + imagen de audit-service)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 2 — Humo`
  - **Stories:** US-EX2-43
  - **Owner profile:** backend
  - **Dependencies:** 3.1
  - **Definition of done:** `scripts/smoke-audit-pipeline.sh` (bash, idempotente, con `trap` de limpieza, esperas con tope de tiempo): ejecuta `scripts/bootstrap-env.sh` si falta `.env`; `docker compose up -d --wait mongo rabbitmq`; arranca `toka/audit-service:dev` en la red `toka_backend` con `infra/env/audit-service.env`; publica en `toka.events` (con `rabbitmqadmin` vía `docker compose exec -T rabbitmq` o, si falta, con `node` dentro de la imagen de audit) (1) un evento `user.created` válido, (2) el mismo `eventId` otra vez, (3) un evento `role.updated` con `reason=resync`, (4) un cuerpo no JSON; comprueba por `docker compose exec -T mongo mongosh` que existe exactamente 1 documento del evento (1)/(2), 0 del (3) y que `audit.events.dlq` contiene >=1 mensaje (4) (`rabbitmqctl list_queues`). Termina en 0 solo si todo se cumple; no deja contenedores propios en marcha.
  - **Verification gate:** cmd:bash -n scripts/smoke-audit-pipeline.sh && bash scripts/smoke-audit-pipeline.sh
  - **mockup_ref:** n/a

- [ ] 3.3 Verificación integral (cobertura >=70, lint, build, tope de pruebas) y trazabilidad
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/service-packaging-quality.md`
  - **Spec wave slice:** `## Wave 2 — Cierre`
  - **Stories:** US-EX2-45
  - **Owner profile:** backend
  - **Dependencies:** 3.1, 3.2
  - **Definition of done:** `pnpm --filter user-service test` y `pnpm --filter audit-service test` pasan con cobertura de líneas >=70 % (umbral de `jest.config.base.js`; sin ampliar exclusiones más allá de D15; si falta cobertura se añaden pruebas dentro del presupuesto, máx. 30 en el cambio); `pnpm -r lint` y `pnpm -r build` limpios. `docs/traceability.md`: EX2-R02, EX2-R03 y EX2-R08 pasan a estado "Implementado" con las rutas reales (`apps/user-service/`, `apps/audit-service/`); en `docs/adrs/ADR-004-async-rabbitmq-events.md` se conservan/actualizan las marcas Implementado/Evolución de lo realizado aquí (outbox de user-service, DLQ, retardo fijo y escalonado como Evolución). Solo se editan archivos bajo `docs/`.
  - **Verification gate:** cmd:pnpm --filter user-service test && pnpm --filter audit-service test && pnpm -r lint && pnpm -r build && node -e "for (const s of ['user-service','audit-service']) { const t=require('./apps/'+s+'/coverage/coverage-summary.json').total; if (t.lines.pct<70) { console.error(s, t.lines.pct); process.exit(1); } }" && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/user-service/src apps/audit-service/src --include=*.spec.ts | wc -l) && test "$n" -le 30 && grep -q 'build-user-audit-services' docs/traceability.md && grep -E 'EX2-R03' docs/traceability.md | grep -q 'Implementado'
  - **mockup_ref:** n/a
