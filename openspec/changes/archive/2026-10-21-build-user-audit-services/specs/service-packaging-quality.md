---
spec: service-packaging-quality
change: build-user-audit-services
wave: 2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — Empaquetado y calidad de user-service y audit-service

Cubre EX2-R07 (Dockerfile por servicio) y EX2-R08 (cobertura >=70 %) de `docs/traceability.md`. Decisiones: `design.md` D15–D16.

## Wave 2 — Empaquetado

### Requirement: Imagen por servicio
Cada servicio SHALL tener un Dockerfile multi-etapa (contexto raíz) que compila `@toka/*` y el servicio, ejecuta como usuario no root, define `HEALTHCHECK` sobre `/health` y arranca con `node dist/main.js`. El `.dockerignore` SHALL excluir `node_modules`, `.env`, `infra/env/*.env` y `secrets/`. El servicio NO se agrega a `docker-compose.yml` (cambio 5).

#### Scenario: Build y usuario
- **WHEN** se ejecuta `docker build` de ambas imágenes
- **THEN** construyen sin error y `id -u` de la imagen no es 0

### Requirement: Entorno completo
Las plantillas `infra/env/{user,audit}-service.env.example` SHALL listar todas las variables que lee `config.ts` (puertos, URLs, timeouts, presupuesto, gracia de reconciliación, TTL y máximo de reintentos) con valores por defecto no secretos.

#### Scenario: Variables presentes
- **WHEN** se buscan `RECONCILE_GRACE_MS` y `AUDIT_RETRY_TTL_MS`
- **THEN** aparecen en la plantilla de su servicio

## Wave 2 — Cierre

### Requirement: Cobertura y tope de pruebas
Cada servicio SHALL alcanzar >=70 % de líneas con el umbral de `jest.config.base.js`; solo se excluye cableado declarativo (`main.ts`, `*.module.ts`, `dto/`, `*.schema.ts`, cliente Prisma generado). El cambio SHALL NOT superar 30 pruebas.

#### Scenario: Cobertura
- **WHEN** se ejecuta `pnpm --filter <servicio> test`
- **THEN** termina en 0 y `coverage-summary.json` reporta `lines.pct >= 70`

### Requirement: Trazabilidad
`docs/traceability.md` SHALL marcar EX2-R02, EX2-R03 y EX2-R08 como "Implementado" con rutas reales, y los ADR conservarán las marcas Implementado/Evolución.

#### Scenario: Estado actualizado
- **WHEN** se lee la fila EX2-R03
- **THEN** indica "Implementado" y `build-user-audit-services`
