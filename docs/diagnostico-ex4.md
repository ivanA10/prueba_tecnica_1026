# Diagnóstico de incidente — Ejercicio 4

Referencias: ADR-007 (logging estructurado), ADR-008 (límites y costo de IA), `docs/architecture/03-flujo-de-datos.md` (saga de alta), `docs/architecture/07-resiliencia.md` (matriz de fallos, presupuestos), `docs/architecture/08-integracion-ia-rag.md`.

## Resumen del incidente

Síntomas reportados:

1. Los usuarios no pueden guardar registros.
2. Algunos microservicios devuelven 500.
3. Alta latencia en las respuestas de los agentes IA.

Alcance a confirmar en los primeros minutos: ¿todos los usuarios o un subconjunto?, ¿desde cuándo?, ¿qué cambió (despliegue, configuración, secretos, rotación de `kid`)?, ¿qué endpoints?

Supuestos: los servicios emiten logs JSON con los campos de ADR-007 (`timestamp`, `level`, `service`, `correlationId`, `event`, `statusCode`, `latencyMs`, y `llm.*` en el agente). Se asume que NO se conoce aún si los tres síntomas comparten causa; eso se decide cruzando `correlationId`.

## Hipótesis

Criterio de priorización: **probabilidad × impacto ÷ costo de verificar**. Se verifica primero lo barato, amplio y probable.

| # | Categoría | Hipótesis | Síntoma que explica | Evidencia a favor | Prueba de descarte | Prioridad |
|---|---|---|---|---|---|---|
| H1 | Configuración/despliegue | Cambio reciente de config, secreto, `kid` o `aud` (JWT rechazado, credenciales erróneas) | 1, 2 | Fallos empiezan tras un despliegue; 401/403 y `event=access.denied` | `docker compose logs <svc> \| jq 'select(.event=="access.denied")'`; comparar hora del primer error con el último despliegue | P1 |
| H2 | Base de datos | Postgres de user-service saturado (pool agotado, disco lleno) | 1, 2 | 500 en `POST /users`, `latencyMs` creciente, errores de conexión | `GET /ready` de user-service; `docker compose exec postgres psql -c "select count(*) from pg_stat_activity"`; `df -h` | P1 |
| H3 | Comunicación entre servicios | role-service o auth-service lento con circuit breaker abierto; el alta se compensa (`POST /users` responde 503, usuarios `PENDING`) | 1, 2 | 503 en alta, usuarios en `PENDING`, logs de breaker abierto | `jq 'select(.service=="user-service" and .statusCode>=500)'`; contar usuarios `PENDING` | P1 |
| H4 | Comunicación entre servicios | Tormenta de reintentos user→auth que amplifica una degradación leve | 1, 2, 3 | Picos de tráfico entre servicios sin aumento de usuarios, `latencyMs` en escalera | Contar requests por `correlationId` repetido hacia auth; revisar backoff/jitter | P2 |
| H5 | Red | DNS, red de Docker o nginx (502/504, `proxy_read_timeout` por debajo del presupuesto) | 2, 3 | 502/504 en nginx sin log correspondiente en el servicio | `docker network inspect`; `curl` a `/health` directo vs. por nginx; log de nginx | P2 |
| H6 | Comunicación entre servicios (mensajería) | RabbitMQ caído o saturado (outbox crece, credenciales `PENDING`, DLQ con mensajes) | 1 | Tabla `outbox_events` crece; cola sin consumidores | `docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers` (colas y DLQ); `select count(*) from outbox_events where published_at is null` | P2 |
| H7 | Base de datos | MongoDB caído (audit devuelve 503, `event=audit.fallback`) | 2 | Eventos `audit.fallback` en logs | `jq 'select(.event=="audit.fallback")'`; `mongosh --eval "db.runCommand({ping:1})"` | P3 |
| H8 | Configuración/infra | Redis degradado (denylist fail-open con `warn`, rate limit por usuario no aplicado o rechazando) | 2, 3 | Logs `warn` de denylist; 429 inesperados | `redis-cli ping`; `jq 'select(.level=="warn")'` | P3 |
| H9 | Agentes IA | Proveedor LLM lento o devolviendo 429 | 3 | `latencyMs` del agente cerca de 20 s; 429 con `retry-after` | `jq 'select(.service=="ai-agent-service") \| .latencyMs'`; revisar `statusCode==429` | P1 |
| H10 | Agentes IA | Qdrant o embeddings saturados | 3 | Latencia alta antes de la llamada al LLM | Medir etapas por `correlationId`; `curl` al `/health` de Qdrant | P2 |
| H11 | Agentes IA | Tokens por consulta inflados (`ragHits` alto, prompt largo) que suben latencia y costo | 3 | `llm.tokensIn` p95 por encima de lo habitual | Agregado de `llm.tokensIn` por hora (ver Logs centralizados) | P3 |

### Causa común

Si los tres síntomas aparecen al mismo tiempo, las candidatas son H1 (cambio de configuración), H5 (red) o H2/H3 si el agente invoca la herramienta de usuarios (timeout 3 s). Se decide tomando un `correlationId` de un alta fallida y otro de una consulta lenta del agente y comparando: si ambos cruzan por el mismo servicio degradado, es causa común; si no, son dos incidentes y se atienden en paralelo con responsables distintos.

## Plan de diagnóstico

| Fase | Objetivo | Criterio de salida |
|---|---|---|
| 0. Triage y contención (minutos) | Confirmar impacto, nombrar responsable de incidente, congelar despliegues, abrir canal | Impacto y alcance inicial documentados |
| 1. Alcance y qué cambió | Línea de tiempo: último despliegue, cambios de config/secretos, rotación de `kid` | Hay (o se descarta) un cambio correlacionado con el inicio |
| 2. Verificación barata y amplia | `docker compose ps` (healthchecks de servicios e infraestructura); `GET /health` por servicio; `GET /ready` en user-service y audit-service, que sí comprueban dependencias; para auth-service, role-service y ai-agent-service, comandos directos sobre sus dependencias (ver `## Herramientas de debugging`) | Se sabe qué servicios y dependencias están caídos o no listos |
| 3. Correlación por `correlationId` | Seguir una petición fallida y una lenta de extremo a extremo | Se identifica el primer servicio donde aparece el error o la latencia |
| 4. Profundización por categoría | BD, mensajería, red o IA según la fase 3 | Hipótesis confirmada con evidencia (log, métrica, comando) |
| 5. Mitigación y verificación | Aplicar la acción menos riesgosa y verificar con tráfico real | Tasa de 5xx y latencia vuelven a la línea base durante un tiempo acordado |

Matriz síntoma → comando:

| Síntoma | Primer comando |
|---|---|
| No guarda registros | `docker compose exec user-service node -e "fetch('http://127.0.0.1:3002/ready').then(r=>r.text()).then(console.log)"`; `docker compose logs user-service \| jq 'select(.statusCode>=500)'` |
| 500 en algún servicio | `docker compose ps`; agregado de `statusCode >= 500` por `service` |
| Alta latencia del agente | `jq` sobre `latencyMs` y `llm.tokensIn` del agente; estado de Qdrant y proveedor |
| 502/504 | `docker compose logs web --tail 200`; `curl` directo al servicio |

## Logs centralizados

Campos de ADR-007 usados: `timestamp`, `level`, `service`, `correlationId`, `event`, `statusCode`, `latencyMs`, `llm.tokensIn`, `llm.tokensOut`.

Recetas con `jq` sobre `docker compose logs` (el `correlationId` viaja en todos los servicios, incluido el agente):

```bash
# Seguir una petición de extremo a extremo
docker compose logs --no-log-prefix user-service role-service auth-service ai-agent-service \
  | jq -c 'select(.correlationId=="<id>")' | jq -s 'sort_by(.timestamp)'

# 5xx por servicio
docker compose logs --no-log-prefix | jq -r 'select(.statusCode>=500) | .service' | sort | uniq -c | sort -rn

# Latencia p95 aproximada por servicio (ordenar latencyMs)
docker compose logs --no-log-prefix | jq -r 'select(.latencyMs!=null) | [.service,.latencyMs] | @tsv' | sort -k1,1 -k2,2n

# Accesos denegados y fallbacks de auditoría
docker compose logs --no-log-prefix | jq -c 'select(.event=="access.denied" or .event=="audit.fallback")'

# Tokens por consulta del agente
docker compose logs --no-log-prefix ai-agent-service \
  | jq -c 'select(.["llm.tokensIn"]!=null) | {correlationId, tokensIn:.["llm.tokensIn"], tokensOut:.["llm.tokensOut"], latencyMs}'
```

`audit.fallback`: cuando MongoDB no está disponible, el evento de auditoría se escribe en el log; se recupera con el filtro anterior y se reinyecta cuando Mongo vuelve.

Hoy `docker-compose.yml` no define un perfil de observabilidad. Para un incidente así se agregaría un perfil `observability` (Loki + Alloy + Grafana; Evolución declarada en ADR-007), que se levantaría con `docker compose --profile observability up -d` (`needs-verification`: etiquetas exactas por confirmar al crearlo). Con ese perfil, las consultas LogQL serían, por ejemplo:

```logql
{service="user-service"} | json | correlationId="<id>"
sum by (service) (count_over_time({job=~".+"} | json | statusCode >= 500 [5m]))
quantile_over_time(0.95, {service="ai-agent-service"} | json | unwrap latencyMs [5m])
sum(sum_over_time({service="ai-agent-service"} | json | unwrap llm_tokensIn [1h]))
```

Mientras ese perfil no exista (situación actual): se usa `docker compose logs` con `jq` como arriba; es más lento y sólo cubre la retención local de Docker, por lo que conviene exportar los logs relevantes antes de reiniciar contenedores (reiniciar los pierde).

## Herramientas de debugging

- `docker compose ps`, `docker compose logs <servicio>`, `docker compose exec <servicio> sh`.
- `curl` a `/health` (vivo) de cada servicio. `/ready` comprueba dependencias solo en user-service (Postgres y RabbitMQ) y en audit-service (MongoDB y consumidor de RabbitMQ), y responde 503 si alguna falla; en auth-service y role-service `/ready` responde `ok` sin comprobar dependencias, y ai-agent-service solo expone `/health`. Para esos tres se verifican las dependencias directamente (`pg_isready`, `redis-cli ping`, `rabbitmq-diagnostics ping`, `/health` de Qdrant o `docker compose ps`); un `/ready` que verifique dependencias en ellos es una mejora del plan (ver `## Prevención y seguimiento`).
- RabbitMQ (`docker compose exec rabbitmq rabbitmqctl list_queues`, o la consola `15672` si se publica el puerto): profundidad de colas y DLQ, consumidores activos.
- `psql` (Postgres), `mongosh` (MongoDB), `redis-cli` (Redis).
- `docker network inspect <red>` para DNS y pertenencia a la red.
- Outbox: `select count(*) from outbox_events where published_at is null`; usuarios `PENDING`: `select id, created_at from users where status='PENDING'`.

## Microservicios y fallos en cascada

Propagación típica: un servicio dependiente se degrada (role o auth) → user-service espera hasta su timeout (2 s a role, 3 s a auth) → los hilos y el pool de BD se ocupan → user-service empieza a devolver 500/503 → los clientes reintentan → la tormenta de reintentos empeora la degradación original. El agente IA, que invoca la herramienta de usuarios (3 s), hereda esa latencia.

Contención ya diseñada (07-resiliencia):

- Timeouts por arista (user→role 2 s, user→auth 3 s) y backoff con jitter.
- Circuit breaker en cuatro aristas: falla rápido en lugar de acumular espera.
- Presupuesto del alta (signup) ≤10 s, configurable; al agotarse, compensación y respuesta 503.
- Outbox para publicar eventos de forma durable; DLQ para mensajes irrecuperables.

Cómo detectar un breaker abierto: logs con `event` de cambio de estado del breaker y respuestas inmediatas (`latencyMs` muy bajo) con 503. Reconciliación: listar usuarios `PENDING`, completar o compensar según el estado de auth/role. Re-drive de DLQ: sólo después de corregir la causa, reencolando desde la consola de RabbitMQ y verificando idempotencia. Si la auditoría falla: `audit.fallback` conserva los eventos en logs.

## Agentes IA

Descomposición de latencia (valores configurables de 07): embeddings → búsqueda en Qdrant → llamada al LLM (20 s) → herramienta de usuarios (3 s); presupuesto total del agente 30 s; nginx corta a 40 s. Medir cada etapa por `correlationId` para ubicar el cuello de botella.

- **Latencia**: proveedor lento (H9), Qdrant/embeddings (H10) o prompt grande (H11). Si el LLM supera 20 s, el agente degrada en lugar de colgar.
- **Rate limiting 429**: el proveedor devuelve 429 con `retry-after`; el agente debe respetarlo (backoff, no reintento inmediato) y hay un limitador de concurrencia. Además existe rate limit por usuario en Redis (ADR-008); distinguir si el 429 viene del proveedor o de nuestro limitador por el campo `event` y el origen del log.
- **Costo de tokens**: calcular con `llm.tokensIn` y `llm.tokensOut` multiplicados por las tarifas configuradas en `LLM_PRICE_INPUT_PER_MTOK` y `LLM_PRICE_OUTPUT_PER_MTOK` (los valores viven en el entorno, no en este documento). Buscar consultas outlier y usuarios con consumo anómalo.
- **Palancas**: bajar `max_tokens`, reducir `ragHits`, mantener chunks ≤256 tokens, prompt caching, y modo degradado sin generación (devolver sólo los fragmentos recuperados).

## Acciones inmediatas y mitigación

Orden: primero lo reversible y de bajo riesgo.

1. Congelar despliegues y revertir el último cambio de config/secreto si coincide con el inicio (reversible, alta probabilidad).
2. Reiniciar sólo el servicio afectado (no toda la pila) tras guardar sus logs.
3. Restaurar la dependencia caída (BD, RabbitMQ, Mongo, Redis) y confirmar con `/ready` en user-service y audit-service, y con el healthcheck de la dependencia (`docker compose ps`) para el resto.
4. Si el LLM está lento o con 429: subir el presupuesto temporalmente, desactivar la herramienta lenta o activar el modo degradado sin generación.
5. Esperar al cierre de breakers (half-open) en lugar de forzar tráfico; limitar reintentos de clientes.
6. Reconciliar usuarios `PENDING` y hacer re-drive de la DLQ sólo con la causa corregida.
7. Verificar con tráfico real y mantener monitoreo reforzado antes de declarar resuelto.

## Comunicación a stakeholders

Audiencias: negocio/dirección (impacto y plazos), soporte (qué decir a usuarios), equipo técnico (detalle). Canal: sala de incidente + página de estado; un único responsable de comunicación.

Cadencia: primer aviso en ≤15 min desde la detección; actualizaciones cada 30 min mientras haya impacto (cada 15 si es crítico), aunque sea "sin novedades"; aviso de cierre y postmortem en 48 h.

Plantilla de actualización:

```
Estado: Investigando | Identificado | Mitigando | Monitoreando | Resuelto
Impacto: <quién/qué afectado, en lenguaje de negocio>
Causa conocida / hipótesis: <lo confirmado; lo que se sospecha, marcado como hipótesis>
Acciones en curso: <qué se hace y quién>
Próxima actualización: <hora>
```

Primer aviso (ejemplo): "Estado: Investigando. Impacto: algunos usuarios no pueden guardar registros y las respuestas del asistente son más lentas. Causa conocida / hipótesis: aún en análisis. Acciones en curso: el equipo revisa los servicios y cambios recientes. Próxima actualización: en 30 minutos."

Cierre (ejemplo): "Estado: Resuelto. Impacto: el servicio se restableció a las <hora>; los registros pendientes se procesaron. Causa: <resumen no técnico>. Acciones en curso: monitoreo y postmortem. Próxima actualización: informe en 48 h."

## Prevención y seguimiento

- Postmortem sin culpables: línea de tiempo, causa raíz, qué detectó el problema, qué faltó.
- Alertas: tasa de 5xx por servicio, breaker abierto, profundidad de DLQ y crecimiento del outbox, p95 de `latencyMs` del agente, tokens por consulta, 429 del proveedor.
- Mejoras: las declaradas como Evolución en ADR-007 y ADR-008 (perfil `observability`, métricas/trazas distribuidas, presupuestos de costo por usuario), un `/ready` que verifique dependencias en auth-service (Postgres, Redis, RabbitMQ), role-service y ai-agent-service, pruebas de caos sobre las aristas con breaker y runbooks por hipótesis (H1–H11).

Ejemplo real en este sistema (variante de H10):

- Deriva de dependencias: `@qdrant/js-client-rest` 1.19 ya no expone `search`, así que toda pregunta al agente acababa degradada (`degraded=true`, solo fragmentos) sin ningún error visible.
- Un `catch {}` vacío en la ruta degradada ocultaba la causa; las pruebas unitarias y la evaluación (13/13) usaban un Qdrant simulado, por lo que seguían en verde.
- Lo detectó el e2e de Playwright contra el stack real (`e2e/agent.spec.ts`), que exige la fuente citada en la respuesta.
- Corrección: versión fijada (`~1.19.0`), búsqueda con la API `query` y log `agent.degraded` con el error.
- Lección: alertar sobre la tasa de respuestas degradadas del agente y no tragarse errores.
