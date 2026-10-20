# Proposal — harden-compose-resilience-security

> Change 5 de 9. Integra los servicios construidos en los cambios 3, 4, 6 y 7 en un único `docker compose up --build` funcional, endurece el borde (nginx), verifica la resiliencia y el mapa OWASP **contra el código real** (verificar, no reimplementar), añade el perfil `observability` y cierra la documentación de ejecución y de DDD/Clean "tal como se aplicó" (entregable del PDF Ex2).
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (CLI `opsx` no disponible en el sub-agente planner; ver "Plan metadata" en design.md).

**En simple:** hasta aquí hay servicios sueltos y una infraestructura en compose. Este cambio los junta: añade al compose los 5 servicios y `web`, hace que cada uno espere a que sus dependencias estén sanas, aplica las migraciones al arrancar, y deja que solo `web` (puerto 8080) sea visible desde el host. Luego endurece nginx (límite de peticiones en el login, cabeceras de seguridad, timeouts), demuestra con scripts que todo funciona de punta a punta (login, alta de usuario, evento de auditoría visible, pregunta al agente), que `user-service` no tiene salida a Internet, que la lista OWASP corresponde a código existente y que el sistema aguanta la caída de Redis o de role-service. Cierra con el README de ejecución, el perfil opcional de logs centralizados y el documento de DDD/Clean real por servicio.

## Esquema de identificadores

- Épica `EP-EX2`. Historias de este cambio en el rango reservado `US-EX2-5N` (no colisionan con `US-EX2-01..08` del cambio 2):

| Historia | Descripción |
|---|---|
| US-EX2-51 | `docker compose up --build` levanta los 5 servicios + `web` con arranque ordenado por salud y migraciones al arrancar |
| US-EX2-52 | Borde endurecido: solo `/api/*` enrutado, `limit_req` en login, cabeceras de seguridad, timeouts por arista |
| US-EX2-53 | Smoke end-to-end y verificación de aislamiento de red (egress) |
| US-EX2-54 | OWASP mapeado a código verificable y sondas de resiliencia (Redis caído, role-service caído) |
| US-EX2-55 | Perfil opcional `observability` (Loki + Grafana Alloy + Grafana) |
| US-EX2-56 | Documentación de ejecución, DDD/Clean aplicado por servicio y trazabilidad actualizada |

## Problem

Los cambios 2–7 entregan piezas verificadas por separado. Faltan: (a) el compose con los servicios de aplicación (EX2-R07, R16, R17, R29), (b) la prueba de que el conjunto funciona y de que las propiedades de seguridad de `04`/`06` se cumplen en ejecución y no solo en texto (EX2-R31 [RIESGO]: OWASP mapeado a código), (c) las sondas de resiliencia de `07`, (d) la documentación para que un evaluador ejecute el sistema y entienda cómo se aplicó DDD/Clean en cada servicio.

## Solution

1. **Compose integrado** (`docker-compose.yml`): se añaden `web`, `auth-service`, `user-service`, `role-service`, `audit-service`, `ai-agent-service` según `04`, con `depends_on: service_healthy`, healthchecks, redes `public`/`edge`/`backend`/`egress`, secreto `jwt_private_key`, un `env_file` por servicio y **migrate-on-start** para los servicios con Prisma.
2. **Borde nginx**: verificar y completar rutas (solo `/api/auth|users|roles|audit|agent`; sin `/internal` ni `/oauth`), `limit_req` en `/api/auth/login`, `proxy_read_timeout 40s` en `/api/agent/`, 30 s/5 s en el resto, `client_max_body_size`, cabeceras de seguridad y `/healthz`.
3. **Verificación ejecutable**: `scripts/smoke.sh` (login → alta de usuario → evento visible en audit → pregunta al agente), `scripts/verify-isolation.sh` (egress, un solo puerto publicado, `/internal`/`/oauth` sin ruta), `scripts/check-owasp.sh` + `docs/security/owasp-checklist.md` (cada fila del mapa OWASP de `06` apunta a un archivo y una comprobación), `scripts/resilience-check.sh` (Redis caído = fail-open; role-service caído = 503 sin usuario `ACTIVE`).
4. **Perfil `observability`**: Loki + Grafana Alloy + Grafana (red `grafana-ui`, puerto en loopback), solo con `--profile observability`.
5. **Documentación**: sección de ejecución en `README.md`, `docs/architecture/09-ddd-clean-aplicado.md` (estructura real por servicio, verificable por existencia de rutas), reconciliación de `04` con el compose real y actualización de `docs/traceability.md`.

## Scope

- `docker-compose.yml`, `infra/observability/config.alloy`, ajustes a `.env.example` y `scripts/bootstrap-env.sh` (`GRAFANA_ADMIN_PASSWORD`).
- Configuración nginx de `apps/web` (archivo definido por el cambio 6; ver supuestos en design.md).
- Scripts `scripts/{smoke,verify-isolation,check-owasp,resilience-check}.sh`.
- `docs/security/owasp-checklist.md`, `docs/architecture/09-ddd-clean-aplicado.md`, `README.md` (sección de ejecución), `docs/architecture/04-docker-compose-diseno.md` (reconciliación), `docs/traceability.md`.
- Correcciones **mínimas** en `apps/*` solo si `check-owasp.sh` o el smoke detectan una brecha (cableado de `helmet`/`ValidationPipe`, etc.), con prueba de regresión y registradas en el checklist.

## Out of scope

- Crear servicios, Dockerfiles o la UI (cambios 3, 4, 6, 7); reescribir controles ya implementados (se verifican).
- TLS, gestor de secretos, ACL de Redis, rotación JWKS, orquestador, réplicas de BD, outbox en auth (Evolución ya declarada en `04`/`06`/`07`).
- Pruebas de carga, E2E de navegador (Playwright) y métricas Prometheus.
- Cualquier cosa no pedida por el PDF queda en **Evolución**.

## Dependencias de otros cambios (explícitas)

| Cambio | Slug (supuesto salvo 2–4) | Qué consume este cambio |
|---|---|---|
| 2 | `bootstrap-monorepo-platform` | `docker-compose.yml` de infra, `.env`/`infra/env/*`, `scripts/bootstrap-env.sh`, paquetes `@toka/*` |
| 3 | `build-auth-role-services` | `apps/auth-service`, `apps/role-service` (+ Dockerfile, `/ready`, JWKS, usuario admin semilla) |
| 4 | `build-user-audit-services` | `apps/user-service`, `apps/audit-service` (+ Dockerfile, `/ready`, `GET /audit/events`) |
| 6 | `build-frontend-web` (supuesto) | `apps/web` (+ Dockerfile, plantilla nginx con `*_UPSTREAM`) |
| 7 | `build-ai-agent-service` (supuesto) | `apps/ai-agent-service` (+ Dockerfile, `/ready`, `POST /agent/ask`, proveedor `mock`) |

Este cambio **no puede implementarse** hasta que 3, 4, 6 y 7 estén implementados y mergeados (hay una única excepción paralelizable: la tarea 1.3, solo necesita 6).

## Success criteria

1. `docker compose config -q` pasa; solo `web` publica puertos (`8080`); `user-service` no está en `egress` ni `public`; `ai-agent-service` es el único en `egress`.
2. `docker compose up -d --build --wait` deja sanos todos los servicios con `.env` generado por `bootstrap-env.sh`.
3. `bash scripts/smoke.sh` termina con código 0 (login, alta, evento de auditoría visible, respuesta del agente).
4. `docker compose exec user-service` no puede hacer `fetch` a Internet; `/internal/*` y `/oauth/*` devuelven 404 vía `web`.
5. Ráfaga a `/api/auth/login` recibe `429`; las respuestas de `web` llevan las cabeceras de seguridad definidas.
6. `bash scripts/check-owasp.sh` termina con código 0 y cada fila del mapa OWASP de `06` tiene evidencia en `docs/security/owasp-checklist.md`.
7. `bash scripts/resilience-check.sh` termina con código 0 (Redis caído y role-service caído se comportan según `07`).
8. `docker compose --profile observability config -q` pasa; sin el perfil no se crea ningún servicio de observabilidad.
9. `README.md` documenta el arranque en ≤6 comandos; `09-ddd-clean-aplicado.md` cita solo rutas existentes; `docs/traceability.md` marca `Implementado` las filas de este cambio.
