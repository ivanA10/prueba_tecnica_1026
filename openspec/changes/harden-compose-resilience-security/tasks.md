# Tasks — harden-compose-resilience-security

> 11 tareas, 5 specs, 3 waves (Wave 0 = 4, Wave 1 = 4, Wave 2 = 3). Prosa en español. Un solo repo: sin `Repo:`. `mockup_ref: n/a` (sin cambio visual; la única tarea sobre `apps/web` es configuración nginx). TDD solo donde hay código nuevo: las correcciones de brechas de 2.3 (y defectos de integración de 2.1) llevan prueba de regresión primero; presupuesto en `design.md` → `## Testing strategy` (≤6 pruebas en total). El resto se verifica por gates `cmd:`.
> **Dependencias de otros cambios (obligatorias, no se despacha este cambio sin ellas):** cambio 2 `bootstrap-monorepo-platform` (compose de infra, `.env`, paquetes), cambio 3 `build-auth-role-services`, cambio 4 `build-user-audit-services`, cambio 6 `build-frontend-web` (slug supuesto), cambio 7 `build-ai-agent-service` (slug supuesto). Excepción: 1.3 solo necesita el cambio 6. Supuestos de contrato en `design.md` → "Supuestos de contrato"; desajuste → `BLOCKED [CONTRACT]` al cambio dueño.
> Gates: bash POSIX (Git Bash en Windows) desde la raíz, una línea, sin backticks internos ni `grep -P`, sin `jq` (JSON con `node -e`). Comando canónico de arranque: `docker compose up -d --build --wait --wait-timeout 300`. **Los gates que levantan el stack comparten `name: toka` y el puerto 8080: se ejecutan uno por uno (D12), cada uno termina con `docker compose down -v`.** Etiquetas de imagen y sintaxis Alloy: `needs-verification` — fijar al implementar.
> Cadena de ediciones sobre `docker-compose.yml`: 1.1 → 1.2 → 1.4 (en secuencia). 1.3 es independiente. Wave 1: scripts redactables en paralelo, gates en serie. Wave 2: 3.1 y 3.2 en paralelo; 3.3 al final.

## Wave 0 — Compose integrado y borde

- [ ] 1.1 Compose integrado: `web` y los 5 servicios con redes, `depends_on` por salud, healthchecks, secreto JWT y dureza de contenedor
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/compose-orchestration.md`
  - **Spec wave slice:** `## Wave 0 — Compose integrado`
  - **Stories:** US-EX2-51
  - **Owner profile:** backend
  - **Dependencies:** none
  - **Definition of done:** (requiere los cambios 2, 3, 4, 6 y 7 implementados) `docker-compose.yml` (parte del de infra del cambio 2) añade `web`, `auth-service`, `user-service`, `role-service`, `audit-service` y `ai-agent-service` siguiendo `04` y la matriz de `design.md`: `build: {context: ., dockerfile: apps/<svc>/Dockerfile}` (web: `./apps/web` o el contexto que fije el cambio 6), `expose` `3001`–`3005`, `env_file` solo `infra/env/<svc>.env` (nunca el `.env` raíz), `environment` de `04` (JWKS, URLs internas, `*_UPSTREAM` de `web`), `depends_on` con `condition: service_healthy` (D11, sin ciclos), `healthcheck` con `start_period` (20 s; 40 s el agente), secreto `jwt_private_key` solo en `auth-service`, `restart: unless-stopped`. Redes: `web` en `public`+`edge`; servicios en `edge`+`backend`; solo `ai-agent-service` añade `egress`. Solo `web` publica `8080:8080`. `x-service-defaults` incluye `security_opt: [no-new-privileges:true]` y `cap_drop: [ALL]` para los 5 servicios Node (si uno falla por esto se retira solo para ese y se anota). Imágenes de infra ya fijadas por el cambio 2. Reconciliar con `04` cualquier desvío (la edición de `04` la hace 3.3).
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && docker compose config -q && docker compose config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s);const sv=c.services;const apps=['auth-service','user-service','role-service','audit-service','ai-agent-service'];const net=k=>Object.keys(sv[k].networks||{});const pub=Object.keys(sv).filter(k=>sv[k].ports&&sv[k].ports.length>0);const ok=['web',...apps].every(k=>sv[k]&&sv[k].healthcheck)&&pub.length===1&&pub[0]==='web'&&apps.every(k=>net(k).includes('edge')&&net(k).includes('backend')&&!net(k).includes('public'))&&Object.keys(sv).filter(k=>net(k).includes('egress')).length===1&&net('ai-agent-service').includes('egress')&&apps.every(k=>(sv[k].security_opt||[]).includes('no-new-privileges:true')&&(sv[k].cap_drop||[]).includes('ALL'))&&Object.keys(sv.web.depends_on||{}).length>=5&&apps.every(k=>Object.values(sv[k].depends_on||{}).every(d=>d.condition==='service_healthy'))&&JSON.stringify(sv['auth-service'].secrets||[]).includes('jwt_private_key')&&apps.filter(k=>k!=='auth-service').every(k=>(sv[k].secrets||[]).length===0);process.exit(ok?0:1)})" && ! grep -qE 'env_file: *\[ *\.env *\]|^ *- *\.env *$' docker-compose.yml
  - **mockup_ref:** n/a

- [ ] 1.2 Migrate-on-start para `auth`, `user` y `role` (Prisma) y arranque real del conjunto
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/compose-orchestration.md`
  - **Spec wave slice:** `## Wave 0 — Compose integrado`
  - **Stories:** US-EX2-51
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** (D2) `auth-service`, `user-service` y `role-service` llevan `command: ["sh","-c","<prisma migrate deploy> && exec <CMD de su Dockerfile>"]` (se lee el `CMD`/script `start` real y la ruta del esquema de cada servicio; si la imagen no trae la CLI de Prisma → `BLOCKED [CONTRACT]` al cambio 3/4). `audit-service` y `ai-agent-service` no migran. Con volúmenes vacíos todos los servicios quedan `healthy` y existen tablas en `auth_db`, `user_db` y `role_db`; un segundo `up` sin `down -v` no falla. Si algún healthcheck/`start_period` no alcanza, se ajusta (valores ilustrativos en `04`) sin quitar el healthcheck.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && docker compose config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const sv=JSON.parse(s).services;const m=k=>JSON.stringify(sv[k].command||[]).includes('migrate deploy');process.exit(m('auth-service')&&m('user-service')&&m('role-service')&&!m('audit-service')&&!m('ai-agent-service')?0:1)})" && set -a && . ./.env && set +a && ( docker compose up -d --build --wait --wait-timeout 300 && for d in auth user role; do n=$(docker compose exec -T -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" postgres psql -h postgres -U "$POSTGRES_ADMIN_USER" -d ${d}_db -tAc "select count(*) from information_schema.tables where table_schema='public'" | tr -d '\r'); test "$n" -gt 0 || exit 1; done && docker compose up -d --wait --wait-timeout 300 ); rc=$?; docker compose down -v; exit $rc
  - **mockup_ref:** n/a

- [ ] 1.3 Política de borde en la plantilla nginx de `apps/web`: `limit_req`, timeouts, cabeceras de seguridad, rutas permitidas
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/edge-gateway-hardening.md`
  - **Spec wave slice:** `## Wave 0 — Política de borde en nginx`
  - **Stories:** US-EX2-52
  - **Owner profile:** frontend
  - **Dependencies:** none
  - **Definition of done:** (requiere solo el cambio 6; independiente de 1.1, por eso su gate no usa compose) (D3, D4) sobre la plantilla creada por el cambio 6 (se localiza con `grep -rl proxy_pass apps/web`; no se reescribe, se completa): `limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;` al inicio del archivo de `conf.d`, `limit_req zone=login burst=5 nodelay;` y `limit_req_status 429;` en `location = /api/auth/login`; `proxy_connect_timeout 5s` y `proxy_read_timeout 30s` en las rutas de servicio, `proxy_read_timeout 40s` en `/api/agent/`; `client_max_body_size 1m`; `server_tokens off`; `location = /healthz` con 200; snippet de cabeceras (`X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy no-referrer`, `Permissions-Policy`, `Content-Security-Policy default-src 'self'` ajustada a la SPA, todas con `always`) incluido en **cada** `location`; solo `location` para `/api/auth|users|roles|audit|agent` y la SPA; **ningún** `location` para `/internal` ni `/oauth` (ni comentarios que contengan `location /internal` u `/oauth`, que romperían el gate). Sin cambio visual. Edición acotada al directorio nginx de `apps/web`. La validación en ejecución (404, 429, cabeceras) la hace 2.2.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && C=$(find apps/web -type f \( -name '*.conf' -o -name '*.template' -o -name '*.snippet' \) -not -path '*/node_modules/*' -exec cat {} +) && test -n "$C" && echo "$C" | grep -q 'limit_req_zone' && echo "$C" | grep -q 'limit_req_status 429' && echo "$C" | grep -Eq 'limit_req +zone=login +burst=5 +nodelay' && echo "$C" | grep -Eq 'proxy_read_timeout +40s' && echo "$C" | grep -Eq 'proxy_connect_timeout +5s' && echo "$C" | grep -Eq 'client_max_body_size +1m' && echo "$C" | grep -q 'server_tokens off' && echo "$C" | grep -q 'nosniff' && echo "$C" | grep -q 'X-Frame-Options' && echo "$C" | grep -q 'Content-Security-Policy' && echo "$C" | grep -q 'Referrer-Policy' && echo "$C" | grep -q 'healthz' && ! echo "$C" | grep -Eq 'location +[~^=* ]*/(internal|oauth)'
  - **mockup_ref:** n/a

- [ ] 1.4 Perfil `observability` (Loki + Grafana Alloy + Grafana) y `GRAFANA_ADMIN_PASSWORD` en el bootstrap
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/observability-and-docs.md`
  - **Spec wave slice:** `## Wave 0 — Perfil observability`
  - **Stories:** US-EX2-55
  - **Owner profile:** backend
  - **Dependencies:** 1.2
  - **Definition of done:** (D10) `loki`, `alloy`, `grafana` con `profiles: [observability]`, imágenes con etiqueta fijada (`needs-verification`), red `grafana-ui` (declarada), Grafana en `backend` + `grafana-ui` con solo `127.0.0.1:3000:3000` y `GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}`; `alloy` monta `/var/run/docker.sock:ro` y `infra/observability/config.alloy` (descubre contenedores por la etiqueta `com.docker.compose.project=toka` y envía a Loki); `infra/observability/grafana/datasources.yml` aprovisiona Loki. Grafana con healthcheck; Loki y Alloy exentos (imágenes sin shell, anotado en `04` por 3.3). `.env.example` añade `GRAFANA_ADMIN_PASSWORD`; `scripts/bootstrap-env.sh` genera su valor y, además, **añade al `.env` existente las variables que falten de `.env.example`** (sigue idempotente, no pisa valores). Sin perfil no se crea ningún contenedor extra.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && bash scripts/bootstrap-env.sh && bash scripts/bootstrap-env.sh && grep -q '^GRAFANA_ADMIN_PASSWORD=' .env.example && g=$(grep '^GRAFANA_ADMIN_PASSWORD=' .env | cut -d= -f2) && test -n "$g" && test "$g" != change-me && docker compose config -q && docker compose --profile observability config -q && ! docker compose config --services | tr -d '\r' | grep -Eq '^(loki|alloy|grafana)$' && docker compose --profile observability config --services | tr -d '\r' | grep -q '^grafana$' && docker compose --profile observability config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const sv=JSON.parse(s).services;const p=sv.grafana.ports||[];process.exit(p.length===1&&p[0].host_ip==='127.0.0.1'&&String(p[0].published)==='3000'&&['loki','alloy','grafana'].every(k=>(sv[k].profiles||[]).includes('observability'))?0:1)})" && test -f infra/observability/config.alloy && test -f infra/observability/grafana/datasources.yml && grep -q 'loki' infra/observability/grafana/datasources.yml && grep -q 'docker' infra/observability/config.alloy && grep -q 'grafana-ui' docker-compose.yml
  - **mockup_ref:** n/a

## Wave 1 — Verificación de seguridad y resiliencia

- [ ] 2.1 `scripts/smoke.sh`: login → alta de usuario → evento de auditoría visible → pregunta al agente
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/system-verification.md`
  - **Spec wave slice:** `## Wave 1 — Smoke y resiliencia`
  - **Stories:** US-EX2-53
  - **Owner profile:** backend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** (D8) script bash (`set -eu`, solo `curl` y `node -e`, sin `jq`) con `BASE_URL` (por defecto `http://localhost:8080`), `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` (por defecto leídos del `infra/env/auth-service.env` real; si no existen → `FAIL:` claro y se reporta al cambio 3). Pasos con `OK:`/`FAIL:`: (1) `POST /api/auth/login` → `accessToken`; (2) `GET /api/roles` → `roleId`; (3) `POST /api/users` con email único (`smoke-<epoch>@example.com`) → 201 y `userId`; (4) sondeo cada 2 s hasta 30 s de `GET /api/audit/events` con `user.created` del `userId` (consistencia eventual, ADR-004); (5) `POST /api/agent/ask` → 200 con respuesta no vacía (proveedor `mock` si no hay clave). Formas de cuerpo/ruta leídas de los controladores/OpenAPI reales (`needs-verification`); defectos de **código** hallados se corrigen en el servicio dueño con prueba de regresión (cuenta en el presupuesto ≤2); defectos de contrato → `BLOCKED [CONTRACT]`. Un solo login por ejecución (cupo `limit_req`).
  - **Verification gate:** cmd:bash -n scripts/smoke.sh && grep -q 'api/agent/ask' scripts/smoke.sh && grep -q 'api/audit/events' scripts/smoke.sh && { test -f .env || bash scripts/bootstrap-env.sh; } && ( docker compose up -d --build --wait --wait-timeout 300 && bash scripts/smoke.sh ); rc=$?; docker compose down -v; exit $rc
  - **mockup_ref:** n/a

- [ ] 2.2 `scripts/verify-isolation.sh`: egress, un solo puerto, `/internal` y `/oauth` sin ruta, cabeceras y `429` de login
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/edge-gateway-hardening.md`
  - **Spec wave slice:** `## Wave 1 — Verificación en ejecución`
  - **Stories:** US-EX2-52, US-EX2-53
  - **Owner profile:** backend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** (D5) script bash con `OK:`/`FAIL:` por control: (a) `docker compose exec -T user-service node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1),()=>process.exit(0))"` sale 0 (sin salida a Internet; seguimiento (1) del `handoff.md` de `design-architecture-docs`); (b) solo `8080` publicado (`docker compose ps --format json`, `node -e`); (c) desde `web` no se alcanza `postgres:5432`, `mongo:27017` ni `redis:6379`; (d) `GET /internal/credentials/x` y `POST /oauth/token` vía `localhost:8080` → `404`; (e) `GET /api/roles` sin token → `401` con `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`; (f) **última** comprobación: 20 `POST /api/auth/login` con credenciales inválidas → al menos un `429`. Ajusta `1.3`/`1.1` solo si una comprobación revela un desajuste de configuración (nginx no probado con `nginx -t` en 1.3 por la resolución de upstreams: aquí `web` arranca con los servicios vivos).
  - **Verification gate:** cmd:bash -n scripts/verify-isolation.sh && grep -q 'example.com' scripts/verify-isolation.sh && grep -q '429' scripts/verify-isolation.sh && { test -f .env || bash scripts/bootstrap-env.sh; } && ( docker compose up -d --build --wait --wait-timeout 300 && bash scripts/verify-isolation.sh ); rc=$?; docker compose down -v; exit $rc
  - **mockup_ref:** n/a

- [ ] 2.3 OWASP mapeado a código: `docs/security/owasp-checklist.md` y `scripts/check-owasp.sh` (+ correcciones mínimas)
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/owasp-security-verification.md`
  - **Spec wave slice:** `## Wave 1 — OWASP mapeado a código`
  - **Stories:** US-EX2-54
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** (D6) `docs/security/owasp-checklist.md` con una fila por cada riesgo de la tabla `## OWASP` de `06` (11 filas: inyección, autenticación/fuerza bruta, almacenamiento de tokens, suplantación/audiencia, control de acceso, confused deputy, prompt injection, exposición de datos, configuración insegura, consumo desmedido/DoS, componentes vulnerables) con columnas control / archivos reales (rutas concretas en backticks, sin globs ni puntuación final) / comprobación / estado (`Verificado` | `Corregido en este cambio` + prueba). `scripts/check-owasp.sh` (bash, `set -u`, `grep -rE` sobre rutas reales, `OK:`/`FAIL:` por control, sale ≠0 si hay algún `FAIL:`) implementa las comprobaciones de `owasp-security-verification.md`. **Verificar, no reimplementar**: cada brecha (p. ej. falta `helmet` o `forbidNonWhitelisted`) se corrige con el cambio mínimo en `apps/<svc>/src/main.ts` o equivalente, con 1 prueba de regresión escrita primero (≤4 en total) y registrada en el checklist. `pnpm audit --prod` se documenta como informativo (no gate). Lint/pruebas: acotar a los servicios tocados con `--filter` si el scope-guard bloquea el barrido repo-wide. Las filas dinámicas (429, cabeceras, egress) remiten a 2.2; las de resiliencia, a 2.4.
  - **Verification gate:** cmd:bash -n scripts/check-owasp.sh && bash scripts/check-owasp.sh && test "$(grep -c '^| ' docs/security/owasp-checklist.md)" -ge 13 && ! grep -q 'FAIL' docs/security/owasp-checklist.md && grep -oE 'apps/[A-Za-z0-9_./-]*[A-Za-z0-9_/]' docs/security/owasp-checklist.md | sort -u | while read -r p; do test -e "$p" || { echo "missing $p"; exit 1; }; done && pnpm -r lint && pnpm -r test -- --coverage
  - **mockup_ref:** n/a

- [ ] 2.4 `scripts/resilience-check.sh`: Redis caído (fail-open) y role-service caído (503 sin usuario `ACTIVE`)
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/system-verification.md`
  - **Spec wave slice:** `## Wave 1 — Smoke y resiliencia`
  - **Stories:** US-EX2-54
  - **Owner profile:** backend
  - **Dependencies:** 1.2, 1.3
  - **Definition of done:** (D9) script bash con `trap` que restaura (`docker compose up -d --wait redis role-service && docker compose restart web && docker compose up -d --wait web`; nginx resuelve los upstreams al arrancar y un reinicio puede cambiar la IP de role-service, lo que dejaría a `web` con 502 en las comprobaciones posteriores de 3.3) aunque falle: (a) login único; `docker compose stop redis`; `GET /api/roles` con el token → 2xx en ≤5 s; reinicio y espera de salud de Redis; (b) `docker compose stop role-service`; `POST /api/users` con email único → `503` en ≤15 s (presupuesto del alta ≤10 s de `07`); `GET /api/users` no muestra ese email `ACTIVE`; reinicio de role-service. Solo **observa** el comportamiento de `07`; si no se cumple, el defecto se devuelve al cambio dueño (3/4) o, si es cableado mínimo, se corrige con prueba de regresión (presupuesto ≤2 compartido con 2.1). Ejecutar después de 2.1 en un stack limpio (el breaker abierto no debe contaminar otros gates).
  - **Verification gate:** cmd:bash -n scripts/resilience-check.sh && grep -q 'trap' scripts/resilience-check.sh && grep -q 'stop redis' scripts/resilience-check.sh && grep -q 'stop role-service' scripts/resilience-check.sh && grep -q 'restart web' scripts/resilience-check.sh && { test -f .env || bash scripts/bootstrap-env.sh; } && ( docker compose up -d --build --wait --wait-timeout 300 && bash scripts/resilience-check.sh ); rc=$?; docker compose down -v; exit $rc
  - **mockup_ref:** n/a

## Wave 2 — Documentación y cierre

- [ ] 3.1 Sección de ejecución en `README.md`
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/observability-and-docs.md`
  - **Spec wave slice:** `## Wave 2 — Documentación`
  - **Stories:** US-EX2-56
  - **Owner profile:** backend
  - **Dependencies:** 2.1
  - **Definition of done:** (dominio acotado a `README.md`, sin pisar otras secciones) sección `## Ejecución del sistema`: requisitos (Docker con Compose v2, Git Bash en Windows, `openssl`, `curl`, `node`), pasos en ≤6 comandos (`bash scripts/bootstrap-env.sh`, `docker compose up -d --build --wait --wait-timeout 300`, abrir `http://localhost:8080`, `bash scripts/smoke.sh`), dónde leer las credenciales del administrador semilla (archivo, sin valores reales), activación de `observability` (`docker compose --profile observability up -d`, Grafana en `http://127.0.0.1:3000`, aviso del socket de Docker), receta de logs `docker compose logs <servicio> | jq 'select(.correlationId=="<id>")'`, verificaciones (`verify-isolation.sh`, `check-owasp.sh`, `resilience-check.sh`), parada (`docker compose down -v`), nota de `localhost` para la cookie `Secure` y `COOKIE_SECURE=false` solo en desarrollo HTTP. Enlaza a `docs/architecture/README.md`.
  - **Verification gate:** cmd:grep -q '^## Ejecuci' README.md && grep -q 'bootstrap-env.sh' README.md && grep -q 'up -d --build --wait' README.md && grep -q 'smoke.sh' README.md && grep -q 'verify-isolation.sh' README.md && grep -q 'observability' README.md && grep -q 'correlationId' README.md && grep -q '8080' README.md && grep -q 'down -v' README.md && grep -q 'COOKIE_SECURE' README.md
  - **mockup_ref:** n/a

- [ ] 3.2 `docs/architecture/09-ddd-clean-aplicado.md`: DDD/Clean tal como se aplicó en cada servicio (entregable PDF Ex2)
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/observability-and-docs.md`
  - **Spec wave slice:** `## Wave 2 — Documentación`
  - **Stories:** US-EX2-56
  - **Owner profile:** backend
  - **Dependencies:** 1.1
  - **Definition of done:** (dominio `docs/**`) documento nuevo que, leyendo la estructura real de `apps/*/src`, describe por servicio (`auth`, `user`, `role`, `audit`, `ai-agent`) las capas existentes, el agregado principal, puertos y adaptadores, y dónde se aplica CQRS ligero, con rutas reales en backticks; sección `## Desviaciones respecto a 05-ddd-clean-cqrs.md` (qué se hizo distinto y por qué; "ninguna" si aplica) y enlace desde `docs/architecture/README.md`. No se reescribe `05` (diseño original).
  - **Verification gate:** cmd:f=docs/architecture/09-ddd-clean-aplicado.md && test -f "$f" && for s in auth user role audit ai-agent; do grep -q "${s}-service" "$f" || exit 1; done && grep -q '^## Desviaciones' "$f" && grep -q '09-ddd-clean-aplicado' docs/architecture/README.md && grep -oE 'apps/[A-Za-z0-9_./-]*[A-Za-z0-9_/]' "$f" | sort -u | while read -r p; do test -e "$p" || { echo "missing $p"; exit 1; }; done
  - **mockup_ref:** n/a

- [ ] 3.3 Verificación integral desde cero, reconciliación de `04` y actualización de `docs/traceability.md`
  - **Change:** harden-compose-resilience-security
  - **Spec:** `openspec/changes/harden-compose-resilience-security/specs/system-verification.md`
  - **Spec wave slice:** `## Wave 2 — Verificación integral`
  - **Stories:** US-EX2-51, US-EX2-53, US-EX2-54, US-EX2-56
  - **Owner profile:** backend
  - **Dependencies:** 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2
  - **Definition of done:** (dominio acotado a `docs/**` salvo ajustes de integración mínimos) desde `docker compose down -v`: bootstrap + `up -d --build --wait` + `smoke.sh` + `check-owasp.sh` + `resilience-check.sh` + `verify-isolation.sh` (en ese orden: la ráfaga de login de `verify-isolation.sh` agota el cupo `limit_req`, va la última) con código 0. `docs/architecture/04-docker-compose-diseno.md` añade `## Reconciliación con el compose real` (etiquetas, healthchecks, comandos de migración y exenciones del perfil `observability` definitivos; desvíos respecto al bloque ilustrativo). `docs/traceability.md` pasa a `Implementado` EX1-R17, EX2-R07, EX2-R12, EX2-R13, EX2-R14, EX2-R16, EX2-R17, EX2-R29, EX2-R31, EX2-R32, EX5-R11, EX0-R05 y EX0-R06 con el artefacto real (EX2-R13: sustituye "definiciones de exchange" por "`assertExchange` de los servicios", D6 del cambio 2) y no deja `Planeado` en filas de este cambio salvo lo marcado Evolución. No se modifican ADR (los de comportamiento ya están Implementado/Evolución). Requiere haber aprobado el 📋.
  - **Verification gate:** cmd:{ test -f .env || bash scripts/bootstrap-env.sh; } && docker compose down -v >/dev/null 2>&1; ( docker compose up -d --build --wait --wait-timeout 300 && bash scripts/smoke.sh && bash scripts/check-owasp.sh && bash scripts/resilience-check.sh && bash scripts/verify-isolation.sh ); rc=$?; docker compose down -v; test $rc -eq 0 && grep -q '^## Reconciliaci' docs/architecture/04-docker-compose-diseno.md && test -z "$(grep -E '^\| (EX1-R17|EX2-R07|EX2-R12|EX2-R13|EX2-R14|EX2-R16|EX2-R17|EX2-R29|EX2-R31|EX2-R32|EX5-R11|EX0-R05|EX0-R06) ' docs/traceability.md | grep 'Planeado')" && ! grep -E '^\| EX2-R13 ' docs/traceability.md | grep -q 'definiciones de exchange'
  - **mockup_ref:** n/a
