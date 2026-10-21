---
spec: coverage-report
change: document-diagnosis-delivery
wave: 1
epics: EP-DLV
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — coverage-report

> Spec canónica promovida desde el cambio archivado `document-diagnosis-delivery` (as-built, 2026-10-21). Describe la cobertura tal como existe; el reporte fusionado por script queda en Evolución.

## Requirements

### Requirement: Cobertura por componente con umbral
Cada componente con pruebas Jest SHALL heredar de `jest.config.base.js` los reporters `text`, `json-summary` y `lcov` y el umbral global de 70 % de líneas (ADR-007), de modo que `pnpm -r test -- --coverage` falle si un componente queda por debajo y deje `coverage/coverage-summary.json` y `coverage/lcov.info` en cada componente.

#### Scenario: Componente bajo el umbral
- **WHEN** las líneas cubiertas de un componente quedan por debajo del 70 %
- **THEN** su ejecución de Jest con cobertura termina con error

#### Scenario: Resumen por componente
- **WHEN** se ejecutan las pruebas con cobertura de un componente
- **THEN** existe `coverage/coverage-summary.json` en ese componente con el total de líneas

### Requirement: Resumen enlazado desde el README
El `README.md` raíz SHALL enlazar un resumen de cobertura por paquete (`docs/coverage/README.md`).

#### Scenario: Enlace presente
- **WHEN** se busca el resumen de cobertura en el README
- **THEN** el enlace apunta a un archivo existente

## Evolución

- `scripts/coverage-report.sh` que ejecute los componentes por ruta, fusione `lcov.info` y genere `docs/coverage.md` + `docs/coverage/<componente>.json` con estado por componente (`COVERAGE_MIN`).
