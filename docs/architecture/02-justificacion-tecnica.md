# 02 — Justificación técnica

Este documento justifica cada tecnología y patrón del catálogo del sistema (cinco servicios NestJS más `web`). Cada fila indica **Por qué** se eligió y la **Alternativa considerada** con la razón de su descarte. Las decisiones completas viven en los ADRs (`docs/adrs/`); aquí se resumen y se enlazan. Los valores sensibles al tiempo (modelo LLM, precios, etiquetas exactas de imágenes) no se fijan en la documentación: se configuran por variables de entorno y se verifican en el cambio de implementación correspondiente (`needs-verification`).

Cada ADR marca qué es **Implementado en `<cambio>`** y qué es **Evolución** (no implementado, riesgo aceptado).

## Criterios de selección

1. **Tiempo acotado**: Ex1 = 90 min de diseño y Ex2 = 120 min de implementación; se prefiere una sola cadena de herramientas.
2. **Cobertura del enunciado**: autenticación distribuida, mensajería asíncrona, multi-DB, Docker y agente de IA.
3. **Evaluabilidad**: cada decisión debe poder verificarse en el repositorio (contratos, logs, tests).
4. **Honestidad sobre el alcance**: lo no implementado se declara como Evolución, no se oculta.

## Lenguaje, monorepo y backend

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **TypeScript + NestJS 11 (Node 22)** en todos los servicios, incluido el agente | Una sola pila: módulos, DI, guards, pipes y validación homogéneos; contratos y paquetes compartidos reutilizables; el agente de IA se integra sin salto de lenguaje | Poliglota (Python FastAPI para IA): mejor ecosistema ML, pero duplica herramientas de build/test/Docker y complica compartir `contracts` | ADR-001 |
| **pnpm workspaces (monorepo)** | Contratos de eventos, `jwt-guard` y `logger` se versionan juntos; un solo `install`, caché de dependencias eficiente en Docker | Repos separados: aislamiento total, pero sincronizar contratos y librerías transversales cuesta más que el beneficio en este alcance | ADR-001 |
| **Paquetes compartidos solo transversales** (`logger`, `jwt-guard`, `contracts`) | Evita reimplementar lo transversal sin acoplar dominios; `contracts` versionado con compatibilidad hacia atrás | Compartir dominio/entidades: acopla despliegues y rompe los límites de contexto (ADR-002) | ADR-001, ADR-002 |
| **Clean Architecture + DDD** (`domain/application/infrastructure/interfaces`) con **CQRS ligero** solo en audit-service (modelo de lectura) y en el flujo de consulta del agente | Reglas de negocio aisladas de framework y BD, testeables sin infraestructura; CQRS solo donde la lectura difiere de la escritura | Capas tradicionales controller/service/repo: más rápidas de escribir, pero mezclan dominio y persistencia; CQRS en role-service sería sobre-ingeniería | ADR-006 |

## Persistencia y almacenes

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **PostgreSQL + Prisma** (auth, user, role) | Datos relacionales con integridad (unicidad de email, claves foráneas rol-permiso, transacciones para el outbox); Prisma da tipado y migraciones | BD compartida única: más simple, pero acopla servicios y viola el aislamiento de datos; TypeORM: válido, pero Prisma aporta mejor tipado de extremo a extremo | ADR-002 |
| **MongoDB + Mongoose** (audit) | Eventos de auditoría de forma variable (`payload` heterogéneo), append-only, consultas por rango de fechas, actor y tipo; índice único en `eventId` da idempotencia | Postgres con JSONB: viable, pero un almacén documental refleja mejor el carácter append-only y heterogéneo de la auditoría y cumple el requisito multi-DB con propósito real | ADR-002, ADR-004 |
| **Redis** (denylist de JWT, caché de permisos, caché JWKS, rate limit) | Estructuras de TTL baratas y de baja latencia para datos efímeros: revocación con TTL = vida restante del token, límites por usuario/IP | Tabla en Postgres para denylist/caché: añade carga y latencia a la BD transaccional; caché en memoria por proceso: no se comparte entre réplicas | ADR-002, ADR-003 |
| **Qdrant** (vector store del agente) | Base vectorial dedicada, ligera en Docker, con filtros por payload (`roleScope`) y upsert por `docId` estable | Chroma: más sencillo pero con menos opciones de filtrado y despliegue; `pgvector`: acopla el agente a Postgres y rompe BD por servicio | ADR-009 |

## Mensajería y comunicación

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **RabbitMQ** (exchange topic `toka.events`, colas con reintento y DLQ) | Enrutamiento por clave de routing y bindings con `#`, colas de retardo (TTL + DLX) y DLQ nativas; operación simple frente al volumen del ejercicio | Kafka (KRaft): throughput y reprocesado superiores, pero mayor complejidad operativa sin necesidad en este alcance; CDC con Debezium: infraestructura adicional | ADR-004 |
| **At-least-once + consumidores idempotentes + `aggregateVersion`** | Los reintentos con retardo rompen el orden; los consumidores aplican un evento solo si su versión es mayor que la almacenada | Exactly-once: no es alcanzable de forma práctica; ignorar el orden: un `user.created` reintentado podría reactivar a un usuario `DISABLED` | ADR-004 |
| **Outbox transaccional solo en user-service** | El alta de usuario debe publicar `user.created` de forma atómica con el cambio; alimenta la auditoría | Outbox en todos los servicios: más robusto, pero más costoso para el tiempo disponible (outbox de auth = Evolución, riesgo aceptado con respaldo `audit.fallback` en log) | ADR-004 |
| **REST + OpenAPI** con timeouts, reintentos con backoff y **circuit breaker** solo en user→role, user→auth, agent→user y agent→LLM; `x-correlation-id` | Síncrono simple y verificable para las consultas que necesitan respuesta inmediata; el breaker se aplica donde un fallo en cascada es más probable | gRPC: eficiente pero añade tooling; service mesh: demasiada infraestructura; breaker en todas las aristas: complejidad sin beneficio proporcional | ADR-005 |

## Seguridad e identidad

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **JWT RS256 autoemitido + JWKS (clave única con `kid`) + RBAC por rol** | Validación local distribuida (cláusula del enunciado "puede usar JWT con validación distribuida") sin llamada por petición; RBAC por claim | Keycloak/OIDC completo: más funcional pero pesado; sesiones opacas con introspección: acopla cada petición a auth; revocación solo por vida corta: sin cierre de sesión efectivo | ADR-003 |
| **Denylist `auth:deny:jti:*` en Redis, fail-open acotado** | Permite revocar sin perder la validación local; si Redis no responde, se continúa validando firma y `exp`, con log de advertencia y métrica, acotado por access token de vida corta | Fallo cerrado: una caída de Redis tumbaría los cinco servicios y contradice la validación local | ADR-003 |
| **Refresh con rotación en cookie HttpOnly** (único camino `POST /auth/refresh`) | El access token vive solo en memoria del cliente; el refresh no es accesible desde JavaScript | Tokens en localStorage: expuestos a XSS | ADR-003, ADR-010 |

## Agente de IA

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **Anthropic detrás del puerto `LlmProvider`** (con `mock` determinista) | El proveedor es un detalle de infraestructura: el dominio depende del puerto; `mock` permite ejecutar sin API key; manejo de 429 con reintentos, limitador de concurrencia y rate limit por usuario en Redis; modelo y precios por entorno, no en docs | OpenAI/Azure OpenAI como único proveedor (el adaptador queda como ranura, Evolución); llamada directa sin puerto: acopla el dominio a un SDK | ADR-008 |
| **Embeddings locales (ONNX MiniLM, 384 dimensiones)** | RAG real sin API key ni envío de datos a terceros; modelo horneado en imagen Debian-slim; `hash` solo para tests unitarios | Embeddings por API externa: dependencia de red/clave y coste; ingesta de usuarios al vector store: llevaría PII al índice | ADR-009 |
| **RAG sobre documentos de conocimiento** (políticas, catálogo de roles, guías); datos de usuarios solo por herramienta REST con el JWT del llamante | Datos frescos y autorizados; evita el confused deputy; lista blanca de campos enviados al LLM; mitigación de prompt injection | Ingerir usuarios en Qdrant: datos obsoletos y sin RBAC por petición | ADR-008, ADR-009 |

## Frontend y borde

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **React 18 + Vite + TypeScript, Redux Toolkit + RTK Query** | Estado de servidor con caché e invalidación integradas; menos código para listados/CRUD | Zustand: más ligero, pero sin capa de datos remota integrada | ADR-010 |
| **nginx como reverse proxy / gateway ligero** | Un único origen (`:8080`), enrutado `/api/*` por servicio, `limit_req` en `/api/auth/login`; no media tokens ni expone `/internal/*` ni `/oauth/*`; cubre el "servicio de agregación o BFF básico" del enunciado | Gateway NestJS como quinto servicio: más código y un punto de fallo adicional sin lógica que lo justifique | ADR-010 |

## Observabilidad y calidad

| Tecnología / patrón | Por qué | Alternativa considerada | ADR |
|---|---|---|---|
| **pino (logs JSON)** con campos estándar (`correlationId`, `service`, `statusCode`, `latencyMs`, `event`) | Bajo coste, estructurado, filtrable con `jq` por `correlationId` (receta para Ex4); `access.denied` y `audit.fallback` como eventos de log | Logging de texto: no consultable de forma fiable; stack de observabilidad completo desde el inicio: perfil `observability` queda como Evolución opcional | ADR-007 |
| **Jest** (backend y frontend con React Testing Library) con `coverageThreshold` 70 por servicio (líneas; ramas informativas) | Un solo runner en todo el monorepo; `config.ts` envuelve `import.meta.env` para poder simularlo en Jest | Vitest: integración nativa con Vite, pero introduce un segundo runner; sin umbral: sin barrera mínima de calidad | ADR-007, ADR-010 |

## Estrategia multi-DB

El sistema aplica **base de datos por servicio** (ADR-002): cada contexto delimitado posee su almacén y ningún otro servicio accede a él directamente. El motor se elige según la forma del dato, no por moda.

### Qué dato vive dónde

| Almacén | Propietario | Contenido | Por qué ahí |
|---|---|---|---|
| Postgres `auth_db` | auth-service | `credentials`, `user_roles_projection`, `refresh_tokens`, `processed_events` | Integridad, unicidad y transacciones sobre credenciales y sesiones |
| Postgres `user_db` | user-service | `users`, `outbox_events` | Fuente de verdad del usuario; el outbox exige transacción con el cambio |
| Postgres `role_db` | role-service | `roles`, `permissions`, `role_permissions` | Relaciones muchos-a-muchos con integridad referencial |
| MongoDB `audit_db` | audit-service | `audit_events` (append-only) | Documentos heterogéneos, escritura intensiva, consulta por tiempo/actor/tipo |
| Redis | cada servicio, con su prefijo | `auth:deny:jti:*`, `auth:rl:login:*`, `role:perm:*`, `<svc>:jwks`, `agent:rl:*` | Datos efímeros con TTL y baja latencia |
| Qdrant `knowledge_base` | ai-agent-service | Vectores de 384 dimensiones, distancia coseno, payload `{source, docId, chunkIdx, roleScope}` | Búsqueda por similitud sobre documentos de conocimiento |

Una sola instancia de Postgres aloja las tres bases lógicas (trade-off declarado en ADR-002): ahorra recursos en Docker a costa de compartir el proceso del motor.

### Aislamiento

- **Postgres**: un rol de BD por base, sin permisos cruzados; el init de Postgres crea cada rol y base. Se implementa en `bootstrap-monorepo-platform`.
- **Redis**: el aislamiento es **por convención de prefijos de clave** por servicio; escribe solo el propietario. Los usuarios ACL de Redis por prefijo son **Evolución**: hoy los prefijos son una convención, no una frontera de seguridad.
- **Única excepción de lectura cruzada**: `auth:deny:jti:{jti}`, escrita por auth-service y leída por todos a través de `jwt-guard` en modo solo lectura (ADR-003), porque la validación local de JWT no puede revocar sin consultarla.
- **MongoDB y Qdrant**: accedidos solo por su servicio propietario.

### Consistencia aceptada

- **Inmediata (síncrona)** donde el negocio lo exige: el alta de usuario no se confirma sin credenciales aprovisionadas (`PUT /internal/credentials/{userId}`, idempotente).
- **Eventual (asíncrona, normalmente segundos)** entre servicios: la activación de credenciales por `user.created`, la proyección de rol en auth y la auditoría en Mongo. La integridad se protege con at-least-once, idempotencia por `eventId` y descarte de eventos viejos por `aggregateVersion` (ADR-004).
- **Alta de usuario**: estados `PENDING` → `ACTIVE`; el login se rechaza mientras las credenciales estén `PENDING`. Compensación y reconciliación con período de gracia a cargo solo de user-service.
- **No hay transacciones distribuidas**: se sustituyen por outbox (user-service), compensaciones idempotentes y reintentos con DLQ.

### Riesgos

| Riesgo | Mitigación / estado |
|---|---|
| Pérdida de eventos `auth.login.*` si el proceso cae o RabbitMQ está caído más que la ventana de reintento (auth publica directo) | Respaldo `audit.fallback` en log estructurado recuperable con `jq`; outbox de auth = Evolución, riesgo aceptado |
| Redis sin ACL: un servicio podría escribir en el prefijo de otro | Convención de prefijos y revisión de código; usuarios ACL = Evolución |
| Redis caído: denylist no consultable | `jwt-guard` falla abierto solo en el denylist, con log de advertencia y métrica; acotado por access token de vida corta (ADR-003) |
| Instancia única de Postgres | Un rol por base sin permisos cruzados; en producción, instancias separadas (ADR-002) |
| Desfase de proyecciones por eventos retrasados o en DLQ | Ignorar eventos con `aggregateVersion` menor o igual; re-drive de DLQ documentado en `07-resiliencia.md` |

## Enlaces a ADRs

- [ADR-001](../adrs/ADR-001-monorepo-typescript-nestjs.md) — Monorepo pnpm con TypeScript y NestJS
- [ADR-002](../adrs/ADR-002-service-boundaries-db-per-service.md) — Límites de servicio y BD por servicio
- [ADR-003](../adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md) — JWT RS256, JWKS y RBAC
- [ADR-004](../adrs/ADR-004-async-rabbitmq-events.md) — Eventos asíncronos con RabbitMQ
- [ADR-005](../adrs/ADR-005-sync-rest-resilience.md) — REST síncrono y resiliencia
- [ADR-006](../adrs/ADR-006-clean-architecture-ddd.md) — Clean Architecture y DDD
- [ADR-007](../adrs/ADR-007-observability-quality-testing.md) — Observabilidad, calidad y pruebas
- [ADR-008](../adrs/ADR-008-llm-provider-port.md) — Puerto de proveedor LLM
- [ADR-009](../adrs/ADR-009-rag-onnx-embeddings-qdrant.md) — RAG, embeddings ONNX y Qdrant
- [ADR-010](../adrs/ADR-010-frontend-react-rtk-nginx-gateway.md) — Frontend React, RTK y nginx
