---
spec: web-app-foundation
change: build-frontend-user-console
wave: 0,2
epics: EP-EX3
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — web-app-foundation

> Spec canónica promovida desde el cambio archivado `build-frontend-user-console`. Describe el comportamiento as-built, incluido el rediseño Nocturne.

## Requirements

### Requirement: App React + TypeScript con Jest + RTL y `config.ts` mockeable
`apps/web` SHALL ser un paquete pnpm llamado `web` (React 18, Vite, TypeScript, Redux Toolkit/RTK Query, react-router-dom, react-hook-form + zod). Su `jest.config.js` SHALL usar `testEnvironment: jsdom`, `testMatch` `**/*.spec.ts(x)`, `setupFilesAfterEnv: test/setup.ts` y `moduleNameMapper` de `^@/config$` hacia `test/configMock.ts`. Solo `src/config.ts` SHALL contener `import.meta`; el resto lo consume vía `@/config`. El script `test` SHALL usar el wrapper raíz `jest.run.js` y `build` SHALL ser `tsc --noEmit && vite build`.

#### Scenario: Aislamiento de `import.meta`
- **WHEN** se busca `import.meta` en `apps/web/src`
- **THEN** la única coincidencia es `src/config.ts`

### Requirement: Rutas de la consola
`src/routes.tsx` SHALL definir `/login` pública y, dentro de `RequireAuth`, `/` (Inicio), `/users`, `/roles`, `/permissions`, `/audit` y `/agent`; cualquier otra ruta SHALL redirigir a `/`.

#### Scenario: Ruta desconocida
- **WHEN** un usuario autenticado abre `/no-existe`
- **THEN** se le redirige a `/`

### Requirement: Inicio según permisos
La página de Inicio SHALL mostrar una tarjeta por sección a la que el usuario tiene acceso (Usuarios `users:read`, Roles y Permisos `roles:read`, Auditoría `audit:read`, Agente `agent:ask`) o un mensaje si no tiene ninguna.

#### Scenario: Auditor
- **WHEN** inicia sesión un usuario con solo `audit:read`
- **THEN** Inicio muestra solo la tarjeta de Auditoría

### Requirement: Estados de carga, error y feedback compartidos
`src/components/shared.tsx` SHALL ofrecer `Spinner` (`role=status`), `ErrorMessage` (`role=alert`; muestra el `message` del error NestJS, unido si es un arreglo, o un texto por defecto), `Toaster` alimentado por el slice `notifications` (éxito/error con cierre) y `ConfirmDialog` (`role=dialog`). Las pantallas SHALL reutilizarlos.

#### Scenario: Mensaje de error del backend
- **WHEN** una petición falla con `{statusCode: 409, message: "email duplicado"}`
- **THEN** `ErrorMessage` muestra "email duplicado"

### Requirement: Cobertura
`apps/web` SHALL superar el umbral de 70 % de líneas excluyendo `main.tsx`, `config.ts`, `*.d.ts`, `index.ts` y las pruebas.

#### Scenario: Umbral aplicado
- **WHEN** la cobertura de líneas de `apps/web` es inferior a 70 %
- **THEN** el `test` de `web` termina con código distinto de 0
