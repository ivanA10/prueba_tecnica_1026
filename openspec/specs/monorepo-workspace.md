---
spec: monorepo-workspace
change: bootstrap-monorepo-platform
wave: 0,2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — monorepo-workspace

> Spec canónica promovida desde el cambio archivado `bootstrap-monorepo-platform`. Describe el comportamiento as-built.

## Requirements

### Requirement: Workspace pnpm con comandos canónicos
El repositorio SHALL ser un workspace pnpm (`apps/*`, `packages/*`, `e2e`) con `packageManager` fijado (`pnpm@12.14.0`) y `engines.node >=22`. Los scripts raíz SHALL coincidir con `AGENTS.md` → Commands: `build` = `pnpm -r build`, `test` = `pnpm -r test -- --coverage`, `lint` = `pnpm -r lint`. `pnpm-workspace.yaml` SHALL declarar `allowBuilds` para los paquetes con scripts de instalación.

#### Scenario: Comandos canónicos
- **WHEN** se lee `package.json` raíz
- **THEN** `scripts.build`, `scripts.test` y `scripts.lint` son exactamente los de `AGENTS.md`

### Requirement: `pnpm -r test -- --coverage` funciona sin patrones espurios
El script `test` de cada paquete y app SHALL invocar `node ../../jest.run.js`, que elimina el argumento `--` literal antes de delegar en Jest.

#### Scenario: Argumento `--` reenviado por pnpm
- **WHEN** se ejecuta `pnpm -r test -- --coverage`
- **THEN** Jest recibe `--coverage` y no interpreta `--` como inicio de patrones de ruta

### Requirement: Configuración base reutilizable con umbral de cobertura
`tsconfig.base.json` SHALL activar `strict` y los decoradores de NestJS. `jest.config.base.js` SHALL activar `collectCoverage`, excluir `index.ts` y `*.spec.ts` de la cobertura y fijar `coverageThreshold.global.lines: 70`; las ramas son informativas.

#### Scenario: Umbral aplicado por herencia
- **WHEN** un paquete que extiende la base tiene menos de 70 % de líneas cubiertas
- **THEN** su comando `test` termina con código distinto de 0

### Requirement: Paquetes compartidos independientes
Ningún archivo de `packages/*/src` SHALL importar otro paquete `@toka/*`.

#### Scenario: Independencia
- **WHEN** se ejecuta `grep -r '@toka/' packages/*/src` excluyendo pruebas
- **THEN** no hay coincidencias

### Requirement: ADR-001 refleja el alcance compartido
ADR-001 SHALL listar `packages/http-client` entre los paquetes transversales, declarar `jwt-guard` completo en este cambio e indicar que el esqueleto de cada servicio NestJS se crea en su `build-*`. Las filas EX2-R06, R09, R10, R26 y R30 de `docs/traceability.md` SHALL estar en `Implementado`.

#### Scenario: Estado de trazabilidad
- **WHEN** se buscan las filas EX2-R06, R09, R10, R26 y R30
- **THEN** ninguna está en `Planeado`
