---
spec: shared-packages
change: bootstrap-monorepo-platform
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — shared-packages (`contracts`, `logger`, `http-client`)

## ADDED Requirements

### Requirement: Paquetes transversales independientes
Los paquetes `@toka/contracts`, `@toka/logger` y `@toka/http-client` SHALL ser transversales (sin dominio de negocio, ADR-001), SHALL NOT importar otros paquetes `@toka/*` y SHALL cumplir cobertura >= 70 % de líneas.

#### Scenario: Cobertura aplicada
- **WHEN** se ejecuta `pnpm --filter @toka/<pkg> test`
- **THEN** pasa con >= 70 % de líneas

### Requirement: Contrato de eventos
`@toka/contracts` SHALL exportar `EVENTS_EXCHANGE` (`toka.events`), `DLX_EXCHANGE` (`toka.events.dlx`), `RoutingKeys`, `QueueBindings` (`audit.events`: `user.#`, `auth.#`, `role.#`; `auth.user-projection`: `user.#`, `role.updated`; `agent.ingest`: `role.#`) y el tipo `EventEnvelope<T>` con `eventId`, `type`, `version`, `aggregateVersion`, `occurredAt`, `correlationId`, `actor` (`{userId, roles}` o `'system'`), `reason?` y `payload`. SHALL exportar `UserRoleAssignedPayload` con `userId`, `roleId`, `roleName`, `roleVersion`, además de `createEnvelope`, `isEventEnvelope` y `deterministicEventId`. SHALL NOT tener dependencias de runtime. Los cambios futuros SHALL ser solo aditivos (ADR-001).

#### Scenario: Sobre inválido rechazado
- **WHEN** `isEventEnvelope` recibe un objeto sin `aggregateVersion`
- **THEN** devuelve `false`

#### Scenario: Eventos de resync identificables
- **WHEN** se crea un sobre con `actor='system'` y `reason='resync'`
- **THEN** ambos campos se conservan y `deterministicEventId` devuelve el mismo valor para igual `roleId` y `aggregateVersion`

### Requirement: Logging JSON estándar con correlationId
`@toka/logger` SHALL emitir una línea JSON por evento con `timestamp` (ISO), `level` (etiqueta), `service` y `correlationId`. `correlationIdMiddleware` SHALL tomar `x-correlation-id` de la petición o generar uno, responderlo en la cabecera y propagarlo con `AsyncLocalStorage` antes de los guards. `RequestLoggingInterceptor` SHALL registrar `route`, `statusCode`, `latencyMs` y `userId` (si hay), y `event=access.denied` en cada 403. SHALL redactar contraseñas, tokens y `authorization` (ADR-007).

#### Scenario: Correlación de extremo a extremo
- **WHEN** llega una petición con `x-correlation-id: abc` y el servicio registra un log
- **THEN** la línea contiene `"correlationId":"abc"`

#### Scenario: 403 registrado como evento de seguridad
- **WHEN** un handler lanza `ForbiddenException`
- **THEN** se emite una línea con `event=access.denied` y `statusCode=403`

### Requirement: Cliente HTTP resiliente
`@toka/http-client` SHALL aplicar timeout por llamada (`AbortController`), reintentos con backoff exponencial y jitter solo en `GET/HEAD/PUT/DELETE` o llamadas marcadas `idempotent: true` (nunca en 4xx, nunca en `POST` sin la marca), acotados por un `budgetMs` opcional, y un circuit breaker (cerrado/abierto/semiabierto) por fallos consecutivos y `resetTimeoutMs`. Los 4xx NO SHALL contar como fallo del breaker. SHALL propagar `x-correlation-id` y las cabeceras indicadas (p. ej. `Authorization` reenviado). Con el breaker abierto SHALL fallar de inmediato con `CircuitOpenError`.

#### Scenario: Reintento solo idempotente
- **WHEN** un `GET` recibe 503 y luego 200
- **THEN** el cliente devuelve la respuesta 200
- **AND** un `POST` con 503 se intenta una sola vez

#### Scenario: Breaker abre y se recupera
- **WHEN** se acumulan los fallos consecutivos del umbral
- **THEN** la siguiente llamada falla con `CircuitOpenError` sin tocar la red
- **AND** tras `resetTimeoutMs` una llamada exitosa cierra el breaker
