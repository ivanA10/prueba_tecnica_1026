---
spec: edge-gateway-hardening
change: harden-compose-resilience-security
wave: 0,1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — edge-gateway-hardening

## ADDED Requirements

## Wave 0 — Política de borde en nginx

### Requirement: Solo rutas `/api/*` permitidas
nginx (`web`) SHALL enrutar únicamente `/api/auth`, `/api/users`, `/api/roles`, `/api/audit` y `/api/agent` hacia el servicio correspondiente. SHALL NOT definir `location` para `/internal/*` ni `/oauth/*`.

#### Scenario: Rutas internas inalcanzables
- **WHEN** se solicita `/internal/credentials/x` o `POST /oauth/token` a través de `web`
- **THEN** la respuesta es `404`

### Requirement: Límite de peticiones en el login
nginx SHALL aplicar `limit_req` a `/api/auth/login` por IP (`rate=10r/m`, `burst=5`, `nodelay`) y responder `429` al exceder el límite (`limit_req_status 429`).

#### Scenario: Ráfaga limitada
- **WHEN** se envían 20 `POST /api/auth/login` consecutivos desde la misma IP
- **THEN** al menos una respuesta es `429`

### Requirement: Timeouts, tamaño de cuerpo y cabeceras de seguridad
nginx SHALL fijar `proxy_connect_timeout 5s` y `proxy_read_timeout 30s` en las rutas de servicio y `proxy_read_timeout 40s` en `/api/agent/`; `client_max_body_size 1m`; `server_tokens off`; y las cabeceras `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` y `Content-Security-Policy` (con `always`) en todas las `location`, incluidas las de `/api/*`. SHALL exponer `/healthz` con `200`.

#### Scenario: Cabeceras presentes en la API
- **WHEN** se solicita `GET /api/roles` sin token a través de `web`
- **THEN** la respuesta (`401`) incluye `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`

## Wave 1 — Verificación en ejecución

### Requirement: Comprobación repetible del borde y del aislamiento
`scripts/verify-isolation.sh` SHALL comprobar con salida `OK:`/`FAIL:` por control: solo `8080` publicado, `404` en `/internal` y `/oauth`, cabeceras de seguridad, `user-service` sin salida a Internet, `web` sin acceso a las bases de datos y `429` bajo ráfaga de login (última comprobación). SHALL terminar con código 0 solo si todas pasan.

#### Scenario: `user-service` no puede exfiltrar
- **WHEN** `user-service` intenta `fetch('https://example.com')` con timeout de 5 s
- **THEN** el `fetch` falla (el comando de comprobación sale 0)
