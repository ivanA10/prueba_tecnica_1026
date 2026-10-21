# Tasks — build-auth-role-services

> 13 tareas, 4 specs, 3 waves (Wave 0 = 3, Wave 1 = 5, Wave 2 = 5). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` (sin frontend). TDD obligatorio en Wave 1 y 3.1/3.4 (prueba primero; presupuesto en `design.md` → `## Testing strategy`: **29 pruebas**, topes por tarea 6 en 2.1 y 2.5, ningún archivo >8).
> **Precondición**: `bootstrap-monorepo-platform` (cambio 2) completo: existen `pnpm-workspace.yaml`, `jest.config.base.js`, `tsconfig.base.json`, los paquetes `@toka/{contracts,logger,jwt-guard}` y `.env`/compose del cambio 2 (este para 3.3). Las APIs de cambio 2 usadas están en `design.md` → "Supuestos sobre APIs del cambio 2" (S1–S12, **reconcile after change 2**).
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin `grep -P`, sin `.` suelto para acentos. Los gates `docker` requieren Docker en el host. Versiones de librerías: `needs-verification` — fijar al instalar en 1.1.
> **Orden y paralelismo**: Wave 0: 1.1 primero (instala `prisma` y fija el lockfile); 1.2 y 1.3 (perfil `database`) después y en paralelo. Wave 1: 2.1 → {2.2, 2.3}; 2.4 tras 2.1 y 2.2; 2.5 (role-service) es independiente de las de auth (pueden ir en paralelo). Las tareas que tocan `apps/auth-service/src/app.module.ts` van en serie por esa razón (design D3). Las tareas 2.x NO ejecutan `pnpm add` (D2).
> **Instalación**: ninguna tarea ni gate ejecuta `pnpm install` ni `pnpm -r` desnudo (el hook del harness bloquea instalaciones a mitad de wave). La instalación de dependencias es un **paso previo a cada wave que ejecuta el orquestador una sola vez**; 1.1 solo edita manifiestos (`package.json`) y el orquestador instala tras 1.1. Los gates filtran por paquete (`pnpm --filter <pkg>`).
> Cada prueba nueva se escribe antes que el código; `jest` (v30) de cada gate parcial se ejecuta con patrón posicional: `jest --coverage=false <patrón>` (`--testPathPattern` fue renombrado), y el umbral de 70 % se exige solo en 3.4.

> Reconciliación as-built (2026-10-21): `[x]` solo para tareas verificadas en disco; cada tarea lleva su línea **Evidencia**. Las tareas no entregadas tal como se planearon quedan sin marcar y se describen en `## Evolución`. La autorización por rol (`@Roles('admin')`) de este plan evolucionó después a autorización por permisos (`PermissionsGuard` de `@toka/jwt-guard`); ver `design.md` → `## Decisiones de implementación`.

## Wave 0 — Esqueletos, dependencias y esquemas de datos

- [x] 1.1 Esqueletos NestJS de `auth-service` y `role-service` con manifiestos de dependencias, Jest y TS (la instalación la hace el orquestador)
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 0 — Esqueleto, dependencias y esquemas de datos`
  - **Stories:** US-EX2-15
  - **Owner profile:** backend
  - **Dependencies:** none (precondición: cambio 2 completo)
  - **Definition of done:** existen `apps/auth-service` y `apps/role-service` con `package.json` (`name: @toka/auth-service|@toka/role-service`; scripts `build` = `prisma generate` + `tsc -p tsconfig.build.json` + copia multiplataforma de `src/generated` a `dist/generated` mediante `scripts/copy-generated.cjs`, `test` = `jest`, `lint` = `eslint src`), `tsconfig.json` y `tsconfig.build.json` (extienden la base), `jest.config.js` (extiende `jest.config.base.js` y **añade** las exclusiones de `design.md` → Testing strategy: `src/main.ts`, `src/**/*.module.ts`, `src/generated/**`, `src/infrastructure/persistence/**`, `src/infrastructure/messaging/**`, `src/infrastructure/redis/**`; mantiene `coverageThreshold.global.lines: 70`), `src/main.ts` (bootstrap con `@toka/logger`: middleware de `correlationId`, interceptor, `ValidationPipe` con `whitelist`, `cookie-parser` solo en auth), `src/app.module.ts` mínimo, `GET /health` y `GET /ready` (ambos 200 `{status:'ok'}`, públicos, sin guard), módulo de configuración que falla al arrancar si falta una variable obligatoria (`design.md` → Configuración) y la estructura de capas vacía con `.gitkeep`. **Dependencias (todas declaradas aquí en los `package.json`; esta tarea NO ejecuta `pnpm install`: el orquestador instala una vez antes de las pruebas/gates)**: ambos — `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`, `class-validator`, `class-transformer`, `@prisma/client`, `ioredis`, `amqplib`, `@toka/contracts|logger|jwt-guard` (`workspace:*`); solo auth — `jose` (v5, igual que `jwt-guard`), `@node-rs/argon2`, `cookie-parser`; dev — `prisma`, `typescript`, `ts-jest`, `jest`, `@nestjs/testing`, `supertest` y sus `@types`. `.gitignore` añade `apps/*/src/generated/`. Ningún servicio importa código del otro.
  - **Verification gate:** cmd:test -f pnpm-workspace.yaml && test -f jest.config.base.js && for p in contracts logger jwt-guard; do test -d packages/$p || exit 1; done && pnpm --filter "./packages/*" build && for s in auth role; do node -e "const p=require('./apps/$s-service/package.json');const d=p.dependencies||{};process.exit(p.name==='@toka/$s-service'&&d['@toka/contracts']==='workspace:*'&&d['@toka/logger']==='workspace:*'&&d['@toka/jwt-guard']==='workspace:*'&&d['@prisma/client']&&d.amqplib&&d.ioredis?0:1)" || exit 1; done && node -e "const d=require('./apps/auth-service/package.json').dependencies;process.exit(d.jose&&d['@node-rs/argon2']?0:1)" && for s in auth role; do test -f apps/$s-service/src/main.ts && test -d apps/$s-service/node_modules && pnpm --filter @toka/$s-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/$s-service exec jest --passWithNoTests --coverage=false && node -e "const c=require('./apps/$s-service/jest.config.js');process.exit(c.coverageThreshold.global.lines===70&&JSON.stringify(c.collectCoverageFrom).includes('src/main.ts')?0:1)" || exit 1; done && grep -q 'src/generated' .gitignore
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/{auth,role}-service/{package.json,tsconfig.json,jest.config.js,src/main.ts,src/app.module.ts}`, `src/config/config.ts` (falla al arrancar si falta una variable obligatoria), `GET /health` y `GET /ready` en `src/interfaces/http/controllers.ts`, `scripts/copy-generated.cjs`, `.gitignore:42` (`apps/*/src/generated/`); `jest.config.js` con las exclusiones de cableado.

- [x] 1.2 Esquema Prisma y migración inicial de `auth_db`
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 0 — Esqueleto, dependencias y esquemas de datos`
  - **Stories:** US-EX2-15
  - **Owner profile:** database
  - **Dependencies:** 1.1
  - **Definition of done:** `apps/auth-service/prisma/schema.prisma` define, con `@@map`/`@map` a snake_case y generador con `output = "../src/generated/prisma"` (sintaxis `needs-verification` según versión de Prisma): `credentials` (`user_id` uuid PK, `email` único, `password_hash`, `status` enum `PENDING|ACTIVE|DISABLED`, `created_at`, `updated_at`), `user_roles_projection` (`user_id` PK, `role_id`, `user_last_version`, `updated_at`), `role_names_projection` (`role_id` PK, `role_name`, `last_version`), `refresh_tokens` (`id` PK, `token_hash` único, `user_id`, `family_id`, `expires_at`, `rotated_at?`, `revoked_at?`, `created_at`, índices por `user_id` y `family_id`) y `processed_events` (`event_id` PK, `processed_at`). Migración `prisma/migrations/0001_init/migration.sql` + `migration_lock.toml` generada con `prisma migrate diff` desde cero (no requiere Postgres). `prisma generate` deja el cliente en `src/generated/prisma`. Sin lógica de negocio.
  - **Verification gate:** cmd:export DATABASE_URL=postgresql://u:p@localhost:5432/auth_db && test -f apps/auth-service/prisma/schema.prisma && pnpm --filter @toka/auth-service exec prisma validate && pnpm --filter @toka/auth-service exec prisma generate && test -d apps/auth-service/src/generated/prisma && test -f apps/auth-service/prisma/migrations/migration_lock.toml && for t in credentials user_roles_projection role_names_projection refresh_tokens processed_events; do grep -q "CREATE TABLE \"$t\"" apps/auth-service/prisma/migrations/0001_init/migration.sql || exit 1; done && for c in user_last_version last_version family_id token_hash password_hash; do grep -q "$c" apps/auth-service/prisma/migrations/0001_init/migration.sql || exit 1; done
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/auth-service/prisma/schema.prisma` (`credentials`, `user_roles_projection`, `role_names_projection`, `refresh_tokens`, `processed_events`; `output = "../src/generated/prisma"`), `prisma/migrations/0001_init/migration.sql`, `migration_lock.toml`. Ampliado con `0002_role_permissions/migration.sql` (columna `permissions TEXT[]`).

- [x] 1.3 Esquema Prisma y migración inicial de `role_db`
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 0 — Esqueleto, dependencias y esquemas de datos`
  - **Stories:** US-EX2-15
  - **Owner profile:** database
  - **Dependencies:** 1.1
  - **Definition of done:** `apps/role-service/prisma/schema.prisma` define `roles` (`id` uuid PK con default, `name` único, `description?`, `permissions` text[], `version` int default 1, `created_at`, `updated_at`) con `@@map("roles")`, mismo generador con `output` propio (`../src/generated/prisma`), y la migración `0001_init` + `migration_lock.toml` generada desde cero. `prisma generate` deja el cliente en `src/generated/prisma`.
  - **Verification gate:** cmd:export DATABASE_URL=postgresql://u:p@localhost:5432/role_db && test -f apps/role-service/prisma/schema.prisma && pnpm --filter @toka/role-service exec prisma validate && pnpm --filter @toka/role-service exec prisma generate && test -d apps/role-service/src/generated/prisma && test -f apps/role-service/prisma/migrations/migration_lock.toml && grep -q 'CREATE TABLE "roles"' apps/role-service/prisma/migrations/0001_init/migration.sql && grep -q 'version' apps/role-service/prisma/migrations/0001_init/migration.sql && grep -q 'permissions' apps/role-service/prisma/migrations/0001_init/migration.sql
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/role-service/prisma/schema.prisma` (`roles` con `name` único, `permissions String[]`, `version` default 1), `prisma/migrations/0001_init/migration.sql`, `migration_lock.toml`.

## Wave 1 — Lógica de servicios (TDD; secuencia intra-wave en el encabezado)

- [x] 2.1 `auth-service`: login argon2id, emisión RS256 con `kid`/`aud`/`iss`, JWKS, `/oauth/token` y publicación con respaldo `audit.fallback`
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/auth-tokens.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-09, US-EX2-11, US-EX2-12
  - **Owner profile:** backend
  - **Dependencies:** 1.2
  - **Definition of done:** capas `domain` (`Credential`, estados, errores), `application` (puertos `CredentialRepository`, `ProjectionRepository`, `RefreshTokenRepository`, `PasswordHasher`, `TokenIssuer`, `EventPublisher`, `Clock`; casos `LoginUseCase`, `IssueServiceTokenUseCase`; `ResilientEventPublisher` con reintento en memoria y `audit.fallback`), `infrastructure` (hasher `@node-rs/argon2` argon2id; emisor `jose` RS256 que carga la clave desde `JWT_PRIVATE_KEY_FILE` y deriva la pública para el JWKS; repositorios Prisma; adaptador AMQP con `assertExchange` de `EVENTS_EXCHANGE`/`DLX_EXCHANGE`) e `interfaces` (`POST /auth/login` con cookie `refresh_token` y creación del primer refresh, `GET /.well-known/jwks.json`, `POST /oauth/token`, DTOs con `class-validator`). Respuesta 401 uniforme y hash ficticio para usuario inexistente (D20); `roles` por join de proyecciones con `role.unresolved` (D11); `app.module.ts` cableado. **6 pruebas HTTP/unitarias con dobles (primero)**, según `design.md` → Testing strategy. `domain` y `application` no importan `@prisma/client`, `ioredis`, `amqplib` ni `jose`. Build/lint/tsc verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/auth-service exec jest --coverage=false "(crypto|login|oauth|resilient-publisher)" && pnpm --filter @toka/auth-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/auth-service lint && grep -rq 'audit.fallback' apps/auth-service/src && grep -rq 'RS256' apps/auth-service/src && grep -rq 'jwks.json' apps/auth-service/src && ! grep -rEq "from '(@prisma/client|ioredis|amqplib|jose)'" apps/auth-service/src/domain apps/auth-service/src/application
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/auth-service/src/application/token-service.ts` (login con 401 uniforme y hash ficticio, `auth.login.*`), `src/infrastructure/crypto/crypto.ts` (argon2id con `@node-rs/argon2`; firma RS256 con `node:crypto` y JWKS derivado de la clave privada), `src/application/resilient-publisher.ts` (`audit.fallback`), `src/interfaces/http/controllers.ts` (`POST /auth/login`, `GET /.well-known/jwks.json`, `POST /oauth/token`); pruebas `auth.http.spec.ts` (login con cookie HttpOnly y token RS256 verificable; 401 idéntico; JWKS y `client_credentials`) y `projection.spec.ts` (argon2id, `audit.fallback`).

- [x] 2.2 `auth-service`: refresh rotatorio por familia, logout con denylist por `jti` y revocación por usuario
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/auth-tokens.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-10
  - **Owner profile:** backend
  - **Dependencies:** 2.1
  - **Definition of done:** `RefreshUseCase` (cookie `refresh_token`, hash SHA-256 en BD, rotación con `family_id`, reutilización revoca la familia, usuario no `ACTIVE` rechazado), `LogoutUseCase` (`auth:deny:jti:{jti}` con TTL restante, revoca familia, borra cookie), `RevokeUserSessions` (`auth:deny:user:{userId}` en epoch **segundos** con `EX=ACCESS_TOKEN_TTL_SECONDS`, revoca todos los refresh), puerto `DenylistWriter` con adaptador `ioredis` (`infrastructure/redis/`), endpoints `POST /auth/refresh` y `POST /auth/logout` (este con `JwtAuthGuard` y resolvedor de claves en proceso, `audience=['toka-api','auth-service']`, D9), `RolesGuard` y `@Roles` de auth (D6) creados aquí para reutilizarlos en 2.3. **5 pruebas (primero)**. Build/lint/tsc verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/auth-service exec jest --coverage=false "(refresh|logout|revoke)" && pnpm --filter @toka/auth-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/auth-service lint && grep -rq 'auth:deny:jti:' apps/auth-service/src && grep -rq 'auth:deny:user:' apps/auth-service/src && grep -rq 'sha256' apps/auth-service/src && test -f apps/auth-service/src/interfaces/http/roles.guard.ts
  - **mockup_ref:** n/a
  - **Evidencia:** `token-service.ts` (`refresh` con SHA-256 y rotación por `familyId`, reutilización revoca la familia; `logout`; `revokeUserSessions` en epoch segundos), `src/infrastructure/redis/redis-denylist.ts`, `src/interfaces/http/roles.guard.ts` (`RolesGuard`/`@Roles`); pruebas `auth.http.spec.ts` (rotación y reutilización, refresh de usuario no `ACTIVE`, logout con TTL restante).

- [x] 2.3 `auth-service`: `PUT/DELETE /internal/credentials/{userId}` idempotentes solo para tokens de servicio
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/auth-credentials-projection.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-11
  - **Owner profile:** backend
  - **Dependencies:** 2.1, 2.2
  - **Definition of done:** `UpsertCredentialsUseCase` (crea `PENDING` con hash argon2id, siembra `user_roles_projection` con `user_last_version=0` y `role_names_projection` si trae `roleName`/`roleVersion`; repetición idempotente sin degradar `ACTIVE`/`DISABLED`; el email se normaliza a minúsculas; **si el email ya pertenece a otro `userId` responde 409**, contrato del que depende el cambio 4) y `DeleteCredentialsUseCase` (borra credencial y revoca refresh; idempotente), controlador `internal-credentials` protegido con `JwtAuthGuard` + `@Roles('service')` (403 en otro caso); la contraseña no se loguea. **3 pruebas (primero)**; el caso 409 se incluye como aserción adicional de la prueba de idempotencia (sin añadir pruebas). Build/lint/tsc verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/auth-service exec jest --coverage=false "internal-credentials" && pnpm --filter @toka/auth-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/auth-service lint && grep -rq 'internal/credentials' apps/auth-service/src && grep -rq "Roles('service')" apps/auth-service/src
  - **mockup_ref:** n/a
  - **Evidencia:** `src/application/credentials-service.ts` (email normalizado, 409 `email_taken`, `PENDING` idempotente sin degradar estado), `controllers.ts` (`InternalCredentialsController` con `JwtAuthGuard` + `RolesGuard` `@Roles('service')`); prueba `auth.http.spec.ts` "internal credentials: 403 without service role; PUT is idempotent (201 then 200); 409 on foreign email; DELETE revokes".

- [x] 2.4 `auth-service`: consumidor `auth.user-projection` con proyecciones versionadas, reintentos y DLQ
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/auth-credentials-projection.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-12
  - **Owner profile:** backend
  - **Dependencies:** 2.1, 2.2
  - **Definition of done:** `HandleProjectionEventUseCase` (idempotencia por `processed_events` en la misma transacción; reglas por tipo y por versión de agregado de la spec; `user.updated(DISABLED)` y `user.deleted` invocan `RevokeUserSessions`), `RetryPolicy` en `application` (clasifica error permanente → DLQ, transitorio → `.retry` con `x-retry-count+1` y expiración de `RETRY_DELAYS_MS`, superado `MAX_RETRIES` → DLQ), y adaptador `infrastructure/messaging` que declara `auth.user-projection` (bindings de `QueueBindings`), `.retry` (DLX hacia la cola principal) y `.dlq`, y consume con `ack`/`nack` explícitos. **`user.created` activa una credencial `PENDING` independientemente del orden de versión respecto de `user.role.assigned`** (la activación no se condiciona a que `aggregateVersion > user_last_version` cuando la credencial sigue `PENDING`; la versión solo gobierna la proyección de rol y nunca reactiva un `DISABLED`). Payloads `user.*` según supuesto S5 (tolerar campos extra; campos obligatorios ausentes = permanente). **5 pruebas (primero)** con el consumidor probado sobre un canal doble. Build/lint/tsc verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/auth-service exec jest --coverage=false "projection" && pnpm --filter @toka/auth-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/auth-service lint && grep -rq 'auth.user-projection' apps/auth-service/src && grep -rqi 'retry' apps/auth-service/src/application && grep -rq 'processed_events\|processedEvent' apps/auth-service/src
  - **mockup_ref:** n/a
  - **Evidencia:** `src/application/projection-handler.ts` (reglas por tipo y versión, `PermanentError` → DLQ, reintento con `RETRY_DELAYS_MS`), `src/infrastructure/messaging/amqp.ts:60-68` (`auth.user-projection` con `QueueBindings` + `role.created`, `.retry`, `.dlq`); `projection.spec.ts` (activación solo de `PENDING`, `DISABLED` revoca sesiones, versiones viejas ignoradas, DLQ y reintentos crecientes).

- [x] 2.5 `role-service`: CRUD con `version`, `GET /roles/{id}` con caché, RBAC y publicación `role.*`
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/role-management.md`
  - **Spec wave slice:** `## Wave 1 — CRUD, caché, RBAC y publicación`
  - **Stories:** US-EX2-13
  - **Owner profile:** backend
  - **Dependencies:** 1.1, 1.3
  - **Definition of done:** capas con puertos `RoleRepository`, `RoleCache`, `EventPublisher`; casos `CreateRole`, `UpdateRole` (incremento atómico de `version`; `role.updated` siempre y `role.permissions.changed` si cambió `permissions`, misma `aggregateVersion`, D17), `GetRole` (cache-aside `role:perm:{roleId}`, invalidación en `PUT`, Redis caído = BD + `warn`), `ListRoles`; repositorio Prisma, adaptador `ioredis` y adaptador AMQP (`assertExchange`); controlador `roles` con DTO; `JwtAuthGuard` (`audience=['toka-api','role-service']`, `jwksUri=AUTH_JWKS_URL`, `RedisDenylistReader`) + `RolesGuard`/`@Roles` propio (`admin` escritura y listado; `admin` o `service` para `GET /roles/{id}`); 409 por nombre duplicado, 404 por id inexistente; fallo de publicación → log `role.publish.failed` sin fallar. Sin `DELETE`. **6 pruebas HTTP con dobles (primero; tope presupuestado)**. Build/lint/tsc verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/role-service exec jest --coverage=false "roles" && pnpm --filter @toka/role-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/role-service lint && grep -rq 'role:perm:' apps/role-service/src && grep -rq 'permissions.changed\|PERMISSIONS_CHANGED' apps/role-service/src && test -f apps/role-service/src/interfaces/http/roles.guard.ts && ! grep -rq 'Delete(' apps/role-service/src/interfaces && ! grep -rEq "from '(@prisma/client|ioredis|amqplib)'" apps/role-service/src/domain apps/role-service/src/application
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/role-service/src/application/role-service.ts` (CRUD con `version`, 409 por nombre y por versión, `role.updated` + `role.permissions.changed`), `src/infrastructure/redis/redis-role-cache.ts` (`role:perm:{id}`, `warn` si Redis falla), `src/infrastructure/messaging/amqp.ts`, `src/interfaces/http/controllers.ts` (`POST`/`GET`/`GET :id`/`PUT`, sin `DELETE`); `roles.http.spec.ts`. La autorización actual usa `@RequirePermissions(roles:read|roles:write)` y `@AllowServiceToken()` en `GET /roles/:id`.

## Wave 2 — Cierre, empaquetado y verificación

- [x] 3.1 `role-service`: re-sincronización del catálogo al arrancar (`actor=system`, `reason=resync`)
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/role-management.md`
  - **Spec wave slice:** `## Wave 2 — Re-sincronización al arrancar`
  - **Stories:** US-EX2-14
  - **Owner profile:** backend
  - **Dependencies:** 2.5
  - **Definition of done:** `ResyncRolesUseCase` invocado desde `OnApplicationBootstrap` sin bloquear el arranque: por cada rol publica `role.updated` con `actor='system'`, `reason='resync'`, `aggregateVersion=version` y `eventId=deterministicEventId(roleId, version)` (de `@toka/contracts`); broker caído → `warn` y continúa. **Seed del rol `admin`** (decisión del orquestador): al arrancar, antes del re-sync, `SeedAdminRoleUseCase` crea el rol `admin` si no existe (idempotente por `name`; `permissions` mínimas `['*']`; `version` 1; publica `role.created` solo cuando lo crea); el primer usuario admin lo siembra el cambio 4. La aserción de idempotencia del seed se añade a la prueba de re-sync (sin superar 2 pruebas). **2 pruebas (primero)**. Build/lint/tsc verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/role-service exec jest --coverage=false "resync" && pnpm --filter @toka/role-service exec tsc --noEmit -p tsconfig.json && pnpm --filter @toka/role-service lint && grep -rq 'resync' apps/role-service/src && grep -rq 'deterministicEventId' apps/role-service/src && grep -rq "'admin'" apps/role-service/src/application
  - **mockup_ref:** n/a
  - **Evidencia:** `role-service.ts` (`seedAdmin` con `['*']`, `seedExampleRoles` para `operador` y `auditor`, `resync()` con `actor='system'`, `reason='resync'` y `deterministicEventId`), `src/app.module.ts:32-41` (seeds y re-sync en `onApplicationBootstrap`; el re-sync no bloquea y registra `warn` si falla); pruebas `roles.http.spec.ts` (seed admin idempotente y re-sync determinista; seed de `operador`/`auditor`).

- [x] 3.2 `Dockerfile` multi-etapa por servicio (contexto raíz del monorepo)
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y verificación`
  - **Stories:** US-EX2-15
  - **Owner profile:** backend
  - **Dependencies:** 2.3, 2.4, 2.5
  - **Definition of done:** `apps/auth-service/Dockerfile` y `apps/role-service/Dockerfile`: base Node 22 glibc (p. ej. `node:22-slim`; `openssl` para el motor de Prisma si la versión lo exige, `needs-verification`), `corepack` con el `packageManager` del `package.json`, `pnpm install --frozen-lockfile` filtrado al servicio y sus dependencias de workspace, compilación de `@toka/*` y del servicio (incluye `prisma generate` y copia a `dist/generated`), etapa final con solo producción, `WORKDIR /app/apps/<svc>`, usuario no root (`USER`), `EXPOSE` 3001/3003, `CMD` que ejecuta `prisma migrate deploy` y luego `node dist/main.js`. Un `.dockerignore` en la raíz excluye `node_modules`, `.env*`, `secrets/`, `coverage/`, `dist/` (añadirlo solo si no existe; si existe, ampliarlo). La imagen no contiene `secrets/` ni `.env`.
  - **Verification gate:** cmd:grep -q '^USER ' apps/auth-service/Dockerfile && grep -q '^USER ' apps/role-service/Dockerfile && grep -q 'migrate deploy' apps/auth-service/Dockerfile && grep -q 'migrate deploy' apps/role-service/Dockerfile && docker build -f apps/auth-service/Dockerfile -t toka-auth-service:verify . && docker build -f apps/role-service/Dockerfile -t toka-role-service:verify . && for s in auth role; do docker run --rm --entrypoint sh toka-$s-service:verify -c "test -f dist/main.js && test ! -e /app/secrets && test ! -e /app/.env && node -e \"require('./dist/app.module.js')\"" || exit 1; done
  - **mockup_ref:** n/a
  - **Evidencia:** `apps/auth-service/Dockerfile` y `apps/role-service/Dockerfile` (`node:22-slim` + `openssl`, `corepack`, `pnpm install --frozen-lockfile --filter "@toka/<svc>..."`, `USER node`, `EXPOSE 3001`/`3003`, `CMD` con `prisma migrate deploy` y `node dist/main.js`); `.dockerignore` raíz excluye `node_modules`, `dist`, `coverage`, `secrets`, `.env*`, `infra/env/*.env`.

- [ ] 3.3 Smoke de migraciones: aplicar `0001_init` con `auth_user` y `role_user` sobre el Postgres del cambio 2
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y verificación`
  - **Stories:** US-EX2-15
  - **Owner profile:** database
  - **Dependencies:** 1.2, 1.3 (precondición: compose y `scripts/bootstrap-env.sh` del cambio 2)
  - **Definition of done:** con solo `postgres` levantado por el compose del cambio 2, `apps/auth-service/prisma/migrations/0001_init/migration.sql` se aplica como `auth_user` sobre `auth_db` y `apps/role-service/.../migration.sql` como `role_user` sobre `role_db`, sin errores (`ON_ERROR_STOP`), y existen las 5 tablas de auth y la de role. Si falla por permisos sobre el esquema `public` (supuesto S10), la tarea reporta `BLOCKED` con la corrección necesaria en `infra/postgres/init/**` (cambio 2/5): **no** se edita infraestructura del cambio 2 ni se usa el administrador para la migración. El gate limpia con `docker compose down -v`.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && set -a && . ./.env && set +a && ( docker compose up -d --wait postgres && docker compose exec -T -e PGPASSWORD="$AUTH_DB_PASSWORD" postgres psql -h postgres -U auth_user -d auth_db -v ON_ERROR_STOP=1 -q < apps/auth-service/prisma/migrations/0001_init/migration.sql && docker compose exec -T -e PGPASSWORD="$ROLE_DB_PASSWORD" postgres psql -h postgres -U role_user -d role_db -v ON_ERROR_STOP=1 -q < apps/role-service/prisma/migrations/0001_init/migration.sql && test "$(docker compose exec -T -e PGPASSWORD="$AUTH_DB_PASSWORD" postgres psql -h postgres -U auth_user -d auth_db -tAc "select count(*) from information_schema.tables where table_schema='public' and table_name in ('credentials','refresh_tokens','user_roles_projection','role_names_projection','processed_events')" | tr -d '\r')" = 5 && test "$(docker compose exec -T -e PGPASSWORD="$ROLE_DB_PASSWORD" postgres psql -h postgres -U role_user -d role_db -tAc "select count(*) from information_schema.tables where table_schema='public' and table_name='roles'" | tr -d '\r')" = 1 ); rc=$?; docker compose down -v; exit $rc
  - **mockup_ref:** n/a
  - **Evidencia:** sin script ni salida versionada del smoke de migraciones. Ver `## Evolución`.

- [ ] 3.4 Verificación integral: contrato `jwt-guard` ↔ tokens de auth, cobertura ≥70 % por servicio, lint y límite de pruebas
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y verificación`
  - **Stories:** US-EX2-16
  - **Owner profile:** backend
  - **Dependencies:** 2.1, 2.2, 2.3, 2.4, 2.5, 3.1
  - **Definition of done:** `apps/auth-service/src/jwt-contract.spec.ts` (bajo `src/`, porque `roots` de Jest es `<rootDir>/src`) con **2 pruebas (primero)** que usan el emisor real de auth y `JwtAuthGuard` real de `@toka/jwt-guard` (clave del JWKS por resolvedor local, `aud`, `kid`) con un almacén Redis doble en memoria compartido entre `DenylistWriter` y `DenylistReader`: (1) token válido aceptado; (2) tras `RevokeUserSessions` el mismo token es rechazado. Los comandos de `AGENTS.md` para `apps/*` (`build`, `test` con cobertura, `lint`) pasan; cada servicio produce `coverage/coverage-summary.json` con ≥70 % líneas; si falta cobertura se amplían aserciones, no se superan los topes (ver Testing strategy). Total de casos `it(`/`test(` ≤30; servicios sin imports cruzados. Corrige solo desajustes de integración.
  - **Verification gate:** cmd:for s in auth role; do pnpm --filter @toka/$s-service build && pnpm --filter @toka/$s-service test && pnpm --filter @toka/$s-service lint || exit 1; done && for s in auth role; do node -e "const s=require('./apps/$s-service/coverage/coverage-summary.json');process.exit(s.total.lines.pct>=70?0:1)" || exit 1; done && test "$(grep -rEho '^[[:space:]]*(it|test)\(' apps/auth-service/src apps/role-service/src 2>/dev/null | wc -l)" -le 30 && ! grep -rEq "apps/(role|auth)-service|@toka/(role|auth)-service" apps/auth-service/src apps/role-service/src && grep -rq 'JwtAuthGuard' apps/auth-service/src/jwt-contract.spec.ts
  - **mockup_ref:** n/a
  - **Evidencia:** no existe `apps/auth-service/src/jwt-contract.spec.ts`; cobertura local de líneas: auth-service 96,36 %, role-service 92,5 % (`coverage/coverage-summary.json`, no versionado); 24 pruebas entre ambos servicios. Ver `## Evolución`.

- [ ] 3.5 Trazabilidad y nota de implementación de ADR-003
  - **Change:** build-auth-role-services
  - **Spec:** `openspec/changes/build-auth-role-services/specs/service-runtime.md`
  - **Spec wave slice:** `## Wave 2 — Empaquetado y verificación`
  - **Stories:** US-EX2-16
  - **Owner profile:** backend
  - **Dependencies:** 3.2, 3.3, 3.4
  - **Definition of done:** (dominio acotado a `docs/**`, como en los cambios 1 y 2) `docs/traceability.md` pasa a `Implementado` las filas EX2-R05 y EX2-R27 (artefactos reales de este cambio) y anota `Planeado (parcial: auth y role en build-auth-role-services)` en EX2-R01, EX2-R04, EX2-R11, EX2-R16, EX2-R22, EX2-R23 y EX2-R24 (continúan en `build-user-audit-services`/cambio 5); no cambia otras filas. `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md` añade, en `## Implementación`, un apartado `### Notas de implementación (build-auth-role-services)` que registra: tokens de servicio con `roles=['service']` y `scope=svc:internal`, `RolesGuard` por servicio (no en `jwt-guard`), `audience` de auth `['toka-api','auth-service']` y de role `['toka-api','role-service']`, `roles: []` si el nombre del rol no es resoluble, y los recortes diferidos (rate limit de login al cambio 5, seed del primer usuario admin al cambio 4). Declara además las **desviaciones respecto del contrato original**: (a) la actualización de roles es `PUT /roles/{id}` (no `PATCH`); (b) **no hay `DELETE /roles/{id}`** (no existe `role.deleted`); (c) `permissions` se almacena como `text[]`; (d) role-service siembra el rol `admin` al arrancar (idempotente); (e) `SERVICE_CLIENTS` de auth debe aceptar el `SVC_CLIENT_ID`/`SVC_CLIENT_SECRET` de cada servicio (mismo valor en su `.env` y en el de auth; lo cablean `bootstrap-env.sh` y el cambio 5). No se modifican otros ADR ni el estado `accepted`. Requiere haber aprobado el 📋.
  - **Verification gate:** cmd:grep -q 'Notas de implementaci' docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md && grep -q 'RolesGuard' docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md && grep -q 'PATCH' docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md && grep -q 'text\[\]' docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md && test "$(grep -cE '^\| EX2-R(05|27) ' docs/traceability.md)" = 2 && test -z "$(grep -E '^\| EX2-R(05|27) ' docs/traceability.md | grep 'Planeado')" && grep -E '^\| EX2-R(05|27) ' docs/traceability.md | grep -q 'Implementado' && grep -E '^\| EX2-R01 ' docs/traceability.md | grep -q 'parcial' && grep -E '^\| EX2-R04 ' docs/traceability.md | grep -q 'parcial'
  - **mockup_ref:** n/a
  - **Evidencia:** `docs/traceability.md` mantiene EX2-R05 y EX2-R27 en `Planeado`; `ADR-003` no tiene el apartado `### Notas de implementación (build-auth-role-services)`. Ver `## Evolución`.

## Evolución

- 3.3 — Las migraciones se aplican con el rol propio de cada servicio al arrancar el contenedor (`CMD` con `prisma migrate deploy` y `DATABASE_URL` de `auth_user`/`role_user` en `infra/env/*.env.example`). El siguiente paso es un smoke versionado que aplique `0001_init` y `0002_role_permissions` sobre un Postgres limpio.
- 3.4 — La compatibilidad entre el emisor de auth y `JwtAuthGuard` se ejerce de extremo a extremo con la pila completa (`e2e/auth.spec.ts`, `e2e/permissions.spec.ts`); las pruebas HTTP de auth sustituyen el guard por uno de prueba (`x-user`). El siguiente paso es la prueba unitaria `jwt-contract.spec.ts` con el emisor real, el guard real y un denylist en memoria.
- 3.5 — La actualización de `docs/traceability.md` (EX2-R05, EX2-R27 y filas parciales) y las notas de implementación de ADR-003 se resuelven en la reconciliación de documentación del proyecto.
