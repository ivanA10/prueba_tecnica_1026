---
spec: web-app-foundation
change: build-frontend-user-console
wave: 0,2
epics: EP-EX3
status: draft
created: 2026-10-20
---

# Spec — web-app-foundation

## ADDED Requirements

## Wave 0 — Andamiaje, pruebas y componentes compartidos

### Requirement: App React + TypeScript con Jest + RTL y `config.ts` mockeable
`apps/web` SHALL ser un paquete pnpm llamado `web` (React 18, Vite, TypeScript estricto) cuyo `jest.config.js` extienda `jest.config.base.js` con `testEnvironment: jsdom`, `testMatch` de `src/**/__tests__/**/*.test.tsx`, `@testing-library/jest-dom`, `whatwg-fetch` y `moduleNameMapper` de `^@/config$` hacia `test/configMock.ts`. Solo `src/config.ts` SHALL contener `import.meta`; el resto del código lo consume vía `@/config`. `pnpm --filter web build` y `pnpm --filter web lint` SHALL terminar con código 0.

#### Scenario: La app se prueba sin compilar `import.meta`
- **WHEN** se ejecuta Jest sobre `src/__tests__/app.test.tsx`
- **THEN** `App` se renderiza y `config.ts` real no se compila

#### Scenario: Aislamiento de `import.meta`
- **WHEN** se busca `import.meta` en `apps/web/src` excluyendo `config.ts`
- **THEN** no hay coincidencias

### Requirement: Estados de carga, error y feedback compartidos
La UI SHALL ofrecer `Spinner`, `ErrorMessage` (muestra `message` del error NestJS o un texto por defecto), `Toaster` alimentado por el slice `notifications` (éxito/error con cierre) y `ConfirmDialog`. Todas las pantallas SHALL reutilizarlos para loading, error y éxito.

#### Scenario: Mensaje de error del backend
- **WHEN** una petición falla con `{statusCode: 409, message: "email duplicado"}`
- **THEN** `ErrorMessage` muestra "email duplicado"

#### Scenario: Error sin cuerpo
- **WHEN** la petición falla por red sin cuerpo
- **THEN** `ErrorMessage` muestra el mensaje por defecto

## Wave 2 — Verificación integral y trazabilidad

### Requirement: Cobertura, build, lint y presupuesto de pruebas
`pnpm --filter web test -- --coverage` SHALL superar el umbral de 70 % de líneas con `collectCoverageFrom` excluyendo `main.tsx`, `config.ts`, `*.d.ts` y `__tests__`; el total de pruebas del cambio SHALL ser ≤30.

#### Scenario: Umbral aplicado
- **WHEN** la cobertura de líneas de `apps/web` es inferior a 70 %
- **THEN** `pnpm --filter web test` termina con código distinto de 0

### Requirement: Trazabilidad actualizada
Las filas EX3-R01..R18, R20..R28 y EX0-R13..R15 de `docs/traceability.md` asignadas a este cambio SHALL pasar a `Implementado`; EX3-R19 SHALL seguir `Planeado` (cambio 9). La fila EX3-R13 SHALL indicar "RTK Query sobre Fetch API" y la fila EX3-R08 la ruta real de pruebas `apps/web/src/**/__tests__/*.test.tsx`.

#### Scenario: Estado de filas
- **WHEN** se inspecciona `docs/traceability.md`
- **THEN** ninguna fila EX3 de este cambio (salvo R19) contiene `Planeado`
