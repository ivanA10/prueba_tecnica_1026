# Toka

Plataforma de gestion de usuarios y roles con autenticacion JWT (RS256 + JWKS), auditoria de eventos y un
agente de IA con RAG. Monorepo TypeScript (NestJS + React) que se levanta completo con Docker Compose.

| Componente | Puerto interno | Rol |
|---|---|---|
| `web` (nginx + React) | 8080 (publicado) | UI y gateway `/api/*` |
| `auth-service` | 3001 | Login, refresh, JWKS, credenciales internas, tokens de servicio |
| `user-service` | 3002 | CRUD de usuarios, siembra del admin, saga con auth/role |
| `role-service` | 3003 | Roles y permisos |
| `audit-service` | 3004 | Consumo de eventos RabbitMQ -> MongoDB, consulta de auditoria |
| `ai-agent-service` | 3005 | Agente IA (RAG con Qdrant, proveedor LLM mock o Anthropic) |
| Infra | - | PostgreSQL, MongoDB, Redis, RabbitMQ, Qdrant (redes internas) |

Solo `web` publica un puerto en el host; el resto vive en las redes internas `edge`/`backend`.

## Arquitectura

- [Indice de arquitectura](docs/architecture/README.md) (diagramas, justificacion, flujos, resiliencia, seguridad, IA/RAG)
- [Diseno de Docker Compose](docs/architecture/04-docker-compose-diseno.md)
- ADRs: [docs/adrs/](docs/adrs/) (ADR-001 a ADR-010)
- [Trazabilidad](docs/traceability.md)

## Requisitos

- Docker (con Compose v2) y Git Bash / bash
- `openssl` (generacion de secretos) y Node 22 + pnpm via corepack (solo para tests y smoke)

## Puesta en marcha

```bash
bash scripts/bootstrap-env.sh          # genera .env, infra/env/*.env y secrets/jwt_private.pem (idempotente)
docker compose up -d --build --wait    # construye y espera a que todo este healthy
bash scripts/smoke.sh                  # prueba end-to-end
docker compose down                    # parar (anadir -v para borrar volumenes)
```

`bootstrap-env.sh` es idempotente: rellena claves que falten y mantiene coherentes los valores compartidos
(secreto de cliente de `user-service` en `SERVICE_CLIENTS` de auth, `ADMIN_ROLE_ID` == `ADMIN_SEED_ROLE_ID`,
URLs y JWKS). Nunca imprime secretos.

## URLs

- UI: <http://localhost:8080>
- Salud del gateway: <http://localhost:8080/healthz>
- API via gateway: `/api/auth/*`, `/api/users`, `/api/roles`, `/api/audit/events`, `/api/agent/ask`

Si el 8080 esta ocupado: `WEB_PORT=8081 docker compose up -d --build --wait` y
`BASE_URL=http://localhost:8081 bash scripts/smoke.sh`.

## Credenciales del administrador

El admin se siembra al arrancar `user-service`. Email: `ADMIN_SEED_EMAIL` (por defecto `admin@toka.local`);
contrasena: `ADMIN_SEED_PASSWORD`, ambos en `infra/env/user-service.env` (fichero ignorado por git).

## Tests

```bash
export PATH=~/corepack-bin:$PATH   # si corepack no esta en el PATH
pnpm -r test -- --coverage
```

## Smoke end-to-end

`bash scripts/smoke.sh` (con el stack arriba): login admin por `http://localhost:8080/api/auth/login`,
crea un usuario con rol admin, lo lista, espera el evento `user.created` en `/api/audit/events` y consulta
`/api/agent/ask` (proveedor mock, sin clave). Sale con codigo != 0 si algo falla.

## Activar un LLM real

Por defecto el agente usa un proveedor mock determinista. Para usar Anthropic edita
`infra/env/ai-agent-service.env`:

```
ANTHROPIC_API_KEY=<tu clave>
LLM_MODEL=<id del modelo>
```

y reinicia: `docker compose up -d ai-agent-service`. `LLM_MODEL` es obligatorio si hay clave.
El servicio tiene salida a internet solo a traves de la red `egress`.

## Documentacion

- Ejercicio 1: [arquitectura](docs/architecture/README.md) y [ADRs](docs/adrs/)
- Ejercicio 4: [docs/diagnostico-ex4.md](docs/diagnostico-ex4.md)
- [docs/prompt-engineering.md](docs/prompt-engineering.md)
- [docs/eval/report.md](docs/eval/report.md) (evaluacion del agente)
