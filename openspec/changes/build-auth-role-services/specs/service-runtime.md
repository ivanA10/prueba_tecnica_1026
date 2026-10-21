---
spec: service-runtime
change: build-auth-role-services
wave: 0,2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — service-runtime (esqueleto, Prisma, logging, Dockerfile y cobertura de `apps/auth-service` y `apps/role-service`)

## Wave 0 — Esqueleto, dependencias y esquemas de datos

### ADDED Requirements

### Requirement: Esqueleto Clean Architecture por servicio
Cada servicio SHALL ser un paquete del workspace (`@toka/auth-service`, `@toka/role-service`) con capas `domain`, `application`, `infrastructure` e `interfaces`; los casos de uso SHALL depender de puertos, no de Prisma, Redis, `jose`, argon2 ni amqplib. SHALL exponer `GET /health` y `GET /ready` (ambos 200 `{status:'ok'}`, públicos), usar `@toka/logger` (middleware de `correlationId` e interceptor de petición; logs JSON) y validar configuración al arrancar (falla con mensaje claro si falta una variable obligatoria). SHALL depender de `@toka/contracts`, `@toka/logger` y `@toka/jwt-guard` con `workspace:*` y NOT de otro servicio ni del código de otro `apps/*`.

#### Scenario: Servicio aislado
- **WHEN** se inspeccionan los imports de `apps/auth-service/src` y `apps/role-service/src`
- **THEN** ninguno referencia al otro servicio, y `domain`/`application` no importan `@prisma/client`, `ioredis`, `amqplib` ni `jose`

### Requirement: Base de datos propia con Prisma
Cada servicio SHALL tener `prisma/schema.prisma` con el modelo de `design.md` (`auth_db`: `credentials`, `user_roles_projection`, `role_names_projection`, `refresh_tokens`, `processed_events`; `role_db`: `roles`) conectado solo por `DATABASE_URL` de su propio rol, y una migración inicial versionada (`prisma/migrations/0001_init/migration.sql` + `migration_lock.toml`). El cliente generado SHALL salir a `src/generated/prisma` (ignorado por git).

#### Scenario: Migración inicial
- **WHEN** se aplica `0001_init/migration.sql` sobre una base vacía
- **THEN** existen exactamente las tablas del modelo con las columnas `user_last_version`, `last_version`, `family_id`, `token_hash` y `version` según corresponda

## Wave 2 — Empaquetado y verificación

### ADDED Requirements

### Requirement: Dockerfile por servicio
Cada servicio SHALL tener `apps/<svc>/Dockerfile` multi-etapa (contexto = raíz del monorepo), basado en Node 22 (glibc), que instala con `pnpm install --frozen-lockfile`, compila los paquetes `@toka/*` necesarios y el servicio (incluido el cliente Prisma), y ejecuta como usuario no root. El comando de arranque SHALL aplicar `prisma migrate deploy` y luego `node dist/main.js`. La imagen SHALL NOT contener `secrets/`, `.env` ni la clave privada.

#### Scenario: Imagen construible y cargable
- **WHEN** se construye la imagen del servicio y se carga `dist/app.module.js` dentro de ella
- **THEN** la construcción termina con éxito y el módulo carga sin errores de resolución (incluido el cliente Prisma)

### Requirement: Migraciones aplicables con el rol de servicio
La migración inicial de cada servicio SHALL poder aplicarse con `auth_user` sobre `auth_db` y `role_user` sobre `role_db` en el Postgres del cambio 2, sin privilegios de administrador.

#### Scenario: Aplicación con rol de servicio
- **WHEN** se ejecuta `0001_init/migration.sql` con las credenciales del rol de servicio
- **THEN** termina sin errores y las tablas del modelo existen

### Requirement: Cobertura y límites de prueba
Cada servicio SHALL superar `coverageThreshold.global.lines: 70` con el `collectCoverageFrom` declarado en `design.md` → `## Testing strategy` (solo exclusiones de cableado/generado) y generar `coverage/coverage-summary.json`. El cambio SHALL NOT superar 30 pruebas en total ni 8 por archivo.

#### Scenario: Umbral
- **WHEN** se ejecutan las pruebas de ambos servicios
- **THEN** cada `coverage-summary.json` reporta ≥ 70 % de líneas
