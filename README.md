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
- API via gateway: `/api/auth/*`, `/api/users`, `/api/roles`, `/api/audit/events`, `/api/agent/ask`,
  `/api/agent/ingest`

El puerto publicado es `8080` por defecto (`${WEB_PORT:-8080}` en `docker-compose.yml`). Si esta ocupado:
`WEB_PORT=8081 docker compose up -d --build --wait` y `BASE_URL=http://localhost:8081 bash scripts/smoke.sh`.

## Credenciales del administrador

El admin se siembra al arrancar `user-service` con el rol `admin`. Email: `ADMIN_SEED_EMAIL` (por defecto
`admin@toka.local`); contrasena: la genera `bootstrap-env.sh` en `ADMIN_SEED_PASSWORD`, dentro de
`infra/env/user-service.env` (fichero ignorado por git). Consultala ahi; no se imprime ni se documenta su valor.

Tras crear un usuario, su login queda habilitado en ~1 s (consistencia eventual: auth activa las credenciales
al consumir `user.created`); durante esa ventana el login responde `401`. Detalle en
[03-flujo-de-datos.md](docs/architecture/03-flujo-de-datos.md).

## Roles y permisos

La autorizacion se basa en **permisos**, no en el nombre del rol. Catalogo (`packages/contracts/src/permissions.ts`):

| Permiso | Habilita |
|---|---|
| `users:read` | Ver usuarios |
| `users:write` | Crear, editar, asignar rol y eliminar usuarios |
| `roles:read` | Ver roles y la matriz de permisos |
| `roles:write` | Crear y editar roles |
| `audit:read` | Consultar la auditoria |
| `agent:ask` | Preguntar al agente |
| `agent:ingest` | Cargar conocimiento al agente |
| `*` | Comodin: todos los permisos |

Roles sembrados por `role-service`:

| Rol | Permisos |
|---|---|
| `admin` | `*` |
| `operador` | `users:read`, `roles:read`, `audit:read`, `agent:ask` |
| `auditor` | `audit:read` |

- Los roles se crean y editan desde la UI (pagina Roles). No hay borrado de roles, por diseno: un rol puede
  estar asignado a usuarios y su eliminacion requiere una reasignacion (ver Evolucion).
- El JWT lleva el claim `permissions`, que auth-service toma de su proyeccion de roles (`role_names_projection`),
  mantenida por los eventos `role.created`/`role.updated`. Un cambio de permisos aplica en el siguiente token emitido (login o refresh).
- Cada servicio aplica sus propios permisos con `PermissionsGuard` + `@RequirePermissions(...)` de
  `packages/jwt-guard` (validacion local, sin llamar a role-service por peticion). Decision en
  [ADR-003](docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md#evolución-autorización-por-permisos).
- La web usa el hook `useCan(permiso)`: la navegacion y las acciones se muestran segun permisos, la pagina de
  Inicio (`/`) muestra solo las tarjetas accesibles y la pagina **Permisos** (`/permissions`) muestra la matriz
  rol x permiso.

## Agente IA

- **Preguntar** (`agent:ask`): desde la pagina Agente o `POST /api/agent/ask` con `{"question": "..."}`.
  La respuesta incluye `answer`, `sources` (docId citados), `degraded` y `meta` (latencia, tokens, coste).
- **Cargar conocimiento** (`agent:ingest`): desde la pagina Agente, modo "Cargar conocimiento" (archivos `.md`
  o `.txt`), o `POST /api/agent/ingest` con `{"docId", "source", "roleScope": [...], "text"}`. Reemplaza el
  documento por `docId` (chunking + embeddings + upsert). Al arrancar se indexa `apps/ai-agent-service/knowledge/`.
- **RAG**: embeddings locales ONNX (all-MiniLM-L6-v2, 384 dimensiones) y busqueda en Qdrant con `client.query`
  (`@qdrant/js-client-rest` fijado a `~1.19.0`), filtrada por `roleScope` (roles del JWT + `all`).
- **Herramienta** `lookup_users`: solo se expone al LLM si el llamante tiene `users:read`; reenvia su JWT a
  user-service.
- **Sin `ANTHROPIC_API_KEY`**: un proveedor mock determinista responde a partir de los fragmentos recuperados
  (no requiere red). **Con clave**: se usa Claude (ver "Activar un LLM real").
- Si la generacion falla o excede el plazo, la respuesta se degrada a los fragmentos recuperados
  (`degraded: true`) y se registra el log `agent.degraded`.
- Evaluacion: `corepack pnpm --filter @toka/ai-agent-service eval` (13 casos, 13/13 con el proveedor mock);
  informe en [docs/eval/report.md](docs/eval/report.md). Estrategia de prompts en
  [docs/prompt-engineering.md](docs/prompt-engineering.md).

## Pruebas

Unitarias e integracion (Jest, umbral global de 70% de lineas por paquete), sin levantar el stack:

```bash
export PATH=~/corepack-bin:$PATH   # si corepack no esta en el PATH
pnpm install --frozen-lockfile
pnpm test:unit
```

`test:unit` primero compila `packages/*` (las apps los consumen desde `dist/`) y genera los clientes
Prisma de auth/role/user (`build:test-deps`); despues ejecuta Jest con cobertura en todos los paquetes
salvo `e2e`. En un checkout limpio, ejecutar Jest directamente sin ese paso falla con
`Cannot find module '@toka/jwt-guard/dist/index.js'`.

Resumen de cobertura: [docs/coverage/README.md](docs/coverage/README.md).

End-to-end en navegador (Playwright, chromium, 22 tests) contra el stack levantado en `http://localhost:8080`
(`E2E_BASE_URL` para otro puerto). Lee la contrasena del admin de `infra/env/user-service.env`:

```bash
pnpm --filter @toka/e2e exec playwright install chromium   # una vez
pnpm --filter @toka/e2e e2e
```

Cada test se corresponde con un caso del checklist manual [e2e/CHECKLIST.md](e2e/CHECKLIST.md).

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

## Alcance entregado y evolución

| Ejercicio del PDF | Entregable |
|---|---|
| 1. Diseno y arquitectura | [docs/architecture/](docs/architecture/README.md) (diagramas, justificacion, flujo de datos, diseno de Compose, DDD/Clean/CQRS, seguridad, resiliencia, IA/RAG) y [docs/adrs/](docs/adrs/) |
| 2. Microservicios | `apps/auth-service`, `apps/user-service`, `apps/role-service`, `apps/audit-service`; librerias `packages/*`; `docker-compose.yml` y Dockerfile por servicio; tests Jest con cobertura ([docs/coverage/](docs/coverage/README.md)) |
| 3. Front-end | `apps/web` (React + Redux Toolkit + Vite, tests Jest + RTL) servido por nginx en Compose; e2e Playwright en `e2e/` |
| 4. Diagnostico | [docs/diagnostico-ex4.md](docs/diagnostico-ex4.md) |
| 5. IA y agentes | `apps/ai-agent-service` (RAG con Qdrant y embeddings ONNX, Anthropic o mock, herramienta `lookup_users` contra user-service), [docs/prompt-engineering.md](docs/prompt-engineering.md), evaluacion en `apps/ai-agent-service/src/eval/` y [docs/eval/report.md](docs/eval/report.md) |

**Evolucion** (siguientes pasos):

- Consumidor AMQP de la cola `agent.ingest` para reindexar conocimiento a partir de eventos.
- Fijar el modelo ONNX de embeddings con verificacion `sha256`.
- `/ready` de auth-service con comprobacion de dependencias (Postgres, Redis, RabbitMQ).
- Validacion del agente contra la API de Anthropic en vivo (`EVAL_PROVIDER=anthropic`).
- Pipeline de CI (lint, tests con cobertura, build de imagenes y e2e).
- Borrado de roles con reasignacion de los usuarios afectados.

## Documentacion

- Ejercicio 1: [arquitectura](docs/architecture/README.md) y [ADRs](docs/adrs/)
- Ejercicio 4: [docs/diagnostico-ex4.md](docs/diagnostico-ex4.md)
- [docs/prompt-engineering.md](docs/prompt-engineering.md)
- [docs/eval/report.md](docs/eval/report.md) (evaluacion del agente) y [docs/eval/README.md](docs/eval/README.md) (como leerla)
- [e2e/CHECKLIST.md](e2e/CHECKLIST.md) (checklist manual automatizado con Playwright)
