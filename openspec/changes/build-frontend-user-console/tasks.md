# Tasks — build-frontend-user-console

> 11 tareas, 5 specs, 3 waves (Wave 0 = 4, Wave 1 = 5, Wave 2 = 2). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` en todas (frontend sin Figma: UI funcional sin mockup disponible). TDD obligatorio en Wave 1 y en 1.2/1.3 (prueba primero; presupuesto de 25 pruebas en `design.md` → `## Testing strategy`, techo del cambio 30, `users` en el tope de 6).
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin backticks internos ni `grep -P`. Gates de porción usan `pnpm --filter web exec jest --coverage=false '<porción>'` (patrón posicional, válido en Jest 29 y 30; la base activa cobertura con umbral 70: una porción parcial fallaría el umbral; además evita el problema del `--` de pnpm). Solo 3.1 ejecuta el comando canónico `pnpm --filter web test -- --coverage`. Versiones: `needs-verification`, fijar al instalar.
> Prerrequisito: el cambio 2 (`bootstrap-monorepo-platform`) implementado (raíz pnpm, `jest.config.base.js`, `tsconfig.base.json`, redes `public`/`edge` en `docker-compose.yml`, `scripts/bootstrap-env.sh`). 1.1 solo edita el manifiesto `apps/web/package.json` con TODAS las dependencias; el orquestador ejecuta una única `pnpm install` antes de la wave (ningún gate ni tarea ejecuta `pnpm install` ni `pnpm add`).
> Paralelismo: Wave 0 = 1.1, luego 1.2 → 1.3 y 1.4 (en paralelo con 1.2/1.3). Wave 1 (2.1–2.5) paralelizable: cada tarea toca solo su carpeta `features/<x>` y `api/<x>.ts` (inyectan endpoints con `api.injectEndpoints`, sin editar `api.ts`) y las rutas se registran en `routes.tsx` creado en 1.2 con las 5 rutas apuntando a páginas `features/<x>/…Page.tsx` marcadas `TODO` que cada tarea reemplaza (sin editar `routes.tsx`).
> Fuera del dominio `apps/web` toca 1.4 (`docker-compose.yml`, `.dockerignore` raíz) y 3.2 (`docs/traceability.md`).

## Wave 0 — Andamiaje, sesión, componentes compartidos y gateway

- [ ] 1.1 Andamiaje `apps/web`: Vite + React 18 + TS, Jest jsdom, `config.ts` mockeable, lint y dependencias
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-app-foundation.md`
  - **Spec wave slice:** `## Wave 0 — Andamiaje, pruebas y componentes compartidos`
  - **Stories:** US-EX3-01
  - **Owner profile:** frontend
  - **Dependencies:** none
  - **Definition of done:** `apps/web/package.json` (`name: web`, `private`, scripts `dev`, `build` = `tsc --noEmit && vite build`, `test` = `jest`, `lint` = `eslint src test`) con TODAS las dependencias de la app y pruebas (solo edita el manifiesto; el orquestador instala una vez antes de la wave y actualiza el lockfile; `jest`/`jest-environment-jsdom`/`ts-jest` alineados a la versión de Jest del monorepo, 29 o 30, `needs-verification`): `react`, `react-dom`, `react-router-dom`, `@reduxjs/toolkit`, `react-redux`, `react-hook-form`, `@hookform/resolvers`, `zod`, `vite`, `@vitejs/plugin-react`, `typescript` (heredado), `jest-environment-jsdom`, `@testing-library/{react,jest-dom,user-event}`, `whatwg-fetch`, `identity-obj-proxy`, `@types/*`, `eslint` con `eslint-plugin-react`/`react-hooks` y parser TS. `tsconfig.json` extiende `tsconfig.base.json` con `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `lib` DOM, sin decoradores, `paths` `@/*`; `tsconfig.jest.json` si ts-jest lo requiere (plan B commonjs, design D5). `jest.config.js` extiende `jest.config.base.js` (D5: jsdom, `testMatch` `src/**/__tests__/**/*.test.tsx`, `setupFilesAfterEnv: test/setup.ts`, mapper `^@/config$` → `test/configMock.ts`, mapper `@/` y CSS, `collectCoverageFrom` sin `main.tsx`/`config.ts`/`*.d.ts`/`__tests__`). `vite.config.ts` (alias `@`, proxy `/api` de desarrollo), `index.html` con `<div id="root">`, `src/{main.tsx,App.tsx,config.ts,vite-env.d.ts}` donde `config.ts` es el único archivo con `import.meta` (`apiBaseUrl` = `VITE_API_BASE_URL` o `/api`), `test/{setup.ts,configMock.ts,mockFetch.ts,renderWithProviders.tsx}` (helper `mockFetchRoutes` con `jest.fn` sobre `globalThis.fetch`; `renderWithProviders` crea store y `MemoryRouter` — el store real llega en 1.2: hasta entonces `renderWithProviders` acepta un store opcional), configuración eslint de la app. 1 prueba de humo (`src/__tests__/app.test.tsx`, primero). Build y lint verdes.
  - **Verification gate:** cmd:node -e "const p=require('./apps/web/package.json');const d=p.dependencies||{};process.exit(p.name==='web'&&d.react&&d['@reduxjs/toolkit']&&d['react-hook-form']&&d.zod&&d['react-router-dom']?0:1)" && pnpm --filter web exec jest --coverage=false 'src/__tests__/app' && pnpm --filter web exec tsc --noEmit && pnpm --filter web build && pnpm --filter web lint && grep -q 'import.meta' apps/web/src/config.ts && ! grep -rq 'import.meta' apps/web/src --include='*.ts' --include='*.tsx' --exclude=config.ts
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 1.2 Store, cliente API con reautenticación y sesión en memoria (+ `routes.tsx` y slice `notifications`)
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-session-auth.md`
  - **Spec wave slice:** `## Wave 0 — Store, cliente API y sesión`
  - **Stories:** US-EX3-02
  - **Owner profile:** frontend
  - **Dependencies:** 1.1
  - **Definition of done:** `src/store/{index.ts,session.ts,notifications.ts,hooks.ts}` (slices `session` y `notifications`, store con `api.reducer`, hooks tipados), `src/api/{baseQuery.ts,api.ts,types.ts,auth.ts}`: `baseQueryWithReauth` según design D2/D3 (Bearer, 401 → un solo refresh compartido → un reintento → `clearSession` si falla; `credentials: 'include'` en `/auth/*`), `api.ts` con `createApi` y `tagTypes` `User|Role|Audit`, endpoints `login` (`{email,password}` → `{accessToken, expiresIn}`), `refresh`, `logout`, `bootstrapSession` (refresh inicial que fija `status` a `authenticated` o `anonymous`); login y refresh NO devuelven `user`: `src/api/jwt.ts` decodifica el payload del JWT (base64url, sin verificar firma) y `setSession` guarda `{id: sub, roles}` (design D3b; se cubre dentro de las 4 pruebas, p. ej. la del refresh comprueba `roles`), tipos de la tabla de supuestos de API en `types.ts`. `src/routes.tsx` con las rutas `/login`, `/users`, `/roles`, `/audit`, `/agent` apuntando a páginas stub `features/<x>/…Page.tsx` (`UsersPage`, `RolesPage`, `AuditPage`, `AgentPage`, `LoginPage`) que las tareas 2.x reemplazan; `App` monta `Provider`, router y lanza `bootstrapSession`. Actualiza `renderWithProviders` para usar el store real. 4 pruebas (primero): `setSession`/`clearSession`; Bearer en la petición; 401 → refresh → reintento; refresh fallido → `clearSession`. Sin `localStorage`/`sessionStorage`.
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/store/__tests__|src/api/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && ! grep -rqE 'localStorage|sessionStorage' apps/web/src && grep -rq 'credentials' apps/web/src/api && test -f apps/web/src/routes.tsx
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 1.3 Componentes compartidos de carga, error y feedback (`Spinner`, `ErrorMessage`, `Toaster`, `ConfirmDialog`)
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-app-foundation.md`
  - **Spec wave slice:** `## Wave 0 — Andamiaje, pruebas y componentes compartidos`
  - **Stories:** US-EX3-08
  - **Owner profile:** frontend
  - **Dependencies:** 1.2
  - **Definition of done:** `src/components/{Spinner,ErrorMessage,Toaster,ConfirmDialog}.tsx` accesibles (`role="status"`, `role="alert"`, `role="dialog"`), estilos mínimos en CSS plano; `ErrorMessage` extrae `message` (string o `string[]`) del error RTK (`{status, data:{message}}`) o muestra un texto por defecto; `Toaster` lee el slice `notifications` (éxito/error, cierre manual y automático) y se monta en `App`; `ConfirmDialog` con confirmar/cancelar. 2 pruebas (primero): `ErrorMessage` con mensaje NestJS y por defecto; `Toaster` muestra y cierra una notificación.
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/components/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && test -f apps/web/src/components/Spinner.tsx && test -f apps/web/src/components/ConfirmDialog.tsx
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 1.4 nginx gateway (plantilla), Dockerfile multi-stage y servicio `web` en `docker-compose.yml`
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-gateway-docker.md`
  - **Spec wave slice:** `## Wave 0 — nginx, imagen y servicio compose`
  - **Stories:** US-EX3-09
  - **Owner profile:** frontend
  - **Dependencies:** 1.1
  - **Definition of done:** `apps/web/nginx/default.conf.template` según design D7/D8 (puerto 8080, `/healthz`, `resolver 127.0.0.11 valid=10s`, `set $x ${X_UPSTREAM}` + `rewrite ^/api/(.*)$ /$1 break` + `proxy_pass`, `limit_req_zone`/`limit_req` + `limit_req_status 429` en `= /api/auth/login`, `^~ /internal/` y `^~ /oauth/` → 404, SPA `try_files`, caché de assets, `client_max_body_size 64k`; las `Set-Cookie` pasan sin reescritura). `apps/web/Dockerfile` multi-stage con contexto en la raíz: etapa `node` (corepack + pnpm según `packageManager`, `pnpm install --frozen-lockfile`, `pnpm --filter web build`) y etapa `nginx` sobre `nginx:*-alpine` (trae `wget` para el healthcheck) (copia `dist` a `/usr/share/nginx/html` y la plantilla a `/etc/nginx/templates/`, `ENV` `*_UPSTREAM` por defecto con los hostnames/puertos de 04, `EXPOSE 8080`). `.dockerignore` raíz: si ya existe, solo se AÑADEN las entradas que falten (no se sobrescribe); si no, se crea (`node_modules`, `.git`, `secrets`, `.env`, `infra/env/*.env`, `coverage`, `dist`). `docker-compose.yml`: añade solo el servicio `web` (D6: `build.context: .`, `dockerfile: apps/web/Dockerfile`, `ports: ["8080:8080"]`, redes `public` y `edge`, `environment` `*_UPSTREAM`, healthcheck `wget -qO- http://localhost:8080/healthz`, `restart: unless-stopped`, sin `depends_on`), sin tocar los servicios de infraestructura. Tag de imagen de nginx/node fijado al construir (`needs-verification`).
  - **Verification gate:** cmd:test -f apps/web/Dockerfile && test -f apps/web/nginx/default.conf.template && test -f .dockerignore && grep -q 'limit_req' apps/web/nginx/default.conf.template && grep -q 'limit_req_status 429' apps/web/nginx/default.conf.template && grep -q 'resolver 127.0.0.11' apps/web/nginx/default.conf.template && grep -qF 'location ^~ /internal/' apps/web/nginx/default.conf.template && grep -qF 'location ^~ /oauth/' apps/web/nginx/default.conf.template && docker build -f apps/web/Dockerfile -t toka-web . && docker run --rm toka-web nginx -t && { test -f .env || bash scripts/bootstrap-env.sh; } && docker compose config -q && docker compose config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);const w=c.services.web;const ok=w&&w.ports&&w.ports.length===1&&!w.depends_on&&w.networks.public!==undefined&&w.networks.edge!==undefined&&w.healthcheck&&Object.entries(c.services).every(([k,v])=>k==='web'||!v.ports||v.ports.length===0);process.exit(ok?0:1)})"
  - **mockup_ref:** n/a (sin Figma; infraestructura sin UI)

## Wave 1 — Pantallas (independientes; TDD)

- [ ] 2.1 Login, `RequireAuth`, `Layout` con navegación y logout
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-session-auth.md`
  - **Spec wave slice:** `## Wave 1 — Login y rutas protegidas`
  - **Stories:** US-EX3-03
  - **Owner profile:** frontend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** `src/features/auth/{LoginPage.tsx,loginSchema.ts}` (react-hook-form + zod: email válido, contraseña requerida; `Spinner`/botón deshabilitado en curso; `ErrorMessage` ante 401/429; éxito → `setSession` y navegación a `/users`), `src/components/{RequireAuth.tsx,Layout.tsx}` (redirige a `/login` si `anonymous`; `Spinner` si `unknown`; navegación a usuarios/roles/auditoría/agente; botón de salir → logout + limpiar sesión; enlaces de escritura según rol `admin`, D12). Reemplaza la página stub `LoginPage` sin editar `routes.tsx`. 4 pruebas (primero): validación sin llamar a `fetch`; login correcto; 401 con mensaje; `RequireAuth` redirige a `/login` y espera el bootstrap en `unknown`.
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/features/auth/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && test -f apps/web/src/components/RequireAuth.tsx && grep -rq 'zodResolver' apps/web/src/features/auth
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 2.2 Usuarios: lista paginada, alta, edición, baja con confirmación y asignación de rol
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-users-roles.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX3-04
  - **Owner profile:** frontend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** `src/api/users.ts` (inyecta `getUsers` → `{items,page,limit,total}` con items `{id,name,email,roleId,status}`, `createUser`, `updateUser`, `deleteUser`, `assignRole`; mutaciones invalidan `User`; `assignRole` usa `PUT /users/{id}/role`; para resolver el nombre del rol y poblar el selector, 2.2 declara su propio endpoint de lectura de roles en `users.ts` con otro nombre (`getRoleOptions`) para no solaparse con 2.3; si responde 403 —no admin— la tabla muestra el `roleId` sin error), `src/features/users/{UsersPage.tsx,UserForm.tsx,userSchema.ts}` (zod: nombre, email, contraseña ≥8, `roleId` obligatorio; estados `Spinner`/`ErrorMessage`/vacío; toasts de éxito/error; `ConfirmDialog` para borrar; selector de rol; acciones de escritura solo con rol `admin`; paginación `page`/`limit`; estado `PENDING` visible). Reemplaza el stub `UsersPage`. 6 pruebas (primero; tope presupuestado): carga y filas; error de lista; validación de alta sin `POST`; alta con toast y recarga; borrado confirmado; asignación de rol.
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/features/users/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && grep -rq 'zodResolver' apps/web/src/features/users && grep -rq '/role' apps/web/src/api/users.ts
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 2.3 Roles: listado con permisos
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-users-roles.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX3-05
  - **Owner profile:** frontend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** `src/api/roles.ts` (`getRoles`, tag `Role`) y `src/features/roles/RolesPage.tsx` (tabla nombre/permisos/versión, `Spinner`, `ErrorMessage`, vacío). `GET /roles` es solo admin: un 403 se muestra con el mensaje del backend vía `ErrorMessage` (sin romper la app). Reemplaza el stub `RolesPage`. 2 pruebas (primero): lista con permisos; error 403 con mensaje.
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/features/roles/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && test -f apps/web/src/api/roles.ts
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 2.4 Auditoría: visor con filtros y paginación
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-audit-agent.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX3-06
  - **Owner profile:** frontend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** `src/api/audit.ts` (`getAuditEvents` con `actor`, `type`, `from`, `to`, `page`, `limit`; tag `Audit`) y `src/features/audit/{AuditPage.tsx,AuditFilters.tsx}` (formulario de filtros, tabla `type`/`actorUserId`/`occurredAt`/`correlationId`, clave de fila `eventId`, `Spinner`, `ErrorMessage`, paginación). Reemplaza el stub `AuditPage`. 3 pruebas (primero): lista; el filtro por `type` incluye el parámetro en la URL; error de consulta.
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/features/audit/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && grep -q 'audit/events' apps/web/src/api/audit.ts
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

- [ ] 2.5 Agente IA: panel de chat sencillo
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-audit-agent.md`
  - **Spec wave slice:** n/a
  - **Stories:** US-EX3-07
  - **Owner profile:** frontend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** `src/api/agent.ts` (`askAgent` mutación `POST /agent/ask`) y `src/features/agent/{AgentPage.tsx,askSchema.ts}` (zod: pregunta 1–1000 caracteres; historial local de la sesión de pantalla en estado de componente; envío deshabilitado y `Spinner` mientras espera; muestra `answer` y fuentes (`{docId, source, score}`; `meta` ignorado); aviso si `degraded=true`; `ErrorMessage` conservando la pregunta). Reemplaza el stub `AgentPage`. 3 pruebas (primero): pregunta y respuesta; estado de carga; error 503 y aviso `degraded=true` (una prueba por caso hasta 3).
  - **Verification gate:** cmd:pnpm --filter web exec jest --coverage=false 'src/features/agent/__tests__' && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && grep -q 'agent/ask' apps/web/src/api/agent.ts
  - **mockup_ref:** n/a (sin Figma; UI funcional sin mockup)

## Wave 2 — Integración y cierre

- [ ] 3.1 Verificación integral: cobertura ≥70 %, ≤30 pruebas, build, lint y smoke de `web` en Docker
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-app-foundation.md`
  - **Spec wave slice:** `## Wave 2 — Verificación integral y trazabilidad`
  - **Stories:** US-EX3-10
  - **Owner profile:** frontend
  - **Dependencies:** 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
  - **Definition of done:** con las dependencias ya instaladas por el orquestador, `pnpm --filter web test -- --coverage` pasa con ≥70 % de líneas (`apps/web/coverage/coverage-summary.json`), el total de pruebas es ≤30 y 0 fallos, `pnpm --filter web build` y `pnpm --filter web lint` pasan, la imagen se construye y `docker compose up -d --no-deps --wait web` deja `web` sano con `/healthz` 200, `/` sirviendo el SPA y `/internal/x` y `/oauth/token` en 404. Corrige solo desajustes de integración (rutas, imports, tipos); si la cobertura queda <70 %, añade como máximo 2 pruebas de los archivos menos cubiertos sin superar 30. Si el puerto 8080 está ocupado el gate falla por entorno: liberar y repetir. El gate limpia con `docker compose down`.
  - **Verification gate:** cmd:pnpm --filter web test -- --coverage && node -e "const s=require('./apps/web/coverage/coverage-summary.json');process.exit(s.total.lines.pct>=70?0:1)" && pnpm --filter web exec jest --coverage=false --json --outputFile=apps/web/coverage/test-results.json && node -e "const r=require('./apps/web/coverage/test-results.json');process.exit(r.numTotalTests<=30&&r.numFailedTests===0?0:1)" && pnpm --filter web build && pnpm --filter web lint && { test -f .env || bash scripts/bootstrap-env.sh; } && docker build -f apps/web/Dockerfile -t toka-web . && ( docker compose up -d --no-deps --wait web && test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/healthz)" = 200 && curl -s http://localhost:8080/ | grep -q 'id="root"' && test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/internal/x)" = 404 && test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/oauth/token)" = 404 ); rc=$?; docker compose down; exit $rc
  - **mockup_ref:** n/a (sin Figma; sin diseño nuevo)

- [ ] 3.2 Actualización de `docs/traceability.md` (filas EX3 y EX0 de este cambio)
  - **Change:** build-frontend-user-console
  - **Spec:** `openspec/changes/build-frontend-user-console/specs/web-app-foundation.md`
  - **Spec wave slice:** `## Wave 2 — Verificación integral y trazabilidad`
  - **Stories:** US-EX3-10
  - **Owner profile:** frontend
  - **Dependencies:** 3.1
  - **Definition of done:** (dominio acotado a `docs/traceability.md`) las filas EX3-R01..R18, R20..R28 y EX0-R13..R15 pasan de `Planeado` a `Implementado` con el artefacto real; EX3-R19 (cambio 9) sigue `Planeado`; EX3-R13 indica "RTK Query sobre Fetch API" y EX3-R08/R17/R26 la ruta real `apps/web/src/**/__tests__/*.test.tsx`; la línea del cambio 6 en `## Cambios planeados` no se altera. No se modifica ningún ADR (la decisión de añadir `web` a compose antes del cambio 5 queda en `design.md` D6; ADR-010 ya lista `depends_on`/cabeceras/`Secure` para el cambio 5).
  - **Verification gate:** cmd:test -z "$(grep -E '^\| EX3-R(0[1-9]|1[0-8]|2[0-8]) ' docs/traceability.md | grep 'Planeado')" && test -z "$(grep -E '^\| EX0-R1[345] ' docs/traceability.md | grep 'Planeado')" && grep -E '^\| EX3-R19 ' docs/traceability.md | grep -q 'Planeado' && grep -E '^\| EX3-R13 ' docs/traceability.md | grep -q 'Fetch API' && grep -E '^\| EX3-R08 ' docs/traceability.md | grep -q '__tests__'
  - **mockup_ref:** n/a (documentación)
