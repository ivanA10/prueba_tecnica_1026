---
spec: infra-compose
change: bootstrap-monorepo-platform
wave: 0,2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — infra-compose

## ADDED Requirements

## Wave 0 — Infraestructura local

### Requirement: Compose solo de infraestructura con salud y aislamiento de red
`docker-compose.yml` (`name: toka`) SHALL definir `postgres`, `mongo`, `redis`, `rabbitmq` y `qdrant`, cada uno con `healthcheck`, sin `ports:` publicados y conectados solo a `backend` (`internal: true`). SHALL declarar además las redes `public`, `edge` (`internal: true`) y `egress` de `docs/architecture/04-docker-compose-diseno.md`. SHALL NOT incluir servicios de aplicación ni el perfil `observability`.

#### Scenario: Configuración válida y sin puertos al host
- **WHEN** se ejecuta `docker compose config -q`
- **THEN** termina con código 0 y ningún servicio publica puertos

### Requirement: Aislamiento por rol de base y por usuario
El init de Postgres SHALL crear una base y un rol por servicio (`auth`, `user`, `role`) con `REVOKE ALL ... FROM PUBLIC` y conexión solo para el rol propietario. El init de Mongo SHALL crear `audit_user` con `readWrite` solo en `audit_db`. Redis SHALL arrancar con `requirepass ${REDIS_PASSWORD}`.

#### Scenario: Rol sin permisos cruzados
- **WHEN** `auth_user` intenta conectarse a `user_db`
- **THEN** la conexión es rechazada

### Requirement: RabbitMQ con credenciales por defecto y sin topología estática
RabbitMQ SHALL arrancar sin `load_definitions` para que `RABBITMQ_DEFAULT_USER/PASS` se apliquen. Los exchanges `toka.events` (topic, durable) y `toka.events.dlx` (durable), las colas, `.retry` y `.dlq` SHALL NOT declararse en infraestructura: los servicios los afirman de forma idempotente (`assertExchange`) con las constantes de `@toka/contracts`.

#### Scenario: Credenciales válidas
- **WHEN** se ejecuta `rabbitmqctl authenticate_user` con `RABBITMQ_USER` y `RABBITMQ_PASSWORD`
- **THEN** termina con código 0

### Requirement: Entorno por servicio sin secretos versionados
SHALL existir `.env.example` (solo infra) e `infra/env/<servicio>.env.example` para `auth`, `user`, `role`, `audit` y `ai-agent`. `scripts/bootstrap-env.sh` SHALL ser idempotente, generar valores coherentes entre infra y servicio y crear `secrets/jwt_private.pem` (RSA). `.env`, `infra/env/*.env` y `secrets/` SHALL estar en `.gitignore`.

#### Scenario: Sin marcadores residuales
- **WHEN** se ejecuta el script dos veces
- **THEN** no queda `change-me` en los `.env` generados y la contraseña de `auth_db` coincide entre `.env` e `infra/env/auth-service.env`

## Wave 2 — Smoke de infraestructura

### Requirement: Arranque ordenado por salud
`docker compose up -d --wait` SHALL dejar los 5 contenedores en estado healthy usando `.env` generado por el script.

#### Scenario: Redis exige contraseña
- **WHEN** se ejecuta `redis-cli ping` sin credenciales
- **THEN** la respuesta no es `PONG`; con `REDISCLI_AUTH` válido sí lo es
