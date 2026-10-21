---
spec: service-runtime
change: build-auth-role-services
wave: 0,2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — service-runtime (`apps/auth-service` y `apps/role-service`)

> Spec canónica promovida desde el cambio archivado `build-auth-role-services`. Describe el comportamiento as-built de esqueleto, Prisma, Dockerfile y cobertura.

## Requirements

### Requirement: Servicio por capas y aislado
Cada servicio SHALL ser un paquete del workspace (`@toka/auth-service`, `@toka/role-service`) con `src/{domain,application,infrastructure,interfaces}`; `domain` y `application` SHALL NOT importar `@prisma/client`, `ioredis`, `amqplib` ni `jose`. Ningún servicio SHALL importar código de otro `apps/*`. Cada uno SHALL usar `@toka/logger` (logs JSON con `correlationId`), aplicar `helmet` y validar la configuración al arrancar (error `Missing required environment variable <X>` si falta una obligatoria). `GET /health` y `GET /ready` SHALL responder 200 `{status:'ok'}` sin autenticación.

#### Scenario: Configuración incompleta
- **WHEN** el servicio arranca sin `DATABASE_URL`
- **THEN** falla al arrancar con un mensaje que nombra la variable

#### Scenario: Capas limpias
- **WHEN** se inspeccionan los imports de `src/domain` y `src/application`
- **THEN** ninguno referencia Prisma, ioredis, amqplib ni `jose`

### Requirement: Base de datos propia con Prisma
Cada servicio SHALL tener `prisma/schema.prisma` conectado solo por su `DATABASE_URL` (`auth_user`/`auth_db`, `role_user`/`role_db`), con el cliente generado en `src/generated/prisma` (ignorado por git) y migraciones versionadas: auth `0001_init` (`credentials`, `user_roles_projection`, `role_names_projection`, `refresh_tokens`, `processed_events`) y `0002_role_permissions` (`role_names_projection.permissions TEXT[]`); role `0001_init` (`roles` con `name` único, `permissions TEXT[]`, `version` 1 por defecto; id asignado por la aplicación).

#### Scenario: Esquema de auth
- **WHEN** se aplican las migraciones de auth sobre una base vacía
- **THEN** existen las cinco tablas y `role_names_projection` tiene la columna `permissions`

### Requirement: Dockerfile por servicio
Cada servicio SHALL tener `apps/<svc>/Dockerfile` multi-etapa con contexto en la raíz, sobre `node:22-slim` con `openssl`, `corepack`, `pnpm install --frozen-lockfile --filter "@toka/<svc>..."` y compilación del servicio y sus `@toka/*`, imagen final con `USER node`, `EXPOSE 3001` (auth) o `3003` (role) y `CMD` que ejecuta `prisma migrate deploy` y luego `node dist/main.js`. El `.dockerignore` raíz SHALL excluir `node_modules`, `dist`, `coverage`, `secrets`, `.env*` e `infra/env/*.env`.

#### Scenario: Migraciones al arrancar
- **WHEN** el contenedor arranca con su `DATABASE_URL`
- **THEN** aplica las migraciones pendientes con el rol del servicio antes de escuchar

### Requirement: Cobertura
Cada servicio SHALL superar `coverageThreshold.global.lines: 70` excluyendo solo cableado y adaptadores de infraestructura (`main.ts`, `*.module.ts`, `src/generated/**`, `src/testing/**`, `infrastructure/{persistence,messaging,redis}/**`).

#### Scenario: Umbral
- **WHEN** se ejecutan las pruebas de ambos servicios
- **THEN** cada `coverage-summary.json` reporta ≥70 % de líneas
