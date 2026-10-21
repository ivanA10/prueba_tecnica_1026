---
spec: compose-orchestration
change: harden-compose-resilience-security
wave: 0
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — compose-orchestration

## ADDED Requirements

## Wave 0 — Compose integrado

### Requirement: Servicios de aplicación y `web` en el compose
`docker-compose.yml` SHALL definir, además de la infraestructura del cambio 2, los servicios `web`, `auth-service`, `user-service`, `role-service`, `audit-service` y `ai-agent-service` con `build` hacia su Dockerfile, `expose` del puerto de `04` (`3001`–`3005`), `healthcheck` y `depends_on` con `condition: service_healthy` según `docs/architecture/04-docker-compose-diseno.md`. Cada servicio SHALL cargar únicamente su `infra/env/<servicio>.env` (ninguno recibe el `.env` raíz). `auth-service` SHALL recibir el secreto `jwt_private_key` y ningún otro servicio.

#### Scenario: Configuración válida con todos los servicios
- **WHEN** se ejecuta `docker compose config -q` con `.env` e `infra/env/*.env` generados
- **THEN** termina con código 0 y la configuración contiene los 11 servicios base (5 de aplicación, `web`, 5 de infraestructura)

#### Scenario: Arranque ordenado por salud
- **WHEN** se ejecuta `docker compose up -d --build --wait --wait-timeout 300`
- **THEN** todos los servicios quedan `healthy` y `web` es el último en arrancar

### Requirement: Un solo puerto publicado y redes aisladas
Solo `web` SHALL publicar un puerto al host (`8080:8080`). `web` SHALL estar en `public` y `edge`; los 5 servicios en `edge` y `backend`; únicamente `ai-agent-service` SHALL unirse además a `egress`. `user-service` SHALL NOT estar en `egress` ni en `public`. Los 5 servicios Node SHALL declarar `security_opt: [no-new-privileges:true]` y `cap_drop: [ALL]`.

#### Scenario: Sin puertos adicionales
- **WHEN** se inspecciona `docker compose config --format json`
- **THEN** el único servicio con `ports` no vacío es `web` y expone `8080`

### Requirement: Migraciones al arrancar
`auth-service`, `user-service` y `role-service` SHALL aplicar sus migraciones de Prisma (`migrate deploy`, idempotente) antes de iniciar el proceso de la aplicación. Si la migración falla, el contenedor SHALL terminar con código distinto de 0 y los servicios dependientes SHALL NOT arrancar. `audit-service` y `ai-agent-service` SHALL NOT ejecutar migraciones de Prisma.

#### Scenario: Esquema aplicado en el primer arranque
- **WHEN** el stack arranca con volúmenes vacíos
- **THEN** las tablas de cada servicio Prisma existen en su base y el servicio queda `healthy`

#### Scenario: Arranque repetido
- **WHEN** se ejecuta `docker compose up -d --wait` por segunda vez sin `down -v`
- **THEN** la migración no falla ni duplica datos
