---
spec: system-verification
change: harden-compose-resilience-security
wave: 1,2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — system-verification

## ADDED Requirements

## Wave 1 — Smoke y resiliencia

### Requirement: Smoke end-to-end
`scripts/smoke.sh` SHALL ejecutar, contra `BASE_URL` (por defecto `http://localhost:8080`) y usando solo `curl` y `node` (sin `jq`): login del administrador semilla, listado de roles, alta de un usuario con email único, sondeo (≤30 s) hasta que `GET /api/audit/events` muestre `user.created` del usuario creado y `POST /api/agent/ask` con respuesta no vacía. SHALL terminar con código 0 solo si todos los pasos pasan e imprimir `OK:`/`FAIL:` por paso.

#### Scenario: Flujo completo
- **WHEN** el stack está sano y se ejecuta `bash scripts/smoke.sh`
- **THEN** el código de salida es 0 y se imprime `OK:` en login, alta, evento de auditoría y agente

#### Scenario: Evento de auditoría con consistencia eventual
- **WHEN** el alta termina y el evento aún no llegó a `audit-service`
- **THEN** el script reintenta cada 2 s hasta 30 s antes de fallar

### Requirement: Sondas de resiliencia según `07`
`scripts/resilience-check.sh` SHALL verificar: (a) con Redis detenido, una petición autenticada a `GET /api/roles` responde 2xx en ≤5 s (fail-open del denylist); (b) con `role-service` detenido, `POST /api/users` responde `503` en ≤15 s y el usuario no queda `ACTIVE`. SHALL restaurar los servicios detenidos aunque una sonda falle.

#### Scenario: Redis caído
- **WHEN** se ejecuta `docker compose stop redis` y se llama a `GET /api/roles` con un token válido
- **THEN** la respuesta es 2xx y el servicio sigue operativo

#### Scenario: role-service caído durante el alta
- **WHEN** `role-service` está detenido y se llama a `POST /api/users`
- **THEN** la respuesta es `503` y ningún usuario con ese email aparece `ACTIVE`

## Wave 2 — Verificación integral

### Requirement: Verificación integral desde cero
Desde un entorno limpio (`docker compose down -v`), `bash scripts/bootstrap-env.sh && docker compose up -d --build --wait --wait-timeout 300` SHALL dejar el sistema sano, y `smoke.sh`, `check-owasp.sh`, `resilience-check.sh` y `verify-isolation.sh` SHALL terminar con código 0 ejecutados en ese orden (la ráfaga de login de `verify-isolation.sh` agota el cupo `limit_req`, por eso va la última). La verificación SHALL terminar con `docker compose down -v`.

#### Scenario: Cierre limpio
- **WHEN** se ejecuta la secuencia completa
- **THEN** todos los scripts salen con 0 y no quedan contenedores del proyecto `toka`
