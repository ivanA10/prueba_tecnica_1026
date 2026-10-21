# Tasks — build-user-audit-services

> 12 tareas, 5 specs, 3 waves (Wave 0 = 4, Wave 1 = 5, Wave 2 = 3). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` (sin frontend). TDD obligatorio en 1.3–2.5 (prueba primero; presupuesto en `design.md` → `## Testing strategy`: 29 pruebas, tope por tarea 6, por archivo 8, por cambio 30). Los gates no ejecutan `pnpm install` ni `pnpm -r` desnudo: la instalación única la hace el orquestador tras 1.1; los gates usan `pnpm --filter @toka/<svc> exec jest --coverage=false <patrón>` (Jest 30, patrón posicional).
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin backticks internos ni `grep -P`. Los gates de prueba usan `--coverage=false` para ejecuciones parciales (el umbral de 70 solo se exige en 3.3). Versiones de librerías: `needs-verification` — fijar al instalar. Suposiciones A1–A9 sobre los cambios 2 y 3: `design.md` (reconciliar tras ellos).
> Dependencias entre pistas: user (1.3 → 1.4 → 2.1 → 2.2) y audit (1.2 → 2.3 → 2.4 → 2.5) son independientes tras 1.1. Estructura por servicio: `src/{domain,application,infrastructure,interfaces}`; pruebas `*.spec.ts` junto al código.
> Envelopes: `database` → `apps/user-service/prisma/**`, `apps/*/src/infrastructure/mongo/*.schema.ts`, manifiestos y configuración de ambas apps (solo 1.1 y 1.2); `backend` → el resto de `apps/user-service/**` y `apps/audit-service/**`, `packages/contracts/src/**` (solo tipos, 1.3), `infra/env/*.example`, `scripts/**`, `docs/**` (solo 3.3).

> Reconciliación as-built (2026-10-21): `[x]` solo para tareas verificadas en disco; cada tarea lleva su línea **Evidencia**. Las tareas no entregadas tal como se planearon quedan sin marcar y se describen en `## Evolución`. Ambos servicios usan una estructura plana en `src/` (un archivo por responsabilidad) en lugar de los directorios `domain/application/infrastructure/interfaces`, y la autorización `@Roles('admin')` del plan evolucionó a permisos (`PermissionsGuard`); ver `design.md` → `## Decisiones de implementación`.

## Wave 0 — Persistencia y núcleo de user-service

- [x] 1.1 Manifiestos de ambas apps, instalación única y Prisma (`schema`, migración) de user-service
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 0 — Persistencia`
  - **Stories:** US-EX2-42
  - **Owner profile:** database
  - **Dependencies:** none
  - **Definition of done:** **esta tarea solo edita manifiestos y archivos; NO ejecuta `pnpm install`** (la instalación única del workspace la ejecuta el orquestador tras 1.1, coordinada con el cambio 3 para no pelear por `pnpm-lock.yaml`; las tareas siguientes no ejecutan `pnpm add` ni `pnpm install`). `apps/user-service` y `apps/audit-service` con `package.json` (`name: @toka/user-service` / `@toka/audit-service`; scripts `build` = `nest build` o `tsc -p tsconfig.build.json`, `test` = `jest`, `lint` = `eslint src`), `tsconfig.json` y `jest.config.js` que extienden la base (con las exclusiones de cableado de design D15, incluido el cliente Prisma generado), `nest-cli.json` si aplica y un `src/main.ts` mínimo (arranque Nest); **todas** las dependencias de ambos servicios declaradas: `@nestjs/*`, `rxjs`, `reflect-metadata`, `class-validator`, `class-transformer`, `amqplib` (+ tipos), `ioredis`, `workspace:*` de `@toka/{contracts,logger,jwt-guard,http-client}`; en user-service `@prisma/client` y `prisma` **en `dependencies`** (el contenedor ejecuta `prisma migrate deploy`, D16); en audit-service `mongoose`; `supertest` y tipos como devDependencies. `apps/user-service/prisma/schema.prisma` como el modelo de `design.md` (`User`, `OutboxEvent`, enum `UserStatus`; sin columna de contraseña) con `generator client { provider = "prisma-client-js"; output = "../src/generated/prisma" }` (cliente por app, reflejando la decisión D4 del cambio 3; reconciliar nombre exacto tras el cambio 3; `src/generated/` es directorio autogenerado: gitignored y excluido de cobertura/lint) y una migración SQL generada con `prisma migrate diff --from-empty --to-schema-datamodel ... --script` en `prisma/migrations/<timestamp>_init/migration.sql`, más `migration_lock.toml` (si `prisma` aún no está instalado, escribir el SQL a mano desde el modelo; el gate lo valida por contenido). Versiones fijadas al instalar (Prisma mayor 6 o 7: ajustar la forma de configurar la URL).
  - **Verification gate:** cmd:node -e "const a=require('./apps/user-service/package.json'),b=require('./apps/audit-service/package.json');process.exit(a.name==='@toka/user-service'&&b.name==='@toka/audit-service'&&a.dependencies.prisma&&a.dependencies['@prisma/client']?0:1)" && test -f apps/user-service/jest.config.js && test -f apps/audit-service/jest.config.js && test -f apps/user-service/src/main.ts && test -f apps/audit-service/src/main.ts && grep -q 'output' apps/user-service/prisma/schema.prisma && grep -q 'outbox_events' apps/user-service/prisma/migrations/*/migration.sql && grep -q 'users_email_key' apps/user-service/prisma/migrations/*/migration.sql && ! grep -qi 'password' apps/user-service/prisma/schema.prisma && ! grep -qi 'password' apps/user-service/prisma/migrations/*/migration.sql
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/{user,audit}-service/{package.json,tsconfig.json,jest.config.js,src/main.ts}` (`@toka/user-service`, `@toka/audit-service`; `mongoose` en audit; `prisma` en `devDependencies` de user), `apps/user-service/prisma/schema.prisma` (`User`, `OutboxEvent`, enum `UserStatus`, sin columna de contraseña, cliente en `src/generated/prisma`), `prisma/migrations/20261020000000_init/migration.sql`, `migration_lock.toml`.

- [x] 1.2 Esquema Mongoose `audit_events` con índice único `eventId` e índices de consulta
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 0 — Persistencia`
  - **Stories:** US-EX2-43
  - **Owner profile:** database
  - **Dependencies:** 1.1
  - **Definition of done:** `apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts` con colección `audit_events` y los campos de `design.md` (`eventId` único, `type`, `version`, `aggregateVersion`, `occurredAt` Date, `receivedAt`, `correlationId`, `actorUserId?`, `actorRoles[]`, `actorIsSystem`, `routingKey`, `payload` Mixed); índices `{eventId:1}` único, `{occurredAt:-1}`, `{type:1, occurredAt:-1}`, `{actorUserId:1, occurredAt:-1}`; `timestamps` desactivados (campos propios); sin métodos de actualización ni borrado.
  - **Verification gate:** cmd:pnpm --filter @toka/audit-service exec tsc --noEmit && grep -q 'audit_events' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts && grep -qE 'unique: *true' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts && grep -q 'occurredAt' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts && grep -q 'actorUserId' apps/audit-service/src/infrastructure/mongo/audit-event.schema.ts
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/audit-service/src/audit.schema.ts` (colección `audit_events`, `eventId` único, índices `occurredAt`, `type+occurredAt`, `actorUserId+occurredAt`, `versionKey: false`); el repositorio solo expone `insert` y `query` (`audit.repository.ts`).

- [x] 1.3 user-service: dominio, puertos y caso de uso `CreateUser` (saga con compensación y presupuesto) + payloads en `@toka/contracts` (TDD, 5 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-signup-saga.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-41
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** (requiere la instalación única del workspace ejecutada por el orquestador tras 1.1) prueba primero en `apps/user-service/src/application/create-user.spec.ts` (5 casos de `design.md`). `RoleClient.get(roleId)` devuelve `{id, name, version}` y la saga envía a `AuthCredentialsClient.put` `{userId, email, password, roleId, roleName, roleVersion}` (los dos últimos salen de ese `GET /roles/{id}`; sin ellos la proyección `role_names_projection` de auth queda vacía y el login emitiría `roles:[]`); el camino feliz lo comprueba. Implementa `domain/user.ts` (estados `PENDING|ACTIVE|DISABLED`, `version`), `domain/errors.ts` (`EmailTaken`, `SignupFailed`, `RoleNotFound`...), `application/ports.ts` (`UserRepository` con `createPending`, `persistWithOutbox`, `deleteWithOutbox`, `deletePending`, `findById`, `findPendingOlderThan`, `list`; `RoleClient`; `AuthCredentialsClient`; `Clock`; `IdGenerator`), `application/deadline.ts` y `application/create-user.ts` con el orden de D5 y el presupuesto de D4 (`budgetMs = deadline.remaining()` por llamada). El evento `user.created` (`aggregateVersion=2`, payload sin contraseña) se construye con `createEnvelope` de `@toka/contracts`; se añaden **solo tipos** `UserCreatedPayload`, `UserUpdatedPayload`, `UserDeletedPayload` (aditivo) y se reconstruye el paquete. La contraseña solo vive en memoria durante la saga.
  - **Verification gate:** cmd:pnpm --filter @toka/contracts build && pnpm --filter @toka/user-service exec tsc --noEmit && pnpm --filter @toka/user-service exec jest --coverage=false src/application/create-user && n=$(grep -cE '^[[:space:]]*(it|test)\(' apps/user-service/src/application/create-user.spec.ts) && test "$n" -ge 4 && test "$n" -le 6 && grep -rq 'UserCreatedPayload' packages/contracts/src
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/user-service/src/users.service.ts:52-103` (saga `PENDING` → `GET /roles/{id}` → `PUT /internal/credentials/{userId}` con `{email, password, roleId, roleName, roleVersion, rolePermissions}` → `ACTIVE` + outbox `user.created`; presupuesto `SIGNUP_BUDGET_MS` por llamada; compensación `DELETE` antes de borrar el `PENDING`), `ports.ts`, `config.ts:39`; `users.service.spec.ts`. Los payloads `user.*` se construyen en `users.service.ts` con `createEnvelope` (ver `design.md` → `## Decisiones de implementación`).

- [x] 1.4 user-service: casos de uso `UpdateUser`, `DeleteUser`, `AssignRole`, `ReconcilePending` (TDD, 5 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 0 — Casos de uso`
  - **Stories:** US-EX2-42, US-EX2-41
  - **Owner profile:** backend
  - **Dependencies:** 1.3
  - **Definition of done:** prueba primero en `apps/user-service/src/application/user-lifecycle.spec.ts` (5 casos). Casos de uso con los puertos de 1.3: `update-user.ts` (cambia nombre/email/estado, `version+1`, outbox `user.updated`), `delete-user.ts` (outbox `user.deleted` con `version+1` y borrado duro en la misma operación del repositorio), `assign-role.ts` (valida con `RoleClient`, 404 si no existe sin evento; outbox `user.role.assigned` con `{userId, roleId, roleName, roleVersion}`) y `reconcile-pending.ts` (D6: `findPendingOlderThan(now - grace)`, `DELETE` credenciales y solo si se confirma `deletePending`; un fallo no aborta el resto). Todos fijan `actor` y `correlationId` recibidos del llamante.
  - **Verification gate:** cmd:pnpm --filter @toka/user-service exec tsc --noEmit && pnpm --filter @toka/user-service exec jest --coverage=false src/application/user-lifecycle && n=$(grep -cE '^[[:space:]]*(it|test)\(' apps/user-service/src/application/user-lifecycle.spec.ts) && test "$n" -ge 4 && test "$n" -le 6 && grep -q 'roleVersion' apps/user-service/src/application/assign-role.ts && grep -q 'roleName' apps/user-service/src/application/assign-role.ts
  - **mockup_ref:** n/a
  - **Evidencia:** `users.service.ts` (`update`, `remove`, `assignRole` con 404 si el rol no existe, `reconcilePending` con `RECONCILE_GRACE_MS`), `lifecycle.ts` (`ReconcileScheduler` con `RECONCILE_INTERVAL_MS`); `users.service.spec.ts`.

## Wave 1 — Adaptadores y HTTP de user-service; audit-service completo

- [x] 2.1 user-service infraestructura: repositorio Prisma con outbox transaccional, `OutboxPublisher`, clientes HTTP y `ServiceTokenProvider` (TDD, 4 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 1 — Adaptadores`
  - **Stories:** US-EX2-41, US-EX2-42
  - **Owner profile:** backend
  - **Dependencies:** 1.4
  - **Definition of done:** pruebas primero en `apps/user-service/src/infrastructure/**/*.spec.ts` (4 casos de `design.md`; total entre las 4). Implementa `infrastructure/prisma/prisma-user.repository.ts` (`persistWithOutbox`/`deleteWithOutbox` con una sola `$transaction`; `createPending` traduce la violación de unicidad a `EmailTaken`), `infrastructure/outbox/outbox-publisher.ts` (D7: `FOR UPDATE SKIP LOCKED`, `ConfirmChannel`, `assertExchange` de `EVENTS_EXCHANGE`, marca `published_at`, reintento en el siguiente ciclo, ciclo de vida de arranque/parada), `infrastructure/http/{role.client,auth-credentials.client,service-token.provider}.ts` (A1, A5–A7: timeouts/reintentos de D4 por env; `PUT` con cuerpo `{email, password, roleId, roleName, roleVersion}` e `idempotent: true`; `DELETE` con `idempotent: true`, trata 404 como éxito; token por audiencia en caché hasta `exp` menos margen) y `infrastructure/config.ts` (lectura validada de env con valores por defecto de `design.md`). Ningún `console.log`; sin secretos ni contraseñas en logs.
  - **Verification gate:** cmd:pnpm --filter @toka/user-service exec tsc --noEmit && pnpm --filter @toka/user-service exec jest --coverage=false src/infrastructure && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/user-service/src/infrastructure --include=*.spec.ts | wc -l) && test "$n" -ge 3 && test "$n" -le 6 && grep -rq 'SKIP LOCKED' apps/user-service/src/infrastructure && grep -rq 'assertExchange' apps/user-service/src/infrastructure && grep -rq 'client_credentials' apps/user-service/src/infrastructure
  - **mockup_ref:** n/a
  - **Evidencia:** `users.repository.ts` (outbox en la misma transacción), `outbox.publisher.ts:49-50` (`FOR UPDATE SKIP LOCKED`) y `:141-142` (`persistent`, `messageId=eventId`), `clients.ts` (token `client_credentials` por audiencia en caché hasta `exp`, `DELETE` trata 404 como éxito), `app.module.ts:49-71` (`@toka/http-client` con 2/3 reintentos y circuit breaker), `config.ts:37-42`; `infrastructure.spec.ts`.

- [x] 2.2 user-service interfaces: `UsersController`, `RolesGuard`, filtro de errores, `health`/`ready`, módulo, `main.ts` y runner de reconciliación (TDD, 3 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/user-crud-outbox-events.md`
  - **Spec wave slice:** `## Wave 1 — Adaptadores`
  - **Stories:** US-EX2-41, US-EX2-42
  - **Owner profile:** backend
  - **Dependencies:** 2.1
  - **Definition of done:** pruebas primero en `apps/user-service/src/interfaces/**/*.spec.ts` (3 casos de `design.md`). Rutas `POST /users`, `GET /users` (respuesta `{items, page, limit, total}`, con `page`/`limit` como en audit; cada item con `id`, `email`, `name`, `roleId`, `status`; `roleId` permite al agente resolver el nombre), `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`, `PUT /users/:id/role`, `GET /health` (liveness) y `GET /ready` (Postgres y broker alcanzables); `JwtAuthGuard` (A3) + `RolesGuard` local con `@Roles('admin')` (D8/D9); DTOs con `class-validator` (la contraseña llega solo en `POST /users` y no se devuelve ni se loguea); filtro de excepciones: `EmailTaken`/`409` de auth → 409, `SignupFailed` → 503, `RoleNotFound` → 404; `app.module.ts` cablea puertos con adaptadores, `@toka/logger` (A4), `correlationId` y el arranque del `OutboxPublisher` y del runner de reconciliación (intervalo `RECONCILE_INTERVAL_MS`); `main.ts` escucha en `PORT` (3002 por defecto). **Semilla de admin** (`infrastructure/admin-seed.ts`, proveedor de arranque tras `OutboxPublisher`): si `ADMIN_SEED_EMAIL` y `ADMIN_SEED_PASSWORD` están definidos, invoca `CreateUser` con `actor='system'` y rol `admin` (resuelto por `GET /roles/...` del rol `admin` sembrado por role-service en el cambio 3; reconciliar el identificador); idempotente (si el email ya existe, no hace nada; si role-service aún no responde, reintenta en el arranque con espera acotada y no tumba el servicio); la contraseña no se loguea. 4.ª prueba de la tarea: la semilla omite si el email existe y crea con `actor=system` si no.
  - **Verification gate:** cmd:pnpm --filter @toka/user-service exec tsc --noEmit && pnpm --filter @toka/user-service exec jest --coverage=false src/interfaces && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/user-service/src/interfaces --include=*.spec.ts | wc -l) && test "$n" -ge 2 && test "$n" -le 4 && grep -rq 'RolesGuard' apps/user-service/src/interfaces && grep -rq "'health'" apps/user-service/src/interfaces && grep -rq "'ready'" apps/user-service/src/interfaces && pnpm --filter @toka/user-service build
  - **mockup_ref:** n/a
  - **Evidencia:** `users.controller.ts` (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE`/`PUT :id/role` con `JwtAuthGuard` + `PermissionsGuard`, `users:read`/`users:write`), `health.controller.ts:17-28` (`/ready` comprueba Postgres y RabbitMQ), `lifecycle.ts` (`AdminSeedService` con `actor='system'`), `dto/user.dto.ts`, `app.module.ts`, `main.ts`; `http.spec.ts` (403 sin permiso, paginación, `ready` 503, semilla idempotente, reintento acotado).

- [x] 2.3 audit-service aplicación: `ProcessAuditEvent` (idempotente, filtro `resync`) y `RetryPolicy` (TDD, 5 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 1 — Consumidor`
  - **Stories:** US-EX2-43
  - **Owner profile:** backend
  - **Dependencies:** 1.2
  - **Definition of done:** prueba primero en `apps/audit-service/src/application/process-audit-event.spec.ts` (5 casos). `application/ports.ts` (`AuditEventRepository` con `insert(doc) → 'inserted'|'duplicate'` y `query(filter, page)`), `application/process-audit-event.ts` (valida con `isEventEnvelope`: inválido → resultado `permanent-failure`; `reason==='resync'` → `skipped` (D12); mapea actor `{userId, roles}` o `system` al documento; inserta y trata `'duplicate'` como éxito; errores del repositorio → `transient-failure`) y `application/retry-policy.ts` (`decide(result, retryCount, maxRetries=3)` → `ack | retry | dlq`; permanente → `dlq` sin reintentos).
  - **Verification gate:** cmd:pnpm --filter @toka/audit-service exec tsc --noEmit && pnpm --filter @toka/audit-service exec jest --coverage=false src/application && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/audit-service/src/application --include=*.spec.ts | wc -l) && test "$n" -ge 4 && test "$n" -le 6 && grep -rq 'resync' apps/audit-service/src/application && grep -rq 'isEventEnvelope' apps/audit-service/src/application
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/audit-service/src/audit.processor.ts` (`isEventEnvelope` → DLQ si inválido, `reason==='resync'` → ack sin insertar, duplicado = éxito, reintento hasta `maxRetries`); `audit.processor.spec.ts` (5 pruebas).

- [x] 2.4 audit-service infraestructura: repositorio Mongo y consumidor AMQP con topología, reintentos y DLQ (TDD, 3 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 1 — Consumidor`
  - **Stories:** US-EX2-43
  - **Owner profile:** backend
  - **Dependencies:** 2.3
  - **Definition of done:** pruebas primero en `apps/audit-service/src/infrastructure/**/*.spec.ts` (3 casos de `design.md`). `infrastructure/mongo/mongo-audit-event.repository.ts` (insert con traducción del código 11000 a `'duplicate'`; `query` con filtros actor/tipo/rango, `skip/limit`, orden `occurredAt` desc y `total`; sin update/delete) y `infrastructure/amqp/audit-consumer.ts` (D10, D11, D14: `assertExchange` de ambos exchanges, colas `audit.events`, `.retry` con `x-message-ttl=AUDIT_RETRY_TTL_MS`, `.dlq`, bindings tomados de `QueueBindings` de `@toka/contracts`, `prefetch`, `ack` manual; fallo transitorio → copia a `.retry` con `x-retry-count+1` y `ack`; agotado o permanente → copia a `.dlq` con `x-error`/`x-failed-at` y log con `eventId`/`correlationId`; reconexión con espera acotada; arranque/parada del ciclo de vida).
  - **Verification gate:** cmd:pnpm --filter @toka/audit-service exec tsc --noEmit && pnpm --filter @toka/audit-service exec jest --coverage=false src/infrastructure && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/audit-service/src/infrastructure --include=*.spec.ts | wc -l) && test "$n" -ge 3 && test "$n" -le 5 && grep -rq 'QueueBindings' apps/audit-service/src/infrastructure && grep -rq 'x-message-ttl' apps/audit-service/src/infrastructure && grep -rq 'audit.events.dlq' apps/audit-service/src/infrastructure
  - **mockup_ref:** n/a
  - **Evidencia:** `audit.repository.ts` (código 11000 → `duplicate`; filtros, orden `occurredAt` desc, `skip/limit`, `total`), `audit.consumer.ts:100-116` (`audit.events` con `QueueBindings`, `.retry` con `x-message-ttl`, `.dlq`, `prefetch`) y `:133` (`x-error`, `x-failed-at`); `infrastructure.spec.ts`.

- [x] 2.5 audit-service interfaces: `GET /audit/events` con RBAC, validación de consulta, `health`/`ready`, módulo y `main.ts` (TDD, 3 pruebas)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-query-api.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-44
  - **Owner profile:** backend
  - **Dependencies:** 2.4
  - **Definition of done:** pruebas primero en `apps/audit-service/src/interfaces/**/*.spec.ts` (3 casos de `design.md`). `application/query-audit.ts` (delegación al repositorio con `page`/`limit`), `interfaces/http/audit.controller.ts` (`GET /audit/events` con `actor`, `type`, `from`, `to`, `page`, `limit` 1..100, 20 por defecto; `from>to` o fecha inválida → 400; Mongo caído → 503), `JwtAuthGuard` (A3) + `RolesGuard` local `@Roles('admin')`, `GET /health` y `GET /ready` (Mongo y consumidor conectados), `app.module.ts` con `@toka/logger` (A4) y arranque del consumidor, `main.ts` en `PORT` (3004 por defecto).
  - **Verification gate:** cmd:pnpm --filter @toka/audit-service exec tsc --noEmit && pnpm --filter @toka/audit-service exec jest --coverage=false src/interfaces && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/audit-service/src/interfaces --include=*.spec.ts | wc -l) && test "$n" -ge 2 && test "$n" -le 4 && grep -rq 'RolesGuard' apps/audit-service/src/interfaces && grep -rq "'ready'" apps/audit-service/src/interfaces && pnpm --filter @toka/audit-service build
  - **mockup_ref:** n/a
  - **Evidencia:** `audit.controller.ts` (`GET /audit/events` con `@RequirePermissions(audit:read)`, `from>to` → 400, store caído → 503; `/health`; `/ready` con Mongo y consumidor), `dto/audit-query.dto.ts` (ISO-8601, `limit` 1..100, 20 por defecto); `audit.controller.spec.ts`.

## Wave 2 — Empaquetado, humo y cierre

- [x] 3.1 Dockerfile por servicio, `.dockerignore` y variables de entorno faltantes
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/service-packaging-quality.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado`
  - **Stories:** US-EX2-45
  - **Owner profile:** backend
  - **Dependencies:** 2.2, 2.5
  - **Definition of done:** `apps/user-service/Dockerfile` y `apps/audit-service/Dockerfile` multi-etapa según D16 (contexto raíz; pnpm vía corepack con la versión de `packageManager`; compila `@toka/*` y el servicio; `prisma generate` en user-service; imagen final con `USER node`, `NODE_ENV=production`, `HEALTHCHECK`, `CMD node dist/main.js`); el `CMD` de user-service ejecuta `prisma migrate deploy` antes de arrancar (p. ej. `sh -c "npx prisma migrate deploy && node dist/main.js"`; `prisma` está en `dependencies`, 1.1; la migración usa `DATABASE_URL`); `.dockerignore` en la raíz (si ya existe —p. ej. creado por el cambio 3— se **extiende** sin pisar lo ajeno; excluye `node_modules`, `dist`, `.git`, `.env`, `infra/env/*.env`, `secrets/`, `coverage`). `infra/env/user-service.env.example` y `infra/env/audit-service.env.example` completos con las variables de `design.md` y de `config.ts` (solo se **añaden** las faltantes, con valores por defecto no secretos; los marcadores secretos existentes no se tocan), incluidas `ADMIN_SEED_EMAIL` (valor por defecto no secreto) y `ADMIN_SEED_PASSWORD` como marcador `change-me`. **Nota de seguimiento (cambio 5):** `scripts/bootstrap-env.sh` debe generar `ADMIN_SEED_PASSWORD` (aleatoria) y mostrarla una vez al operador; este cambio solo añade la variable. No se modifica `docker-compose.yml` (cambio 5).
  - **Verification gate:** cmd:docker build -f apps/user-service/Dockerfile -t toka/user-service:dev . && docker build -f apps/audit-service/Dockerfile -t toka/audit-service:dev . && test "$(docker run --rm --entrypoint id toka/user-service:dev -u)" != "0" && test "$(docker run --rm --entrypoint id toka/audit-service:dev -u)" != "0" && grep -q 'node_modules' .dockerignore && grep -q 'secrets' .dockerignore && grep -q 'RECONCILE_GRACE_MS' infra/env/user-service.env.example && grep -q 'AUDIT_RETRY_TTL_MS' infra/env/audit-service.env.example && grep -q 'ADMIN_SEED_PASSWORD' infra/env/user-service.env.example && grep -q 'migrate deploy' apps/user-service/Dockerfile
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/user-service/Dockerfile` (`USER node`, `NODE_ENV=production`, `HEALTHCHECK`, `CMD` con `prisma migrate deploy`), `apps/audit-service/Dockerfile` (`CMD node dist/main.js`), `.dockerignore` raíz y `apps/{user,audit}-service/Dockerfile.dockerignore`, `infra/env/user-service.env.example` (`SIGNUP_BUDGET_MS`, `RECONCILE_GRACE_MS`, `ADMIN_SEED_*`), `infra/env/audit-service.env.example` (`AUDIT_RETRY_TTL_MS`, `AUDIT_MAX_RETRIES`); `scripts/bootstrap-env.sh:97-98` genera `ADMIN_SEED_PASSWORD`.

- [ ] 3.2 Prueba de humo del pipeline de auditoría (RabbitMQ + Mongo reales + imagen de audit-service)
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/audit-event-consumer.md`
  - **Spec wave slice:** `## Wave 2 — Humo`
  - **Stories:** US-EX2-43
  - **Owner profile:** backend
  - **Dependencies:** 3.1
  - **Definition of done:** `scripts/smoke-audit-pipeline.sh` (bash, idempotente, con `trap` de limpieza, esperas con tope de tiempo): ejecuta `scripts/bootstrap-env.sh` si falta `.env`; `docker compose up -d --wait mongo rabbitmq`; arranca `toka/audit-service:dev` en la red `toka_backend` con `infra/env/audit-service.env`; publica en `toka.events` (con `rabbitmqadmin` vía `docker compose exec -T rabbitmq` o, si falta, con `node` dentro de la imagen de audit) (1) un evento `user.created` válido, (2) el mismo `eventId` otra vez, (3) un evento `role.updated` con `reason=resync`, (4) un cuerpo no JSON; comprueba por `docker compose exec -T mongo mongosh` que existe exactamente 1 documento del evento (1)/(2), 0 del (3) y que `audit.events.dlq` contiene >=1 mensaje (4) (`rabbitmqctl list_queues`). Termina en 0 solo si todo se cumple; no deja contenedores propios en marcha y **nunca ejecuta `docker compose down -v`** (solo detiene su propio contenedor y borra sus propias colas/documentos de prueba). **Restricción de orquestación:** no debe correr en paralelo con la tarea 3.3 del cambio 3 (que sí hace `down -v` sobre el mismo proyecto `toka`); el orquestador las serializa.
  - **Verification gate:** cmd:bash -n scripts/smoke-audit-pipeline.sh && bash scripts/smoke-audit-pipeline.sh
  - **mockup_ref:** n/a
  - **Evidencia:** no existe `scripts/smoke-audit-pipeline.sh`. Ver `## Evolución`.

- [ ] 3.3 Verificación integral (cobertura >=70, lint, build, tope de pruebas) y trazabilidad
  - **Change:** build-user-audit-services
  - **Spec:** `openspec/changes/build-user-audit-services/specs/service-packaging-quality.md`
  - **Spec wave slice:** `## Wave 2 — Cierre`
  - **Stories:** US-EX2-45
  - **Owner profile:** backend
  - **Dependencies:** 3.1, 3.2
  - **Definition of done:** `pnpm --filter @toka/user-service test` y `pnpm --filter @toka/audit-service test` pasan con cobertura de líneas >=70 % (umbral de `jest.config.base.js`; sin ampliar exclusiones más allá de D15; si falta cobertura se añaden pruebas dentro del presupuesto, máx. 30 en el cambio); lint y build limpios para ambos servicios (con `--filter`, nunca `pnpm -r` desnudo). `docs/traceability.md`: EX2-R02, EX2-R03 y EX2-R08 pasan a estado "Implementado" con las rutas reales (`apps/user-service/`, `apps/audit-service/`); en `docs/adrs/ADR-004-async-rabbitmq-events.md` se conservan/actualizan las marcas Implementado/Evolución de lo realizado aquí (outbox de user-service, DLQ, retardo fijo y escalonado como Evolución). Solo se editan archivos bajo `docs/`.
  - **Verification gate:** cmd:pnpm --filter @toka/user-service test && pnpm --filter @toka/audit-service test && pnpm --filter @toka/user-service --filter @toka/audit-service lint && pnpm --filter @toka/user-service --filter @toka/audit-service build && node -e "for (const s of ['user-service','audit-service']) { const t=require('./apps/'+s+'/coverage/coverage-summary.json').total; if (t.lines.pct<70) { console.error(s, t.lines.pct); process.exit(1); } }" && n=$(grep -rhE '^[[:space:]]*(it|test)\(' apps/user-service/src apps/audit-service/src --include=*.spec.ts | wc -l) && test "$n" -le 30 && grep -q 'build-user-audit-services' docs/traceability.md && grep -E 'EX2-R03' docs/traceability.md | grep -q 'Implementado'
  - **mockup_ref:** n/a
  - **Evidencia:** cobertura local de líneas: user-service 84,1 %, audit-service 85,71 % (`coverage/coverage-summary.json`, no versionado); el cambio suma 38 pruebas (user 23, audit 15); `docs/traceability.md` mantiene EX2-R02, R03 y R08 en `Planeado`. Ver `## Evolución`.

## Evolución

- 3.2 — El pipeline de auditoría se verifica con las pruebas de `audit.processor.spec.ts` e `infrastructure.spec.ts` (duplicado, `resync`, reintento y DLQ), con `scripts/smoke.sh` (`user.created` visible en `/api/audit/events`) y con `e2e/audit.spec.ts`. El siguiente paso es el smoke dedicado contra RabbitMQ y Mongo reales.
- 3.3 — Ambos servicios superan el umbral de 70 % de líneas; la suite tiene 38 pruebas, por encima del techo de 30 fijado en el plan. La actualización de EX2-R02, R03 y R08 en `docs/traceability.md` y de las marcas de ADR-004 se resuelve en la reconciliación de documentación del proyecto.
