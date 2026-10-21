# Implementation Handoff — harden-compose-resilience-security

## Change summary
- **Change name:** harden-compose-resilience-security (change 5 de 9)
- **Proposal / design / tasks:** `openspec/changes/harden-compose-resilience-security/{proposal,design,tasks}.md` (11 tareas, 3 waves: 4 + 4 + 3; 5 specs)

## Goal
Un único `docker compose up -d --build --wait` que levanta `web` + 5 servicios + infraestructura con arranque por salud y migrate-on-start; borde nginx endurecido; scripts repetibles (`smoke.sh`, `verify-isolation.sh`, `check-owasp.sh`, `resilience-check.sh`); perfil `observability`; README de ejecución, `09-ddd-clean-aplicado.md` y trazabilidad al día.

## Dependencias de otros cambios (bloqueantes)
- 2 `bootstrap-monorepo-platform`, 3 `build-auth-role-services`, 4 `build-user-audit-services`, 6 `build-frontend-web` (slug supuesto), 7 `build-ai-agent-service` (slug supuesto). No despachar sin 3, 4, 6, 7 verificados (1.3 solo necesita 6).

## Supuestos de contrato (cerrar al implementar; desajuste → `BLOCKED [CONTRACT]` al cambio dueño)
1. Dockerfile por servicio en `apps/<svc>/Dockerfile` (contexto de raíz), `USER` no root, puerto de `04`, `GET /health` y `GET /ready`.
2. Imágenes de auth/user/role incluyen la CLI de Prisma y las migraciones; el `CMD` de producción se reutiliza en `command`.
3. Administrador semilla en `infra/env/auth-service.env` (nombres `needs-verification`, p. ej. `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) y `bootstrap-env.sh` genera su contraseña.
4. Plantilla nginx en `apps/web` con `AUTH_UPSTREAM`…`AGENT_UPSTREAM`, `web` en `8080`, `/healthz`.
5. Agente con proveedor `mock` si no hay clave; `POST /agent/ask`.
6. `GET /audit/events` (JWT admin) con `user.created`.

## Open risks / follow-ups
- Gates que levantan el stack se ejecutan en serie (comparten `name: toka` y puerto 8080). Orden de 3.3: smoke → check-owasp → resilience → verify-isolation (la ráfaga de login agota `limit_req`).
- nginx resuelve upstreams al arrancar: `resilience-check.sh` reinicia `web` tras restaurar servicios.
- Candidatos a recortar si falta tiempo (plazo 17:30): 1.4 (observability) y `pnpm audit`.
- Seguimiento heredado de `design-architecture-docs`: verificación de egress de `user-service` (tarea 2.2).
- Deuda declarada: `<svc>:jwks` en Redis sin uso (D9 del cambio 2) — reconciliar en `04` (3.3).

## Implementation guidance
- Wave 0: 1.1 y 1.3 independientes; 1.2 tras 1.1; 1.4 tras 1.2 (todas editan `docker-compose.yml` salvo 1.3). Wave 1: scripts en paralelo, gates en serie. Wave 2: 3.1 y 3.2 en paralelo; 3.3 al final (tras 📋).
- Envelopes acotados explícitamente (el Domain Map del `AGENTS.md` recibido por el planner mostraba marcadores): `backend` → `docker-compose.yml`, `scripts/**`, `infra/observability/**`, `docs/**`, `README.md` y `apps/*/src` solo para correcciones mínimas de 2.1/2.3/2.4; `frontend` → solo el directorio nginx de `apps/web` en 1.3.
- Presupuesto de pruebas ≤6 (≤4 brechas OWASP, ≤2 integración); sin snapshots.

## Verification guidance
- Cada tarea trae gate `cmd:` ejecutable; todos los que usan Docker terminan con `docker compose down -v`. Después: validador (`forge:verify`) y gate ✅ manual (`docker compose up`, abrir `http://localhost:8080`, login, crear usuario, preguntar al agente).

## Suggested implement prompt
Ejecutar `forge:orchestrate` para `harden-compose-resilience-security`: Wave 0 (1.1–1.4), Wave 1 (2.1–2.4), Wave 2 (3.1–3.3), con checkpoint tras cada wave y gate ✅ al final.
