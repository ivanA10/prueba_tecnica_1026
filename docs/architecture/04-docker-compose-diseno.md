# 04 — Diseño de docker-compose

Este documento fija el **diseño** de la orquestación local (un único `docker-compose.yml` en la raíz del monorepo). El bloque YAML es un diseño dentro de Markdown, no el archivo real: el cambio `harden-compose-resilience-security` lo implementa y lo reconcilia con este texto. Decisiones relacionadas: [ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md) (BD por servicio, rol por base), [ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md) (JWT/JWKS), [ADR-007](../adrs/ADR-007-observability-quality-testing.md) (perfil `observability`) y [ADR-010](../adrs/ADR-010-frontend-react-rtk-nginx-gateway.md) (nginx como reverse proxy / gateway ligero).

## Principios de diseño

- **Solo `web` se publica al host** (`8080`). Los 5 servicios, las bases de datos y el broker viven en redes internas de Docker; no hay `ports:` en ellos.
- **`/internal/*` y `/oauth/*` no tienen ruta en nginx**: solo son alcanzables servicio a servicio dentro de la red interna.
- **Arranque ordenado por salud**: cada dependencia declara `healthcheck` y los consumidores usan `depends_on` con `condition: service_healthy`.
- **Configuración por entorno, mínima por servicio**: cada servicio lee solo `infra/env/<servicio>.env` (copia local de `infra/env/<servicio>.env.example`, sin valores reales en git) con su propia URL/credenciales de BD, su `client_id`/`client_secret` y lo que necesita. El `.env` de la raíz solo alimenta a los contenedores de infraestructura (postgres, mongo, redis, rabbitmq, grafana). Ningún servicio recibe el `.env` completo, de modo que un servicio comprometido no ve las credenciales de las bases de otro ([ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md)). El compose usa solo marcadores `${VAR}` para infraestructura.
- **Un rol de BD por base** en la única instancia de Postgres (script de init); los prefijos de Redis son convención (usuarios ACL = Evolución).
- **Cuatro redes de aplicación** (más `grafana-ui` opcional): `public` (solo `web`; es la única que publica `8080`), `edge` con `internal: true` (`web` + los 5 servicios que nginx enruta), `backend` con `internal: true` (servicios + almacenes + broker) y `egress` (con salida a Internet), a la que solo se une `ai-agent-service` para llegar al proveedor LLM. Un contenedor unido a cualquier red no interna tiene salida a Internet, por eso `edge` y `backend` son internas: **solo `ai-agent-service` (vía `egress`) y `web` (vía `public`, solo para publicar el puerto) tienen salida**; los demás servicios no pueden exfiltrar datos. `web` no toca las bases de datos. Grafana (perfil opcional) usa `grafana-ui` para publicar su puerto en loopback, porque una red `internal` no puede publicar puertos.
- **Redis con contraseña**: `requirepass` con `${REDIS_PASSWORD}` y credenciales en el `REDIS_URL` de cada servicio. Los usuarios ACL por prefijo siguen siendo Evolución.

## Bloque de diseño

```yaml
# Diseño ilustrativo: etiquetas de imagen needs-verification.
name: toka

x-service-defaults: &service-defaults
  restart: unless-stopped
  networks: [backend]
  # Sin env_file común: cada servicio declara el suyo (infra/env/<servicio>.env)

services:
  web:
    build: ./apps/web                 # React 18 + Vite compilado, servido por nginx
    ports:
      - "8080:8080"                   # ÚNICO puerto publicado al host
    networks: [public, edge]            # public publica 8080; edge es interna
    environment:
      AUTH_UPSTREAM: http://auth-service:3001
      USER_UPSTREAM: http://user-service:3002
      ROLE_UPSTREAM: http://role-service:3003
      AUDIT_UPSTREAM: http://audit-service:3004
      AGENT_UPSTREAM: http://ai-agent-service:3005
    depends_on:
      auth-service: { condition: service_healthy }
      user-service: { condition: service_healthy }
      role-service: { condition: service_healthy }
      audit-service: { condition: service_healthy }
      ai-agent-service: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 5

  auth-service:
    <<: *service-defaults
    build: { context: ., dockerfile: apps/auth-service/Dockerfile }
    networks: [edge, backend]
    expose: ["3001"]
    env_file: [infra/env/auth-service.env]   # DATABASE_URL, REDIS_URL, RABBITMQ_URL, JWT_KID, ACCESS_TOKEN_TTL_SECONDS, COOKIE_SECURE, SVC_CLIENT_ID/SECRET
    environment:
      PORT: 3001
      JWT_PRIVATE_KEY_FILE: /run/secrets/jwt_private_key
    secrets: [jwt_private_key]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  user-service:
    <<: *service-defaults
    build: { context: ., dockerfile: apps/user-service/Dockerfile }
    networks: [edge, backend]
    expose: ["3002"]
    env_file: [infra/env/user-service.env]   # DATABASE_URL, REDIS_URL, RABBITMQ_URL, SVC_CLIENT_ID/SECRET
    environment:
      PORT: 3002
      AUTH_JWKS_URL: http://auth-service:3001/.well-known/jwks.json
      AUTH_INTERNAL_URL: http://auth-service:3001
      ROLE_SERVICE_URL: http://role-service:3003
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
      auth-service: { condition: service_healthy }
      role-service: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3002/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  role-service:
    <<: *service-defaults
    build: { context: ., dockerfile: apps/role-service/Dockerfile }
    networks: [edge, backend]
    expose: ["3003"]
    env_file: [infra/env/role-service.env]   # DATABASE_URL, REDIS_URL, RABBITMQ_URL
    environment:
      PORT: 3003
      AUTH_JWKS_URL: http://auth-service:3001/.well-known/jwks.json
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3003/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  audit-service:
    <<: *service-defaults
    build: { context: ., dockerfile: apps/audit-service/Dockerfile }
    networks: [edge, backend]
    expose: ["3004"]
    env_file: [infra/env/audit-service.env]   # MONGO_URL (audit_user), REDIS_URL, RABBITMQ_URL
    environment:
      PORT: 3004
      AUTH_JWKS_URL: http://auth-service:3001/.well-known/jwks.json
    depends_on:
      mongo: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3004/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  ai-agent-service:
    <<: *service-defaults
    build: { context: ., dockerfile: apps/ai-agent-service/Dockerfile }   # imagen Debian-slim con modelo ONNX horneado
    networks: [edge, backend, egress]   # única con salida a Internet (proveedor LLM)
    expose: ["3005"]
    env_file: [infra/env/ai-agent-service.env]   # REDIS_URL, RABBITMQ_URL, LLM_PROVIDER, ANTHROPIC_API_KEY, LLM_PRICE_*
    environment:
      PORT: 3005
      QDRANT_URL: http://qdrant:6333
      AUTH_JWKS_URL: http://auth-service:3001/.well-known/jwks.json
      USER_SERVICE_URL: http://user-service:3002
    depends_on:
      qdrant: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
      user-service: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3005/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s

  postgres:
    image: postgres:17                # needs-verification: etiqueta exacta
    networks: [backend]
    environment:
      POSTGRES_USER: ${POSTGRES_ADMIN_USER}
      POSTGRES_PASSWORD: ${POSTGRES_ADMIN_PASSWORD}
      AUTH_DB_PASSWORD: ${AUTH_DB_PASSWORD}
      USER_DB_PASSWORD: ${USER_DB_PASSWORD}
      ROLE_DB_PASSWORD: ${ROLE_DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_ADMIN_USER}"]
      interval: 5s
      timeout: 3s
      retries: 10

  mongo:
    image: mongo:7                    # needs-verification
    networks: [backend]
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ADMIN_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ADMIN_PASSWORD}
      MONGO_INITDB_DATABASE: audit_db
      AUDIT_DB_PASSWORD: ${AUDIT_DB_PASSWORD}
    volumes:
      - mongo_data:/data/db
      - ./infra/mongo/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7                    # needs-verification
    networks: [backend]
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD-SHELL", "REDISCLI_AUTH=\"$$REDIS_PASSWORD\" redis-cli ping | grep -q PONG"]
      interval: 5s
      timeout: 3s
      retries: 10

  rabbitmq:
    image: rabbitmq:3.13-management   # needs-verification; gestión 15672 solo red interna
    networks: [backend]
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

  qdrant:
    image: qdrant/qdrant              # needs-verification: fijar etiqueta
    networks: [backend]
    volumes:
      - qdrant_data:/qdrant/storage
    healthcheck:
      test: ["CMD-SHELL", "bash -c ':> /dev/tcp/127.0.0.1/6333' || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10

  # --- Perfil opcional "observability": logs centralizados (Evolución opcional) ---
  loki:
    profiles: [observability]
    image: grafana/loki               # needs-verification
    networks: [backend]
    volumes:
      - loki_data:/loki

  alloy:
    profiles: [observability]
    image: grafana/alloy              # needs-verification; reemplaza a Promtail (deprecado)
    networks: [backend]
    command: ["run", "/etc/alloy/config.alloy"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro   # descubrimiento de contenedores; solo con el perfil activo (riesgo: ver Evolución)
      - ./infra/observability/config.alloy:/etc/alloy/config.alloy:ro
    depends_on: [loki]

  grafana:
    profiles: [observability]
    image: grafana/grafana            # needs-verification
    networks: [backend, grafana-ui]   # fuera de `edge` y `public`; grafana-ui permite publicar el puerto en loopback
    ports:
      - "127.0.0.1:3000:3000"         # solo loopback; únicamente con el perfil activo
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
    depends_on: [loki]

networks:
  public: {}                          # solo web: publica 8080 al host
  edge:
    internal: true                    # web + servicios: sin salida a Internet
  backend:
    internal: true                    # sin salida a Internet para bases de datos, broker y servicios
  egress: {}                          # salida a Internet; solo la usa ai-agent-service (proveedor LLM)
                                      # verificación (harden-compose-resilience-security): docker compose exec user-service node -e "fetch('https://example.com')" debe fallar
  grafana-ui: {}                      # solo Grafana (perfil observability), para el puerto loopback

volumes:
  pg_data:
  mongo_data:
  redis_data:
  rabbitmq_data:
  qdrant_data:
  loki_data:

secrets:
  jwt_private_key:
    file: ./secrets/jwt_private.pem   # generado por el script de bootstrap; nunca en git
```

Notas sobre el bloque:

- Los healthchecks de los servicios Node usan `node -e fetch(...)` porque las imágenes `node:*-slim` no incluyen `wget` ni `curl`; `web` (nginx) conserva `wget` de su imagen.
- Los servicios de aplicación escuchan en `3001`–`3005` y los publican solo con `expose` (visible en la red de Docker, no en el host).
- `web` solo enruta `/api/auth`, `/api/users`, `/api/roles`, `/api/audit` y `/api/agent`; no define `location` para `/internal/*` ni `/oauth/*`, de modo que `PUT/DELETE /internal/credentials/{userId}` y `POST /oauth/token` solo se invocan entre contenedores.
- `RabbitMQ` expone la gestión (`15672`) solo en la red interna; para inspeccionarla en desarrollo se usa `docker compose exec` o un override local.
- El perfil `observability` (Loki + **Grafana Alloy** + Grafana) se activa con `docker compose --profile observability up`; Alloy sustituye a Promtail, deprecado (`needs-verification`: confirmar la versión vigente); sin el perfil, los logs se consultan con la receta `docker compose logs <servicio> | jq 'select(.correlationId=="<id>")'` de ADR-007.

## Script de init de Postgres (rol por base)

Una instancia, tres bases lógicas, un rol por base sin permisos cruzados ([ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md)). Se monta en `/docker-entrypoint-initdb.d/`; las contraseñas llegan por variables de entorno (placeholders, nunca valores en git).

```sh
#!/bin/sh
# infra/postgres/init/01-roles-and-databases.sh
set -eu

create_db() {  # $1 = servicio, $2 = contraseña (de variable de entorno)
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE ROLE $1_user LOGIN PASSWORD '$2';
CREATE DATABASE $1_db OWNER $1_user;
REVOKE ALL ON DATABASE $1_db FROM PUBLIC;
GRANT CONNECT ON DATABASE $1_db TO $1_user;
SQL
}

create_db auth "$AUTH_DB_PASSWORD"
create_db user "$USER_DB_PASSWORD"
create_db role "$ROLE_DB_PASSWORD"
```

Consecuencia: `auth_user` no puede conectarse a `user_db` ni a `role_db`, y viceversa. El riesgo residual (una sola instancia, un único superusuario administrativo) está aceptado y se declara en ADR-002. En Redis no hay equivalente: los prefijos `auth:`, `role:`, `agent:` son **convención**, y los usuarios ACL por prefijo son **Evolución**.

## Script de init de MongoDB (usuario por base)

`MONGO_INITDB_ROOT_*` solo crea el administrador. Para que `audit-service` pueda autenticarse, un script montado en `/docker-entrypoint-initdb.d/` crea `audit_user` con `readWrite` únicamente sobre `audit_db` (se ejecuta solo en el primer arranque con volumen vacío). La contraseña llega por variable de entorno del contenedor `mongo`.

```js
// infra/mongo/init/01-audit-user.js
const auditDb = db.getSiblingDB("audit_db");
auditDb.createUser({
  user: "audit_user",
  pwd: process.env.AUDIT_DB_PASSWORD,
  roles: [{ role: "readWrite", db: "audit_db" }],
});
```

Consecuencia: `audit_user` no puede leer ni escribir en otras bases ni administrar el servidor; la cadena `MONGO_URL` de `audit-service` incluye `?authSource=audit_db`.

## Variables de entorno (`.env.example` e `infra/env/<servicio>.env.example`)

El repositorio versiona solo plantillas con marcadores: `.env.example` (infraestructura) e `infra/env/<servicio>.env.example` (una por servicio). Los archivos reales (`.env`, `infra/env/*.env`) están en `.gitignore`. El script de bootstrap genera los valores y mantiene coherentes las contraseñas duplicadas entre el `.env` de infraestructura (que crea los roles) y el `.env` del servicio (que las usa en su URL).

**Raíz `.env` (solo contenedores de infraestructura):**


El repositorio versiona solo `.env.example` con marcadores; `.env` real está en `.gitignore`.

| Variable | Uso | Valor en `.env.example` |
|---|---|---|
| `POSTGRES_ADMIN_USER`, `POSTGRES_ADMIN_PASSWORD` | Administración de Postgres | placeholder `change-me` |
| `AUTH_DB_PASSWORD`, `USER_DB_PASSWORD`, `ROLE_DB_PASSWORD` | Contraseña del rol de cada base (la crea el init de Postgres) | placeholder `change-me` |
| `MONGO_ADMIN_USER`, `MONGO_ADMIN_PASSWORD`, `AUDIT_DB_PASSWORD` | MongoDB y contraseña de `audit_user` (init de Mongo) | placeholder |
| `REDIS_PASSWORD` | `requirepass` de Redis | placeholder |
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | Credenciales del broker | placeholder |
| `GRAFANA_ADMIN_PASSWORD` | Solo con perfil `observability` | placeholder |

**`infra/env/<servicio>.env` (cada servicio solo lee el suyo):**

| Archivo | Contiene |
|---|---|
| `auth-service.env` | `DATABASE_URL` (rol `auth_user`), `REDIS_URL` con contraseña, `RABBITMQ_URL`, `JWT_KID`, `ACCESS_TOKEN_TTL_SECONDS` (≤15 min), `COOKIE_SECURE` (`true` por defecto; `false` solo en desarrollo HTTP), `SVC_CLIENT_ID`, `SVC_CLIENT_SECRET` |
| `user-service.env` | `DATABASE_URL` (rol `user_user`), `REDIS_URL`, `RABBITMQ_URL`, `SVC_CLIENT_ID`, `SVC_CLIENT_SECRET` |
| `role-service.env` | `DATABASE_URL` (rol `role_user`), `REDIS_URL`, `RABBITMQ_URL` |
| `audit-service.env` | `MONGO_URL` (`audit_user`, `authSource=audit_db`), `REDIS_URL`, `RABBITMQ_URL` |
| `ai-agent-service.env` | `REDIS_URL`, `RABBITMQ_URL`, `LLM_PROVIDER` y `ANTHROPIC_API_KEY` (vacíos => proveedor `mock`), `LLM_PRICE_INPUT_PER_MTOK`, `LLM_PRICE_OUTPUT_PER_MTOK` (vacíos, sin valores en docs) |

Ejemplo de plantilla (`infra/env/auth-service.env.example`, solo marcadores):

```sh
DATABASE_URL=postgresql://auth_user:<AUTH_DB_PASSWORD>@postgres:5432/auth_db
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379
SVC_CLIENT_ID=auth-service
SVC_CLIENT_SECRET=<change-me>
```

La clave privada RSA no es una variable: se genera con el script de bootstrap y se monta como secreto de Docker (`secrets.jwt_private_key`). Ver [06-seguridad-escalabilidad.md](06-seguridad-escalabilidad.md).

## Normativo frente a ilustrativo

| Aspecto | Carácter | Detalle |
|---|---|---|
| Nombres de servicio, puertos `3001`–`3005` y `8080` de `web` | **Normativo** | Contrato de `design.md`; los demás documentos y ADRs los citan |
| Solo `web` publicado al host; `/internal/*` y `/oauth/*` sin ruta en nginx | **Normativo** | Control de seguridad |
| `healthcheck` en todos los contenedores y `depends_on` con `service_healthy` | **Normativo** | Arranque ordenado y readiness (ver [07-resiliencia.md](07-resiliencia.md)) |
| Un rol de BD por base (init de Postgres), `audit_user` (init de Mongo), `requirepass` en Redis, prefijos de Redis por convención | **Normativo** | ADR-002 |
| Un `.env` por servicio (`infra/env/<servicio>.env`); `.env` raíz solo para infraestructura | **Normativo** | Mínimo privilegio de secretos |
| `edge` y `backend` con `internal: true`; red `public` solo para `web`; red `egress` solo para `ai-agent-service` | **Normativo** | Control de seguridad |
| Perfil `observability` (Loki, Alloy, Grafana) | **Opcional** | Evolución opcional; no bloquea la entrega |
| Etiquetas de imagen, intervalos y timeouts de healthcheck, nombres de redes y volúmenes, comandos de healthcheck | **Ilustrativo** | `needs-verification`; se fijan en `harden-compose-resilience-security` |
| Comandos exactos de `build` y Dockerfiles | **Ilustrativo** | Los define `bootstrap-monorepo-platform` |

### Evolución (no implementada, riesgo aceptado)

- El socket de Docker montado en `alloy` (perfil opcional) da acceso a la API de Docker aunque sea `:ro` (equivale a privilegios de root en el host). Alternativa: leer `/var/lib/docker/containers` o usar el driver de logs de Loki; el perfil no debe activarse fuera de desarrollo.
- Usuarios ACL de Redis por prefijo (hoy hay una contraseña única `requirepass` y los prefijos son convención, no frontera).
- Rotación de claves JWKS con clave actual + previa (hoy una sola clave con `kid`).
- Orquestador (Kubernetes/Swarm), TLS de extremo a extremo y gestor de secretos externo.
- Réplicas de Postgres/Mongo y clúster de RabbitMQ (hoy instancia única por almacén).
