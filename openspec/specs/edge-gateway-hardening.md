---
spec: edge-gateway-hardening
change: harden-compose-resilience-security
wave: 0,1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — edge-gateway-hardening

> Spec canónica promovida desde el cambio archivado `harden-compose-resilience-security` (as-built, 2026-10-21).

## Requirements

### Requirement: Solo rutas `/api/*` permitidas
nginx (`web`, plantilla `apps/web/nginx/default.conf.template`) SHALL enrutar únicamente `/api/auth`, `/api/users`, `/api/roles`, `/api/audit` y `/api/agent` hacia el servicio correspondiente, además de los assets y la SPA. `/internal/` y `/oauth/` SHALL responder `404` mediante `location` explícitas sin `proxy_pass`.

#### Scenario: Rutas internas inalcanzables
- **WHEN** se solicita `/internal/credentials/x` o `POST /oauth/token` a través de `web`
- **THEN** la respuesta es `404`

### Requirement: Límite de peticiones en el login
nginx SHALL aplicar `limit_req` a `/api/auth/login` por IP (`zone=login`, `rate=5r/m`, `burst=5`, `nodelay`) y responder `429` al exceder el límite (`limit_req_status 429`).

#### Scenario: Ráfaga limitada
- **WHEN** se envían 20 `POST /api/auth/login` consecutivos desde la misma IP
- **THEN** al menos una respuesta es `429`

### Requirement: Timeouts, tamaño de cuerpo y cabeceras de seguridad
nginx SHALL fijar `proxy_read_timeout 40s` en `/api/agent/` y `client_max_body_size 64k`, y declarar a nivel de `server` las cabeceras `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` y `Content-Security-Policy` (con `always`), que heredan las `location` de `/api/*`. SHALL exponer `/healthz` con `200`.

#### Scenario: Cabeceras presentes en la API
- **WHEN** se solicita `GET /api/roles` sin token a través de `web`
- **THEN** la respuesta (`401`) incluye `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`

## Evolución

- `server_tokens off`, `Permissions-Policy` y `proxy_connect_timeout`/`proxy_read_timeout` explícitos en las rutas de servicio.
- `scripts/verify-isolation.sh` para comprobar en ejecución el puerto único, los 404 internos, las cabeceras, la falta de egress de `user-service` y el 429 de login.
