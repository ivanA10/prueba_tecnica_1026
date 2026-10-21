---
spec: compose-orchestration
change: harden-compose-resilience-security
wave: 0
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — compose-orchestration

> Spec canónica promovida desde el cambio archivado `harden-compose-resilience-security` (as-built, 2026-10-21).

## Requirements

### Requirement: Servicios de aplicación y `web` en el compose
`docker-compose.yml` SHALL definir, además de la infraestructura (`postgres`, `mongo`, `redis`, `rabbitmq`, `qdrant`), los servicios `web`, `auth-service`, `user-service`, `role-service`, `audit-service` y `ai-agent-service` con `build` hacia su Dockerfile, `healthcheck` (`node -e "fetch('http://127.0.0.1:<puerto>/health')…"` en los puertos `3001`–`3005`; `wget` a `/healthz` en `web`) y `depends_on` con `condition: service_healthy`. Cada servicio SHALL cargar únicamente su `infra/env/<servicio>.env` (ninguno recibe el `.env` raíz). `auth-service` SHALL recibir el secreto `jwt_private.pem` y ningún otro servicio.

#### Scenario: Configuración válida con todos los servicios
- **WHEN** se ejecuta `docker compose config -q` con `.env` e `infra/env/*.env` generados por `scripts/bootstrap-env.sh`
- **THEN** termina con código 0 y la configuración contiene los 11 servicios (5 de aplicación, `web`, 5 de infraestructura)

#### Scenario: Arranque ordenado por salud
- **WHEN** se ejecuta `docker compose up -d --build --wait`
- **THEN** todos los servicios quedan `healthy` y `web` arranca después de los 5 servicios de aplicación

### Requirement: Un solo puerto publicado y redes aisladas
Solo `web` SHALL publicar un puerto al host (`${WEB_PORT:-8080}:8080`). `web` SHALL estar en `public` y `edge`; los 5 servicios en `edge` y `backend`; únicamente `ai-agent-service` SHALL unirse además a `egress`. Las redes `edge` y `backend` SHALL declararse `internal: true`; la infraestructura vive solo en `backend`.

#### Scenario: Sin puertos adicionales
- **WHEN** se inspecciona `docker compose config --format json`
- **THEN** el único servicio con `ports` no vacío es `web` y su puerto de contenedor es `8080`

### Requirement: Migraciones al arrancar
`auth-service`, `user-service` y `role-service` SHALL aplicar sus migraciones de Prisma (`prisma migrate deploy`, idempotente) en el `CMD` de su imagen antes de iniciar `node dist/main.js`. Si la migración falla, el contenedor SHALL terminar con código distinto de 0 y los servicios que dependen de su salud SHALL NOT arrancar. `audit-service` y `ai-agent-service` SHALL NOT ejecutar migraciones de Prisma.

#### Scenario: Esquema aplicado en el primer arranque
- **WHEN** el stack arranca con volúmenes vacíos
- **THEN** las tablas de cada servicio Prisma existen en su base y el servicio queda `healthy`

#### Scenario: Arranque repetido
- **WHEN** se ejecuta `docker compose up -d --wait` por segunda vez sin `down -v`
- **THEN** la migración no falla ni duplica datos

## Evolución

- `security_opt: [no-new-privileges:true]` y `cap_drop: [ALL]` en los 5 servicios Node.
