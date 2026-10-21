---
spec: web-gateway-docker
change: build-frontend-user-console
wave: 0,2
epics: EP-EX3
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — web-gateway-docker

> Spec canónica promovida desde el cambio archivado `build-frontend-user-console`. Describe el comportamiento as-built.

## Requirements

### Requirement: nginx como gateway ligero
La plantilla `apps/web/nginx/default.conf.template` SHALL escuchar en 8080, exponer `/healthz` (200), enrutar `/api/auth`, `/api/users`, `/api/roles`, `/api/audit` y `/api/agent` a `${AUTH,USER,ROLE,AUDIT,AGENT}_UPSTREAM` retirando el prefijo `/api`, resolver los upstreams con `resolver 127.0.0.11 valid=10s` y variables, aplicar `limit_req` (5 r/m, ráfaga 5, `limit_req_status 429`) a `/api/auth/login`, devolver 404 en `/internal/` y `/oauth/`, servir el SPA con `try_files ... /index.html`, limitar el cuerpo a 64k y añadir `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.

#### Scenario: Rutas internas no expuestas
- **WHEN** se solicita `/internal/credentials/1` o `/oauth/token` al gateway
- **THEN** la respuesta es 404

#### Scenario: Ráfaga de logins
- **WHEN** una misma IP supera el límite de `/api/auth/login`
- **THEN** el gateway responde 429

### Requirement: Imagen multi-stage y servicio `web`
`apps/web/Dockerfile` SHALL construirse con contexto en la raíz: etapa `node:22-alpine` con `corepack`, `pnpm install --frozen-lockfile --filter web...` y `pnpm --filter web build`; etapa `nginx:1.27-alpine` con `dist` en `/usr/share/nginx/html`, la plantilla en `/etc/nginx/templates/`, `*_UPSTREAM` por defecto y `EXPOSE 8080`. `docker-compose.yml` SHALL incluir `web` en las redes `public` y `edge`, publicando `${WEB_PORT:-8080}:8080`, con healthcheck `wget` sobre `/healthz` y `depends_on` con `service_healthy` de los cinco servicios de aplicación. `web` SHALL ser el único servicio con puerto publicado.

#### Scenario: Arranque del gateway
- **WHEN** los cinco servicios están sanos y arranca `web`
- **THEN** `GET /healthz` devuelve 200 y `GET /` devuelve el HTML del SPA
