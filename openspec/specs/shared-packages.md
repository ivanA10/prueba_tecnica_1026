---
spec: shared-packages
change: bootstrap-monorepo-platform
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — shared-packages (`contracts`, `logger`, `http-client`)

> Spec canónica promovida desde el cambio archivado `bootstrap-monorepo-platform`. Describe el comportamiento as-built, incluidas las ampliaciones aditivas posteriores (catálogo de permisos, `rolePermissions`, filtro `access.denied`).

## Requirements

### Requirement: Paquetes transversales independientes
`@toka/contracts`, `@toka/logger` y `@toka/http-client` SHALL ser transversales (sin dominio de negocio, ADR-001), SHALL NOT importar otros `@toka/*` y SHALL superar 70 % de líneas cubiertas. `contracts` SHALL NOT tener dependencias de runtime y SHALL cambiar solo de forma aditiva.

#### Scenario: Cobertura aplicada
- **WHEN** se ejecuta el `test` de cualquiera de los paquetes
- **THEN** pasa con ≥70 % de líneas

### Requirement: Contrato de eventos
`@toka/contracts` SHALL exportar `EVENTS_EXCHANGE` (`toka.events`), `DLX_EXCHANGE` (`toka.events.dlx`), `CORRELATION_ID_HEADER` (`x-correlation-id`), `RETRY_COUNT_HEADER` (`x-retry-count`), `RoutingKeys` (`user.created|updated|deleted`, `user.role.assigned`, `role.created|updated`, `role.permissions.changed`, `auth.login.succeeded|failed`), `QueueBindings` (`audit.events`: `user.#`, `auth.#`, `role.#`; `auth.user-projection`: `user.#`, `role.updated`; `agent.ingest`: `role.#`), `EventEnvelope<T>` (`eventId`, `type`, `version`, `aggregateVersion`, `occurredAt`, `correlationId`, `actor` = `{userId, roles}` o `'system'`, `reason?`, `payload`), `UserRoleAssignedPayload` (`userId`, `roleId`, `roleName`, `roleVersion`, `rolePermissions`), `createEnvelope`, `isEventEnvelope` y `deterministicEventId`.

#### Scenario: Sobre inválido rechazado
- **WHEN** `isEventEnvelope` recibe un objeto sin `aggregateVersion`
- **THEN** devuelve `false`

#### Scenario: Eventos de resync identificables
- **WHEN** se crea un sobre con `actor='system'` y `reason='resync'`
- **THEN** ambos campos se conservan y `deterministicEventId` devuelve el mismo valor para igual `roleId` y `aggregateVersion`

### Requirement: Catálogo de permisos
`@toka/contracts` SHALL exportar `PERMISSIONS` (`users:read`, `users:write`, `roles:read`, `roles:write`, `audit:read`, `agent:ask`, `agent:ingest`), `ALL_PERMISSIONS`, `WILDCARD` (`*`), `hasPermission(granted, required)` (coincidencia exacta o comodín), `isKnownPermission` y `PERMISSION_LABELS` (etiquetas en español).

#### Scenario: Comodín
- **WHEN** `hasPermission(['*'], 'audit:read')` se evalúa
- **THEN** devuelve `true`; con `[]` o `undefined` devuelve `false`

### Requirement: Logging JSON estándar con correlationId
`@toka/logger` SHALL emitir una línea JSON por evento con `timestamp` ISO, `level` como etiqueta, `service` y `correlationId`, y SHALL redactar contraseñas, tokens y `authorization`. `correlationIdMiddleware` SHALL tomar `x-correlation-id` o generar uno, devolverlo en la respuesta y propagarlo con `AsyncLocalStorage` (`getCorrelationId()`). `RequestLoggingInterceptor` SHALL registrar `route`, `statusCode`, `latencyMs` y `userId`, con `event=access.denied` en 403. `AccessDeniedFilter` SHALL registrar 401 y 403 como `event=access.denied` y devolver el cuerpo de error estándar de Nest.

#### Scenario: Correlación de extremo a extremo
- **WHEN** llega una petición con `x-correlation-id: abc` y el servicio registra un log
- **THEN** la línea contiene `"correlationId":"abc"` y la respuesta devuelve la misma cabecera

#### Scenario: Denegación registrada
- **WHEN** un guard rechaza la petición con 401 o 403
- **THEN** se emite una línea `warn` con `event=access.denied`

### Requirement: Cliente HTTP resiliente
`@toka/http-client` SHALL aplicar timeout por llamada (`AbortController`), reintentos con backoff exponencial y jitter solo en `GET/HEAD/PUT/DELETE` o llamadas `idempotent: true`, ante red, timeout, 5xx o 429 y nunca ante otros 4xx, acotados por `budgetMs`; y un circuit breaker cerrado/abierto/semiabierto por fallos consecutivos y `resetTimeoutMs`, en el que los 4xx no cuentan como fallo. SHALL propagar `x-correlation-id` y las cabeceras dadas. Errores: `HttpTimeoutError`, `CircuitOpenError`, `HttpStatusError`.

#### Scenario: Reintento solo idempotente
- **WHEN** un `GET` recibe 503 y luego 200
- **THEN** el cliente devuelve la respuesta 200, mientras que un `POST` con 503 se intenta una sola vez

#### Scenario: Breaker abre y se recupera
- **WHEN** se acumulan los fallos consecutivos del umbral
- **THEN** la siguiente llamada falla con `CircuitOpenError` sin tocar la red y, tras `resetTimeoutMs`, una llamada exitosa lo cierra
