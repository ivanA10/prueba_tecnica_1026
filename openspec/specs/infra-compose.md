---
spec: infra-compose
change: bootstrap-monorepo-platform
wave: 0,2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — infra-compose

> Spec canónica promovida desde el cambio archivado `bootstrap-monorepo-platform`. Describe el comportamiento as-built. Los servicios de aplicación y `web` del mismo `docker-compose.yml` se especifican en `service-runtime`, `service-packaging-quality` y `web-gateway-docker`.

## Requirements

### Requirement: Infraestructura con salud y aislamiento de red
`docker-compose.yml` (`name: toka`) SHALL definir `postgres` (17), `mongo` (7), `redis` (7), `rabbitmq` (3.13-management) y `qdrant` (v1.15.0), cada uno con `healthcheck`, volumen con nombre, `restart: unless-stopped`, sin `ports:` publicados y conectados solo a la red `backend`. SHALL declarar las redes `public`, `edge` (`internal: true`), `backend` (`internal: true`) y `egress`. Solo el servicio `web` publica un puerto en el host.

#### Scenario: Infraestructura sin puertos al host
- **WHEN** se ejecuta `docker compose config`
- **THEN** ninguno de los cinco servicios de infraestructura tiene `ports` y todos están solo en `backend`

### Requirement: Aislamiento por rol de base y por usuario
El init de Postgres (`infra/postgres/init/01-roles-and-databases.sh`) SHALL crear `auth_db`, `user_db` y `role_db`, cada una con su rol propietario (`<svc>_user`), `REVOKE ALL ON DATABASE ... FROM PUBLIC` y `GRANT CONNECT` solo a ese rol. El init de Mongo (`infra/mongo/init/01-audit-user.js`) SHALL crear `audit_user` con `readWrite` solo en `audit_db`. Redis SHALL arrancar con `--requirepass ${REDIS_PASSWORD}` y `--appendonly yes`. Los scripts de init se montan `:ro`.

#### Scenario: Rol sin permisos cruzados
- **WHEN** `auth_user` intenta conectarse a `user_db`
- **THEN** la conexión es rechazada porque solo el propietario tiene `CONNECT`

### Requirement: RabbitMQ sin topología estática
RabbitMQ SHALL arrancar sin `load_definitions` para que `RABBITMQ_DEFAULT_USER/PASS` se apliquen. Exchanges, colas, `.retry` y `.dlq` SHALL NOT declararse en infraestructura: cada servicio los afirma de forma idempotente con las constantes de `@toka/contracts`.

#### Scenario: Topología creada por los servicios
- **WHEN** arranca un servicio que publica o consume
- **THEN** afirma `toka.events` y `toka.events.dlx` con `assertExchange` antes de usarlos

### Requirement: Entorno por servicio sin secretos versionados
SHALL existir `.env.example` e `infra/env/{auth,user,role,audit,ai-agent}-service.env.example`. `scripts/bootstrap-env.sh` SHALL ser idempotente, crear los `.env` que falten a partir de las plantillas, sustituir marcadores por valores de `openssl rand -hex 16` coherentes entre infra y servicio, generar `ADMIN_SEED_PASSWORD` y crear `secrets/jwt_private.pem` (RSA 2048) solo si no existe. `.env`, `.env.*` (salvo `.env.example`), `infra/env/*.env` y `secrets/` SHALL estar en `.gitignore`; `.gitattributes` SHALL forzar `eol=lf`.

#### Scenario: Ejecución repetida
- **WHEN** se ejecuta el script dos veces
- **THEN** no quedan marcadores en los `.env` generados y la clave RSA existente no se regenera

#### Scenario: Secretos fuera de git
- **WHEN** se ejecuta `git check-ignore` sobre `.env`, `infra/env/auth-service.env` y `secrets/jwt_private.pem`
- **THEN** los tres están ignorados
