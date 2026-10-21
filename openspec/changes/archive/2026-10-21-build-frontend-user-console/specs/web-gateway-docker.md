---
spec: web-gateway-docker
change: build-frontend-user-console
wave: 0,2
epics: EP-EX3
status: draft
created: 2026-10-20
---

# Spec — web-gateway-docker

## ADDED Requirements

## Wave 0 — nginx, imagen y servicio compose

### Requirement: nginx como gateway ligero sin dependencia de backends al arrancar
La plantilla nginx SHALL servir el SPA (`try_files` a `/index.html`), exponer `/healthz` (200), enrutar `/api/auth`, `/api/users`, `/api/roles`, `/api/audit` y `/api/agent` a `${AUTH,USER,ROLE,AUDIT,AGENT}_UPSTREAM` retirando el prefijo `/api`, usar `resolver 127.0.0.11` con variables para arrancar aunque los upstreams no existan, aplicar `limit_req` (con `limit_req_status 429`) a `/api/auth/login` y devolver 404 en `/internal/` y `/oauth/`.

#### Scenario: Configuración válida sin backends
- **WHEN** se ejecuta `nginx -t` en la imagen con los `ENV` por defecto
- **THEN** la configuración es válida

#### Scenario: Rutas internas no expuestas
- **WHEN** se solicita `/internal/credentials/1` o `/oauth/token` al contenedor
- **THEN** la respuesta es 404

### Requirement: Imagen multi-stage y servicio `web`
`apps/web/Dockerfile` SHALL construirse con contexto en la raíz (`docker build -f apps/web/Dockerfile .`), compilar con pnpm con lockfile congelado y servir `dist` desde nginx en el puerto 8080. `docker-compose.yml` SHALL incluir el servicio `web` (build con contexto `.`, `8080:8080`, redes `public` y `edge`, `*_UPSTREAM`, healthcheck `/healthz`) sin `depends_on`; `docker compose config -q` SHALL pasar.

#### Scenario: Compose válido
- **WHEN** se ejecuta `docker compose config -q`
- **THEN** termina con código 0 y `web` es el único servicio con `ports`

## Wave 2 — Smoke de la imagen

### Requirement: `web` sano en solitario
`docker compose up -d --no-deps --wait web` SHALL dejar el servicio sano y sirviendo el SPA en `http://localhost:8080/`, con `/healthz` en 200 y `/internal/x` en 404.

#### Scenario: Arranque aislado
- **WHEN** se levanta solo `web`
- **THEN** `GET /healthz` devuelve 200 y `GET /` devuelve el HTML del SPA
