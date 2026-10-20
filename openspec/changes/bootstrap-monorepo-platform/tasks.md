# Tasks — bootstrap-monorepo-platform

> 11 tareas, 4 specs, 3 waves (Wave 0 = 4, Wave 1 = 4, Wave 2 = 3). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` (sin frontend). TDD obligatorio en Wave 1 (prueba primero; presupuesto en `design.md` → `## Testing strategy`: 18 pruebas, `jwt-guard` en el tope de 6).
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin backticks internos ni `grep -P`, regexes sin `.` suelto para acentos. Valores de versión: `needs-verification` — fijar al instalar. Contrato compartido: `design.md` de este cambio y del archivado `design-architecture-docs`.
> Wave 1 (2.1–2.4) es paralelizable (paquetes independientes; solo dependen de 1.1, que precrea los 4 manifiestos y hace la única instalación: las tareas 2.x NO ejecutan `pnpm add`). Los gates de compose usan `.env` generado por `scripts/bootstrap-env.sh` (tarea 1.2).

## Wave 0 — Raíz del workspace e infraestructura

- [ ] 1.1 Workspace pnpm y herramientas base (tsconfig, Jest con umbral 70, eslint, prettier, scripts raíz)
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/monorepo-workspace.md`
  - **Spec wave slice:** `## Wave 0 — Workspace y herramientas`
  - **Stories:** US-EX2-01
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** existen `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `package.json` raíz (`private`, `engines.node >=22`, scripts `build` = `pnpm -r build`, `test` = `pnpm -r test -- --coverage`, `lint` = `pnpm -r lint`, `format`), `tsconfig.base.json` (strict, ES2022, commonjs, decoradores, declaration), `jest.config.base.js` (ts-jest, `collectCoverage`, `coverageThreshold.global.lines: 70`, reporters `text`/`json-summary`/`lcov`, excluye `index.ts` y `*.spec.ts`), configuración compartida de eslint y prettier; devDependencies raíz instaladas con lockfile (`pnpm install` ok). Versiones fijadas al instalar. **pnpm no está instalado** (corepack sí): primero `corepack enable && corepack prepare pnpm@<versión fijada al instalar> --activate` y campo `packageManager` en el `package.json` raíz. **Manifiestos precreados**: 1.1 crea los 4 `package.json` (`@toka/contracts|logger|jwt-guard|http-client`; `main`/`types` en `dist`; scripts `build`, `test` = `jest`, `lint` = `eslint src`; `jest.config.js` y `tsconfig.json` que extienden la base) con TODAS sus dependencias y hace una única `pnpm install` (lockfile único; las tareas 2.x no ejecutan `pnpm add`): `jose` fijado a la v5 (dual CJS/ESM); `@nestjs/common`, `rxjs`, `reflect-metadata` como `peerDependencies` (y `devDependencies` para pruebas) en logger y jwt-guard; `pino` en logger; `ioredis` solo como devDependency/peer opcional de jwt-guard; `contracts` y `http-client` sin dependencias de runtime. **Comando AGENTS.md**: `pnpm -r test -- --coverage` NO debe pasar `--` a Jest como patrón de rutas; si lo hace, se ajustan los scripts `test` (p. ej. wrapper) para que el comando canónico funcione tal cual. Los directorios `src` quedan con un archivo mínimo para que build/lint no fallen antes de Wave 1.
  - **Verification gate:** cmd:test -f pnpm-workspace.yaml && grep -q 'packages/' pnpm-workspace.yaml && test -f tsconfig.base.json && test -f jest.config.base.js && pnpm --version && node -e "const p=require('./package.json');process.exit(/^pnpm@/.test(p.packageManager||'')?0:1)" && for p in contracts logger jwt-guard http-client; do node -e "const p=require('./packages/$p/package.json');process.exit(p.name==='@toka/$p'?0:1)" || exit 1; done && pnpm install && pnpm -r test -- --version && pnpm exec tsc --version && pnpm exec eslint --version && pnpm exec prettier --version && node -e "const c=require('./jest.config.base.js');process.exit(c.coverageThreshold.global.lines===70&&c.collectCoverage===true?0:1)" && node -e "const p=require('./package.json');process.exit(p.scripts.build==='pnpm -r build'&&p.scripts.lint==='pnpm -r lint'&&p.scripts.test.includes('pnpm -r test')?0:1)"
  - **mockup_ref:** n/a

- [ ] 1.2 Plantillas de entorno, `scripts/bootstrap-env.sh` y adiciones a `.gitignore`
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/infra-compose.md`
  - **Spec wave slice:** `## Wave 0 — Infraestructura local`
  - **Stories:** US-EX2-07
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** `.env.example` (variables de infra de 04: Postgres admin y 3 contraseñas de rol, Mongo admin y `AUDIT_DB_PASSWORD`, `REDIS_PASSWORD`, `RABBITMQ_USER/PASSWORD`; sin Grafana) e `infra/env/{auth,user,role,audit,ai-agent}-service.env.example` con marcadores según 04 (URLs con `<VAR>`, `SVC_CLIENT_ID/SECRET` donde aplica; `LLM_*` vacíos). `scripts/bootstrap-env.sh`: idempotente, crea `.env` e `infra/env/*.env` desde las plantillas si faltan, reemplaza `change-me` y marcadores por `openssl rand -hex 16` con coherencia infra ↔ servicio, y genera `secrets/jwt_private.pem` (RSA, solo si no existe). `.gitignore` (ya existe; ya contiene `.env`, `.env.*` y `!.env.example`) añade solo lo que falta: `infra/env/*.env`, `secrets/` y `!infra/env/*.env.example`; `.gitattributes` contiene `* text=auto eol=lf` (el repo tiene `core.autocrlf=true`: sin esto plantillas, `.gitignore` y `.sh` recibirían `\r` y romperían `grep -qxF` y los scripts). Ningún secreto real versionado.
  - **Verification gate:** cmd:bash scripts/bootstrap-env.sh && bash scripts/bootstrap-env.sh && for s in auth user role audit ai-agent; do test -f infra/env/$s-service.env.example && test -f infra/env/$s-service.env || exit 1; done && test -f .env.example && test -f .env && test -s secrets/jwt_private.pem && openssl rsa -in secrets/jwt_private.pem -check -noout && grep -qxF '.env' .gitignore && grep -qxF 'infra/env/*.env' .gitignore && grep -qxF 'secrets/' .gitignore && grep -qxF '!.env.example' .gitignore && grep -qxF '* text=auto eol=lf' .gitattributes && { git rev-parse --git-dir >/dev/null 2>&1 && git check-ignore -q .env && git check-ignore -q secrets/jwt_private.pem && git check-ignore -q infra/env/auth-service.env || ! git rev-parse --git-dir >/dev/null 2>&1; } && ! grep -rq 'change-me' .env infra/env/*.env && p=$(grep '^AUTH_DB_PASSWORD=' .env | cut -d= -f2) && test -n "$p" && grep -q "$p" infra/env/auth-service.env && grep -q '^REDIS_PASSWORD=' .env.example
  - **mockup_ref:** n/a

- [ ] 1.3 Scripts de init: Postgres (rol por base) y Mongo (`audit_user`)
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/infra-compose.md`
  - **Spec wave slice:** `## Wave 0 — Infraestructura local`
  - **Stories:** US-EX2-06
  - **Owner profile:** database
  - **Dependencies:** none
  - **Definition of done:** `infra/postgres/init/01-roles-and-databases.sh` crea `auth_user/auth_db`, `user_user/user_db`, `role_user/role_db` con `REVOKE ALL ON DATABASE ... FROM PUBLIC` y `GRANT CONNECT` solo al propio rol (contraseñas desde `AUTH_DB_PASSWORD`, `USER_DB_PASSWORD`, `ROLE_DB_PASSWORD`); `infra/mongo/init/01-audit-user.js` crea `audit_user` con `readWrite` solo en `audit_db` (contraseña desde `AUDIT_DB_PASSWORD`). **RabbitMQ no lleva init** (design D6): sin `definitions.json` ni `rabbitmq.conf`; los exchanges `toka.events`/`toka.events.dlx` los afirma cada servicio con las constantes de `@toka/contracts`.
  - **Verification gate:** cmd:sh -n infra/postgres/init/01-roles-and-databases.sh && grep -q 'REVOKE ALL ON DATABASE' infra/postgres/init/01-roles-and-databases.sh && node --check infra/mongo/init/01-audit-user.js && grep -q 'audit_db' infra/mongo/init/01-audit-user.js && test ! -e infra/rabbitmq/definitions.json && test ! -e infra/rabbitmq/rabbitmq.conf
  - **mockup_ref:** n/a

- [ ] 1.4 `docker-compose.yml` solo de infraestructura (postgres, mongo, redis, rabbitmq, qdrant) con redes y healthchecks
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/infra-compose.md`
  - **Spec wave slice:** `## Wave 0 — Infraestructura local`
  - **Stories:** US-EX2-06
  - **Owner profile:** backend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** `docker-compose.yml` con `name: toka`, los 5 servicios de infra (imágenes por design.md; Qdrant con etiqueta fijada), `healthcheck` en cada uno (04), volúmenes con nombre, scripts de init montados `:ro`, `redis-server --requirepass ${REDIS_PASSWORD}`, RabbitMQ solo con `RABBITMQ_DEFAULT_USER/PASS` (sin `load_definitions`), ningún `ports:` publicado, todos solo en `backend`; redes `public`, `edge` (`internal: true`), `backend` (`internal: true`) y `egress` declaradas según 04 (sin `grafana-ui` ni perfil `observability`); solo marcadores `${VAR}`.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && docker compose config -q && docker compose config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);const sv=c.services;const ok=c.name==='toka'&&['postgres','mongo','redis','rabbitmq','qdrant'].every(k=>sv[k]&&sv[k].healthcheck)&&Object.values(sv).every(v=>!v.ports||v.ports.length===0)&&c.networks.backend.internal===true;process.exit(ok?0:1)})" && grep -A2 '^  edge:' docker-compose.yml | grep -q 'internal: true' && grep -q '^  public:' docker-compose.yml && grep -q '^  egress:' docker-compose.yml && grep -q 'requirepass' docker-compose.yml && ! grep -q 'load_definitions' docker-compose.yml
  - **mockup_ref:** n/a

## Wave 1 — Paquetes compartidos (independientes; TDD)

- [ ] 2.1 `@toka/contracts`: sobre de evento, routing keys, bindings y payload de `user.role.assigned`
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/shared-packages.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-04
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `packages/contracts` (sin dependencias de runtime) exporta `EVENTS_EXCHANGE`, `DLX_EXCHANGE`, `RoutingKeys`, `QueueBindings`, constantes de cabecera, `EventEnvelope<T>` (`eventId`, `type`, `version`, `aggregateVersion`, `occurredAt`, `correlationId`, `actor`, `reason?`, `payload`), `UserRoleAssignedPayload` (`userId`, `roleId`, `roleName`, `roleVersion`), `createEnvelope`, `isEventEnvelope`, `deterministicEventId`. 3 pruebas (primero), cobertura ≥70 % líneas, build y lint verdes.
  - **Verification gate:** cmd:pnpm --filter @toka/contracts test && pnpm --filter @toka/contracts build && pnpm --filter @toka/contracts lint && node -e "const c=require('./packages/contracts');const p=require('./packages/contracts/package.json');process.exit(c.EVENTS_EXCHANGE==='toka.events'&&Object.values(c.RoutingKeys).includes('user.role.assigned')&&Object.keys(p.dependencies||{}).length===0?0:1)"
  - **mockup_ref:** n/a

- [ ] 2.2 `@toka/logger`: pino JSON con campos ADR-007, `correlationId` (middleware + interceptor) y redacción
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/shared-packages.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-02
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `packages/logger` exporta `createLogger({service, level?})`, `correlationIdMiddleware`, `RequestLoggingInterceptor` y `getCorrelationId()`. Salida JSON por línea con `timestamp` ISO, `level` etiqueta, `service`, `correlationId`; el interceptor añade `route`, `statusCode`, `latencyMs`, `userId` y `event=access.denied` en 403; redacta contraseñas, tokens y `authorization`. 4 pruebas (primero), cobertura ≥70 % líneas, build y lint verdes. No depende de otros `@toka/*`.
  - **Verification gate:** cmd:pnpm --filter @toka/logger test && pnpm --filter @toka/logger build && pnpm --filter @toka/logger lint && node -e "require('./packages/logger').createLogger({service:'svc-x'}).info('hi')" | grep -q '"service":"svc-x"'
  - **mockup_ref:** n/a

- [ ] 2.3 `@toka/jwt-guard`: validación RS256 local con JWKS y denylist en Redis con fail-open
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/jwt-guard.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-03
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `packages/jwt-guard` exporta `JwtAuthGuard`, `DenylistReader`, `RedisDenylistReader` y las opciones (`issuer`, `audience`, `jwksUri` o resolvedor de claves, `denylistTimeoutMs` por defecto 200, `logger`, `metrics?`). Valida firma, `alg=RS256`, `kid` obligatorio, `iss`, `aud` y `exp`; rechaza `auth:deny:jti:{jti}` existente y `iat` < valor (epoch segundos) de `auth:deny:user:{sub}`; si Redis falla o excede el timeout continúa con `logger.warn` (`event=denylist.unavailable`) y métrica; la firma/`aud`/`exp` se validan siempre. Expone `request.user`. 6 pruebas (primero; tope presupuestado), cobertura ≥70 % líneas, build y lint verdes. No depende de `@toka/logger` ni de otros `@toka/*`.
  - **Verification gate:** cmd:pnpm --filter @toka/jwt-guard test && pnpm --filter @toka/jwt-guard build && pnpm --filter @toka/jwt-guard lint && grep -rq 'auth:deny:jti:' packages/jwt-guard/src && grep -rq 'auth:deny:user:' packages/jwt-guard/src
  - **mockup_ref:** n/a

- [ ] 2.4 `@toka/http-client`: timeout, reintentos solo idempotentes con backoff/jitter y circuit breaker
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/shared-packages.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX2-05
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** `packages/http-client` exporta `createHttpClient`, `HttpTimeoutError`, `CircuitOpenError`, `HttpStatusError`. Timeout por `AbortController`; reintentos con backoff exponencial y jitter solo en `GET/HEAD/PUT/DELETE` o llamadas `idempotent: true`, ante red/timeout/5xx/429, nunca 4xx, acotados por `budgetMs`; breaker cerrado/abierto/semiabierto por fallos consecutivos y `resetTimeoutMs` (4xx no cuenta); propaga `x-correlation-id` y cabeceras dadas; `fetchImpl` inyectable. 5 pruebas (primero), cobertura ≥70 % líneas, build y lint verdes. No depende de otros `@toka/*`.
  - **Verification gate:** cmd:pnpm --filter @toka/http-client test && pnpm --filter @toka/http-client build && pnpm --filter @toka/http-client lint && node -e "const m=require('./packages/http-client');process.exit(typeof m.createHttpClient==='function'&&typeof m.CircuitOpenError==='function'?0:1)"
  - **mockup_ref:** n/a

## Wave 2 — Integración y cierre

- [ ] 3.1 Verificación integral del workspace (build + test con cobertura + lint) e independencia de paquetes
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/monorepo-workspace.md`
  - **Spec wave slice:** `## Wave 2 — Verificación integral`
  - **Stories:** US-EX2-01, US-EX2-08
  - **Owner profile:** backend
  - **Dependencies:** 2.1, 2.2, 2.3, 2.4
  - **Definition of done:** los comandos de `AGENTS.md` (`pnpm -r build`, `pnpm -r test -- --coverage`, `pnpm -r lint`) pasan desde la raíz con lockfile congelado; cada paquete produce `coverage/coverage-summary.json` con ≥70 % de líneas; ningún paquete importa otro `@toka/*`; el total de pruebas del cambio es ≤30. Corrige solo desajustes de integración (sin ampliar alcance).
  - **Verification gate:** cmd:pnpm install --frozen-lockfile && pnpm -r build && pnpm -r test -- --coverage && pnpm -r lint && for p in contracts logger jwt-guard http-client; do node -e "const s=require('./packages/$p/coverage/coverage-summary.json');process.exit(s.total.lines.pct>=70?0:1)" || exit 1; done && ! grep -rq '@toka/' packages/*/src
  - **mockup_ref:** n/a

- [ ] 3.2 Smoke de infraestructura: arranque sano, aislamiento por rol, Redis con contraseña y exchanges
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/infra-compose.md`
  - **Spec wave slice:** `## Wave 2 — Smoke de infraestructura`
  - **Stories:** US-EX2-06, US-EX2-07
  - **Owner profile:** backend
  - **Dependencies:** 1.4
  - **Definition of done:** `docker compose up -d --wait` deja sanos los 5 contenedores; las 3 bases existen; `auth_user` entra a `auth_db` y no a `user_db`; `audit_user` autentica en `audit_db`; `redis-cli ping` sin contraseña no devuelve `PONG` y con `REDISCLI_AUTH` sí; RabbitMQ autentica con `RABBITMQ_USER`/`RABBITMQ_PASSWORD` (`rabbitmqctl authenticate_user`). El gate limpia con `docker compose down -v`. Si una sonda falla (riesgo 2 de design.md), ajustar la implementación sin cambiar el contrato.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && set -a && . ./.env && set +a && ( docker compose up -d --wait && test "$(docker compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d postgres -tAc "select count(*) from pg_database where datname in ('auth_db','user_db','role_db')" | tr -d '\r')" = 3 && docker compose exec -T -e PGPASSWORD="$AUTH_DB_PASSWORD" postgres psql -h postgres -U auth_user -d auth_db -c 'select 1' && ! docker compose exec -T -e PGPASSWORD="$AUTH_DB_PASSWORD" postgres psql -h postgres -U auth_user -d user_db -c 'select 1' && docker compose exec -T mongo mongosh --quiet -u audit_user -p "$AUDIT_DB_PASSWORD" --authenticationDatabase audit_db audit_db --eval "db.getName()" | grep -q audit_db && ! docker compose exec -T redis redis-cli ping | grep -q PONG && docker compose exec -T -e REDISCLI_AUTH="$REDIS_PASSWORD" redis redis-cli ping | grep -q PONG && docker compose exec -T rabbitmq rabbitmqctl authenticate_user "$RABBITMQ_USER" "$RABBITMQ_PASSWORD" ); rc=$?; docker compose down -v; exit $rc
  - **mockup_ref:** n/a

- [ ] 3.3 Enmienda de ADR-001 y actualización de `docs/traceability.md`
  - **Change:** bootstrap-monorepo-platform
  - **Spec:** `openspec/changes/bootstrap-monorepo-platform/specs/monorepo-workspace.md`
  - **Spec wave slice:** `## Wave 2 — Verificación integral`
  - **Stories:** US-EX2-08
  - **Owner profile:** backend
  - **Dependencies:** 3.1, 3.2
  - **Definition of done:** (dominio acotado a `docs/**`, como en el cambio 1) `docs/adrs/ADR-001-monorepo-typescript-nestjs.md` añade `packages/http-client` a los paquetes transversales permitidos (una línea en `## Decision` y en `## Implementación`) y aclara que el esqueleto de cada servicio NestJS se crea en su `build-*` (no en `bootstrap-monorepo-platform`); `docs/traceability.md` pasa de `Planeado` a `Implementado` las filas EX2-R06, EX2-R09, EX2-R10, EX2-R26 y EX2-R30 con el artefacto real, corrige la línea 16 de la lista de cambios (quita "esqueleto de servicios"; añade `http-client`) y, en la fila EX2-R32 (propiedad del cambio 5, sigue `Planeado`), elimina la alternativa `apps/{user-service,ai-agent-service}/src/infrastructure/http/` y la sustituye por `packages/http-client` ya decidido aquí. La enmienda de ADR-001 también declara que `jwt-guard` se entrega completo en este cambio (comportamiento de ADR-003; la integración con el JWKS real de auth va en `build-auth-role-services`). No se modifican otros ADR. Requiere haber aprobado el 📋 (enmienda de un ADR aceptado).
  - **Verification gate:** cmd:grep -q 'http-client' docs/adrs/ADR-001-monorepo-typescript-nestjs.md && grep -Eq 'esqueleto.*build-' docs/adrs/ADR-001-monorepo-typescript-nestjs.md && grep -qE '^\| EX2-R06 ' docs/traceability.md && test -z "$(grep -E '^\| EX2-R(06|09|10|26|30) ' docs/traceability.md | grep 'Planeado')" && ! grep -q 'esqueleto de servicios' docs/traceability.md && grep -E '^\| EX2-R32 ' docs/traceability.md | grep -q 'packages/http-client' && ! grep -E '^\| EX2-R32 ' docs/traceability.md | grep -q 'apps/{user-service' && grep -Eq 'jwt-guard.*(completo|complet)' docs/adrs/ADR-001-monorepo-typescript-nestjs.md
  - **mockup_ref:** n/a
