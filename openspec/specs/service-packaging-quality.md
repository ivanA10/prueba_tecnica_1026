---
spec: service-packaging-quality
change: build-user-audit-services
wave: 2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — Empaquetado y calidad de user-service y audit-service

> Spec canónica promovida desde el cambio archivado `build-user-audit-services`. Describe el comportamiento as-built.

## Requirements

### Requirement: Imagen por servicio
Cada servicio SHALL tener un Dockerfile multi-etapa (contexto raíz, `node:22-slim`, `corepack`, `pnpm install --frozen-lockfile --filter "@toka/<svc>..."`) que compila `@toka/*` y el servicio y produce una imagen con `USER node`, `NODE_ENV=production`, `HEALTHCHECK` sobre `/health` y `EXPOSE 3002` (user) o `3004` (audit). user-service SHALL arrancar con `prisma migrate deploy` seguido de `node dist/main.js`; audit-service con `node dist/main.js`. El `.dockerignore` raíz y los `Dockerfile.dockerignore` por servicio SHALL excluir `node_modules`, `.env`, `infra/env/*.env` y `secrets`. Ambos servicios forman parte de `docker-compose.yml` con `depends_on` por salud.

#### Scenario: Usuario no root
- **WHEN** se inspecciona la imagen final de cualquiera de los dos servicios
- **THEN** ejecuta como `node`

### Requirement: Entorno completo
`infra/env/user-service.env.example` SHALL listar `DATABASE_URL`, timeouts, `SIGNUP_BUDGET_MS`, `RECONCILE_GRACE_MS` y `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`/`ADMIN_SEED_ROLE_ID`; `infra/env/audit-service.env.example` SHALL listar `AUDIT_RETRY_TTL_MS` y `AUDIT_MAX_RETRIES`. `scripts/bootstrap-env.sh` SHALL generar `ADMIN_SEED_PASSWORD`.

#### Scenario: Variables presentes
- **WHEN** se buscan `RECONCILE_GRACE_MS` y `AUDIT_RETRY_TTL_MS`
- **THEN** aparecen en la plantilla de su servicio

### Requirement: Cobertura
Cada servicio SHALL superar 70 % de líneas con el umbral de `jest.config.base.js`, excluyendo solo cableado declarativo (`main.ts`, `*.module.ts`, `dto/`, `*.schema.ts`, cliente Prisma generado).

#### Scenario: Cobertura
- **WHEN** se ejecuta el `test` de cualquiera de los dos servicios
- **THEN** termina en 0 y `coverage-summary.json` reporta `lines.pct >= 70`
