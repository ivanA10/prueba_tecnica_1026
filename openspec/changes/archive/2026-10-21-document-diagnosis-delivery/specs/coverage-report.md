---
spec: coverage-report
change: document-diagnosis-delivery
wave: 1
epics: EP-DLV
status: draft
created: 2026-10-20
---

# Spec — coverage-report

## ADDED Requirements

### Requirement: Reporte de cobertura fusionado como artefacto
`scripts/coverage-report.sh` SHALL ejecutar las pruebas componente por componente con filtro por ruta (`pnpm --filter "./<ruta>" test`; nunca una invocación de todo el monorepo) (los reporters `json-summary` y `lcov` ya los activa `jest.config.base.js`), recoger por componente `coverage/coverage-summary.json` y `coverage/lcov.info` de `apps/*` y `packages/*`, y generar `docs/coverage/<componente>.json`, `docs/coverage/summary.json`, `docs/coverage/lcov.info` (fusionado, con `SF:` prefijado por la ruta del componente) y `docs/coverage.md`. El script SHALL ser idempotente y NO SHALL modificar configuración de Jest.

#### Scenario: Artefactos generados
- **WHEN** se ejecuta `bash scripts/coverage-report.sh` con todos los componentes presentes
- **THEN** existen `docs/coverage/summary.json`, `docs/coverage/lcov.info` y `docs/coverage.md`

### Requirement: Umbral y componentes obligatorios
El script SHALL comparar las líneas de cada componente con `COVERAGE_MIN` (por defecto 70, ADR-007) y terminar con código distinto de 0 si algún componente queda bajo el umbral o si falta alguno de los esperados: `auth-service`, `user-service`, `role-service`, `audit-service`, `ai-agent-service`, `web`, `contracts`, `logger`, `jwt-guard`, `http-client`. Las ramas SHALL reportarse sin umbral.

#### Scenario: Componente ausente
- **WHEN** falta `coverage/coverage-summary.json` de un componente esperado
- **THEN** el script termina con código 1 y nombra el componente

#### Scenario: Bajo el umbral
- **WHEN** un componente tiene menos de 70 % de líneas
- **THEN** el script termina con código 1 y `docs/coverage.md` marca ese componente como `FALLA`

### Requirement: Documento legible
`docs/coverage.md` SHALL contener `## Resumen` con una fila por componente (líneas %, ramas %, umbral, estado), `## Cómo regenerar` con el comando `bash scripts/coverage-report.sh` y `## Notas` que explique que las ramas son informativas (ADR-007) y que los datos por paquete viven en `docs/coverage/`.

#### Scenario: Tabla completa
- **WHEN** se buscan los 10 componentes esperados en `docs/coverage.md`
- **THEN** todos aparecen
