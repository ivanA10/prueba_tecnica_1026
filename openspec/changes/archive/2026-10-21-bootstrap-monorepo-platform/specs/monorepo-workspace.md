---
spec: monorepo-workspace
change: bootstrap-monorepo-platform
wave: 0,2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — monorepo-workspace

## ADDED Requirements

## Wave 0 — Workspace y herramientas

### Requirement: Workspace pnpm con comandos canónicos
El repositorio SHALL ser un workspace pnpm (`apps/*`, `packages/*`) cuyos scripts raíz coincidan con `AGENTS.md` → Commands: `build` = `pnpm -r build`, `test` = `pnpm -r test -- --coverage`, `lint` = `pnpm -r lint`. Node SHALL exigirse `>=22`.

#### Scenario: Instalación y herramientas disponibles
- **WHEN** se ejecuta `pnpm install` en una copia limpia
- **THEN** termina con código 0 y `tsc`, `eslint` y `prettier` responden `--version`

### Requirement: Configuración base reutilizable con umbral de cobertura
`tsconfig.base.json` SHALL activar `strict` y los decoradores de NestJS. `jest.config.base.js` SHALL activar `collectCoverage` y `coverageThreshold.global.lines` = 70, de modo que cualquier paquete que la extienda falle bajo ese umbral (ADR-007); las ramas SHALL ser informativas.

#### Scenario: Umbral aplicado por herencia
- **WHEN** un paquete con cobertura de líneas inferior a 70 % ejecuta `pnpm --filter <pkg> test`
- **THEN** el comando termina con código distinto de 0

## Wave 2 — Verificación integral

### Requirement: El workspace completo compila, prueba y valida estilo
Con lockfile congelado, `pnpm -r build`, `pnpm -r test -- --coverage` y `pnpm -r lint` SHALL pasar, y cada paquete SHALL producir `coverage/coverage-summary.json` con >= 70 % de líneas. Ningún paquete SHALL importar otro `@toka/*`.

#### Scenario: Paquetes independientes
- **WHEN** se ejecuta `grep -r '@toka/' packages/*/src`
- **THEN** no hay coincidencias

### Requirement: ADR-001 y trazabilidad reflejan lo implementado
ADR-001 SHALL listar `packages/http-client` entre los paquetes transversales y declarar que el esqueleto de cada servicio NestJS se crea en su `build-*`. Las filas EX2-R06, R09, R10, R26 y R30 de `docs/traceability.md` SHALL pasar a `Implementado`.

#### Scenario: Estado actualizado
- **WHEN** se buscan esas filas con estado `Planeado`
- **THEN** no hay ninguna
