# Implementation Handoff — build-auth-role-services

## Change summary
- **Change name:** build-auth-role-services (cambio 3 de 9)
- **Approved proposal:** `openspec/changes/build-auth-role-services/proposal.md`
- **Approved design:** `openspec/changes/build-auth-role-services/design.md`
- **Approved tasks:** `openspec/changes/build-auth-role-services/tasks.md` (13 tareas, 3 waves: 3 / 5 / 5)

## Goal
Implementar `apps/auth-service` (login argon2id, JWT RS256 con `kid`/`aud`, JWKS, refresh con rotación por familia en cookie HttpOnly, logout y revocación por `jti`/usuario, `/oauth/token`, `PUT|DELETE /internal/credentials`, consumidor `auth.user-projection` con reintentos y DLQ, publicación `auth.login.*` con respaldo `audit.fallback`) y `apps/role-service` (CRUD con `version`, `GET /roles/{id}` con caché `role:perm:*`, RBAC, eventos `role.*`, re-sync al arrancar), con Clean Architecture, Prisma por servicio, Dockerfile, logs JSON y cobertura ≥70 %.

## In scope
- `apps/auth-service/**`, `apps/role-service/**`, `.gitignore` (`apps/*/src/generated/`), `.dockerignore`, `docs/traceability.md`, nota en `docs/adrs/ADR-003-...md`.

## Out of scope
- Compose de servicios, variables nuevas en `infra/env/*`, rate limit de login, `DELETE /roles/{id}`, seed de admin, paquete AMQP compartido, rotación JWKS, OIDC, ACL Redis, outbox de auth.

## Decisions already closed
- Ver `design.md` D1–D20 (RolesGuard por servicio; `roles=['service']` para tokens de servicio; autoverificación en proceso en auth; audiencias; `roles: []` si no hay nombre; epoch en segundos; una sola cola `.retry`; `role.permissions.changed` solo si cambian permisos).
- Presupuesto de pruebas: 29 (cap 30); exclusiones de cobertura solo de cableado/generado/adaptadores.

## Open risks / follow-ups
- **Precondición**: cambio 2 completo antes de 1.1. APIs usadas: `design.md` → S1–S12 (**reconcile after change 2**); diferencias se reportan al orquestador, no se editan paquetes del cambio 2.
- S10: permisos de `public` en Postgres para `auth_user`/`role_user` (lo detecta 3.3).
- Rol `admin` sembrado en 3.1; primer usuario admin = cambio 4; `SERVICE_CLIENTS` de auth debe incluir el `SVC_CLIENT_ID/SECRET` de user-service (bootstrap-env.sh/cambio 5); instalación = paso previo del orquestador (ninguna tarea instala); variables de entorno nuevas y servicios en compose (cambio 5); promover `RolesGuard` y adaptador AMQP si se repiten en el cambio 4.
- `spec/build-auth-role-services` y `gate/plan-approved/build-auth-role-services` en Engram: pendientes (el planner no tuvo `engram`); los guarda el orquestador.

## Source-of-truth files
- `openspec/changes/build-auth-role-services/{proposal,design,tasks}.md` y `specs/{auth-tokens,auth-credentials-projection,role-management,service-runtime}.md`
- `openspec/changes/bootstrap-monorepo-platform/design.md` (APIs de paquetes), `openspec/changes/archive/2026-10-20-design-architecture-docs/{design,handoff}.md`
- `docs/adrs/ADR-002..007`, `docs/architecture/03-flujo-de-datos.md`, `04-docker-compose-diseno.md`, `07-resiliencia.md`

## Implementation guidance
- Orden: 1.1 → (1.2 ∥ 1.3) → 2.1 → (2.2, 2.3, luego 2.4; 2.5 en paralelo) → 3.1 ∥ 3.2 ∥ 3.3 → 3.4 → 3.5.
- Envelopes: `database` → `apps/*/prisma/**`; `backend` → `apps/**` salvo `prisma/`; 1.1 también `.gitignore`; 3.2 también `.dockerignore`; 3.5 → `docs/**`.
- TDD estricto; no `pnpm add` fuera de 1.1; no superar los topes de pruebas; no editar `packages/**` ni `infra/**` del cambio 2.

## Verification guidance
- Gates `cmd:` por tarea; 3.4 es el gate integral (cobertura, conteo de pruebas, contrato `jwt-guard`). Después: validador + ✅ manual (compose del cambio 2 + `PUT /internal/credentials` con token de servicio, login, JWKS, logout y rechazo posterior).

## Suggested implement prompt
Ejecutar `forge:orchestrate` para `build-auth-role-services`: Wave 0 (1.1, luego 1.2 y 1.3), Wave 1 (2.1 → 2.2/2.3 → 2.4; 2.5 en paralelo), Wave 2 (3.1–3.3 en paralelo, luego 3.4 y 3.5), con checkpoint tras cada wave y gate ✅ al final. Confirmar antes que el cambio 2 está completo.

## Suggested checkpoints
- Planning-approved (📋) · fin de Wave 0 · fin de Wave 1 · pre-verify · post-verify
