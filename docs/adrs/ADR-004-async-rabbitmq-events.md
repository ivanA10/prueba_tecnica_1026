---
id: ADR-004
title: Mensajería asíncrona con RabbitMQ, outbox en user-service y reintentos con DLQ
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0]
---

# ADR-004 — Mensajería asíncrona con RabbitMQ, outbox en user-service y reintentos con DLQ

## Context

Los cinco servicios necesitan propagar hechos de dominio (alta de usuario, login, cambios de rol) sin acoplarse temporalmente. El Ejercicio 1 pide comunicación asíncrona basada en eventos y auditoría de accesos. Restricciones: el alcance es una prueba técnica con tiempos acotados (Ex1 = 90 min, Ex2 = 120 min), por lo que hay que elegir un broker operable en `docker compose` y declarar explícitamente qué garantías se implementan y cuáles quedan como Evolución.

Consumidores identificados: `audit-service` (auditoría en MongoDB), `auth-service` (proyección de usuarios/roles para activar credenciales y resolver el claim de rol) y `ai-agent-service` (regenerar documentos del catálogo de roles).

## Decision

Se usa **RabbitMQ** con un exchange `topic` durable llamado `toka.events` y un exchange de mensajes muertos `toka.events.dlx`.

**Semántica de bindings.** En un exchange topic, `*` casa exactamente UNA palabra y `#` casa cero o más palabras. Las claves de enrutamiento de este sistema tienen 2 o 3 segmentos (`user.created`, `auth.login.succeeded`, `user.role.assigned`), por lo que un binding `user.*` NO casaría `user.role.assigned`. Por eso todos los bindings usan `#`.

| Cola | Bindings | Consumidor |
|---|---|---|
| `audit.events` | `user.#`, `auth.#`, `role.#` (`access.#` reservado para Evolución) | audit-service |
| `auth.user-projection` | `user.#`, `role.updated` | auth-service |
| `agent.ingest` | `role.#` | ai-agent-service |

Cada cola tiene una cola de reintento con retardo `<cola>.retry` y una DLQ `<cola>.dlq`.

**Sobre del evento.** `eventId` (UUID), `type` (routing key), `version` (versión del esquema), `aggregateVersion` (entero monotónico por agregado), `occurredAt` (ISO-8601 UTC), `correlationId`, `actor` (`{userId, roles}` o `system`) y `payload`. Los contratos viven en el paquete `contracts` con compatibilidad hacia atrás.

**Entrega e idempotencia.** Semántica at-least-once. Los consumidores son idempotentes por `eventId` (índice único en Mongo; tabla `processed_events` o clave de dedupe en las proyecciones y en la ingesta del agente).

**Política de reintentos.** Ante un error transitorio el consumidor reintenta hasta N veces (configurable, 3 por defecto) con retardos crecientes mediante colas de retardo (TTL + DLX; valores configurables, por ejemplo 5 s / 30 s / 2 min). El contador viaja en la cabecera `x-retry-count`. Agotados los reintentos, el mensaje pasa a `<cola>.dlq`. El procedimiento de re-drive (mover los mensajes de la DLQ de vuelta a la cola principal tras corregir la causa) se documenta en `docs/architecture/07-resiliencia.md`.

**Orden.** Las colas de retardo rompen el orden de entrega. Los consumidores de proyección aplican un evento solo si su `aggregateVersion` es mayor que la última almacenada **del mismo agregado** y descartan los viejos o duplicados. La proyección de auth guarda `user_roles_projection(user_id, role_id, user_last_version)` (eventos `user.*`, sin nombre de rol) y `role_names_projection(role_id, role_name, last_version)` (eventos `role.updated`, aplicados solo si su versión es mayor que la del rol, nunca comparada con la del usuario); el nombre del rol se resuelve por join al emitir el token; el desempate temporal usa `occurredAt`. Un `user.created` reintentado nunca reactiva a un usuario `DISABLED`.

**Garantía de publicación.**
- **user-service** usa **outbox transaccional**: `outbox_events` se escribe en la misma transacción que el cambio de estado y un publicador periódico marca los eventos como enviados.
- **auth-service publica directo** (`auth.login.succeeded`, `auth.login.failed`) con reintento en memoria. Riesgo aceptado: un fallo del proceso, o una caída de RabbitMQ más larga que la ventana de reintento (no solo del proceso), pierde eventos de login. Mitigación: al agotar reintentos se escribe el sobre completo como línea de log estructurada `event="audit.fallback"`, recuperable con la receta `jq` de ADR-007.
- **role-service publica `role.*` directo**, sin outbox, con el mismo riesgo aceptado que auth: `role.updated` alimenta la proyección del claim de rol en auth y la ingesta del agente, así que perderlo deja esas proyecciones desactualizadas. Mitigación: respaldo `audit.fallback` en log al agotar reintentos y re-sincronización del catálogo de roles al arrancar role-service (republica el estado vigente con `actor=system` y `reason=resync`, para que audit pueda filtrar esos eventos y no registre cambios de rol falsos; idempotente por `aggregateVersion`).
- Las denegaciones 403 no se publican por AMQP: se registran con pino con `event=access.denied`.

## Consequences

### Positivas

- Desacople temporal: audit, auth y agente consumen a su ritmo sin bloquear a los productores.
- Los reintentos escalonados y la DLQ evitan perder mensajes por fallos transitorios y evitan bucles de reentrega inmediata.
- El outbox en user-service garantiza que el alta de usuario y su evento no divergen, que es el flujo crítico (activación de credenciales y auditoría).
- RabbitMQ es ligero, tiene consola de gestión (15672) y corre en una sola instancia en compose.
- Idempotencia por `eventId` y orden por `aggregateVersion` hacen seguros los reintentos y las entregas duplicadas.

### Negativas y riesgos

- Los eventos de auth y de role pueden perderse (proceso caído o RabbitMQ caído más allá de la ventana de reintento). Es un riesgo aceptado, relevante para la auditoría de accesos; el respaldo `audit.fallback` en log es recuperación manual, no automática.
- Un solo broker es un punto único de fallo en el despliegue local.
- Las colas de retardo añaden topología (3 colas por consumidor) y complejidad operativa.
- Consistencia eventual: tras el alta, el login solo se habilita cuando auth procesa `user.created` (normalmente segundos).
- Dos mecanismos de publicación distintos (outbox y directo) aumentan la carga cognitiva; se documentan en 07-resiliencia.

## Alternatives considered

### Alternativa 1 — Kafka (modo KRaft)

Log distribuido con retención y reproducción nativas. Por qué se descartó: sobredimensionado para cinco servicios y volúmenes de prueba; mayor coste operativo y de memoria en compose; no hay requisito de reproducción masiva ni de particionado por throughput. RabbitMQ cubre el enrutamiento por topic y la DLQ con menos piezas.

### Alternativa 2 — CDC con Debezium sobre el outbox

Capturar cambios del WAL de Postgres y publicarlos sin publicador propio. Por qué se descartó: añade Kafka Connect o equivalente y configuración de replicación lógica; el publicador periódico del outbox cubre el requisito con mucho menos infraestructura.

### Alternativa 3 — Outbox transaccional también en auth-service

Mayor garantía para los eventos de login. Por qué se descartó en este alcance: duplica el mecanismo y el tiempo de implementación frente a los límites de Ex2; el riesgo se acota con `audit.fallback`. Queda como Evolución (también para role-service).

## Implementación

- **Implementado en `build-user-audit-services`**: exchange `toka.events`, colas y bindings, sobre de evento, outbox de user-service, consumidores idempotentes de audit, colas de retardo, DLQ y re-drive; consumo de `auth.user-projection` por auth-service coordinado con `build-auth-role-services`.
- **Evolución** (no implementado, riesgo aceptado): outbox transaccional en auth-service; publicación de `access.denied` por AMQP con binding `access.#` hacia `audit.events`; automatización del re-drive de la DLQ.
