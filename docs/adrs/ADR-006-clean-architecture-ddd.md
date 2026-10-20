---
id: ADR-006
title: Clean Architecture en 4 capas, DDD por contexto y CQRS ligero selectivo
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0]
---

## Context

El Ejercicio 1 evalúa la estructura interna de los servicios (separación de responsabilidades, DDD, patrones). Hay cinco contextos con complejidad muy distinta: identidad (auth), usuarios, roles/permisos (CRUD con caché), auditoría (escritura append-only y lectura filtrada) y agente de IA (consulta con RAG). Aplicar el mismo nivel de ceremonia a todos sería sobreingeniería; aplicar ninguno dejaría la lógica de negocio atada a NestJS, Prisma y Mongoose.

## Decision

1. **Clean Architecture en 4 capas** en cada servicio: `domain` (entidades, objetos de valor, eventos de dominio, puertos), `application` (casos de uso), `infrastructure` (adaptadores: Prisma, Mongoose, Redis, RabbitMQ, HTTP, LLM) e `interfaces` (controladores REST, consumidores de mensajes). **Regla de dependencia**: las capas internas no importan de las externas; `domain` no depende de NestJS ni de ningún ORM.
2. **DDD con un agregado por contexto delimitado** (por ejemplo `Credential` y sesión de refresh en auth; `User` en user-service; `Role` con sus permisos en role-service; `AuditEvent` en audit-service). Cada agregado protege sus invariantes (por ejemplo, un usuario `PENDING` no puede iniciar sesión) y emite eventos de dominio que la infraestructura traduce a eventos de integración (ADR-004). Los paquetes compartidos son solo transversales (ADR-001): no hay dominio compartido.
3. **CQRS ligero solo donde aporta**:
   - **audit-service**: el modelo de escritura es el consumidor idempotente que inserta en `audit_events`; el modelo de lectura es `GET /audit/events` con filtros y paginación sobre índices dedicados. Los manejadores de comando y consulta están separados.
   - **Consulta del agente** (`POST /agent/ask`): el flujo de lectura (recuperación RAG + herramienta REST + generación) se modela como consulta sin efectos sobre el dominio.
   - **No se aplica en role-service**: su CRUD con caché de permisos no justifica modelos separados.
   "Ligero" significa mismo almacén y sin event sourcing; solo separación de manejadores y modelos de lectura.

## Consequences

### Positivas

- La lógica de negocio es testeable con pruebas unitarias sin levantar infraestructura (ayuda al umbral de cobertura de ADR-007).
- Cambiar de adaptador (por ejemplo el proveedor LLM, ADR-008) no toca el dominio.
- La estructura uniforme de carpetas acelera la lectura del código por parte del evaluador.
- CQRS acotado a audit y agente evita complejidad donde no hay asimetría lectura/escritura.

### Negativas y riesgos

- Más archivos y mapeos (dominio a persistencia) que un esquema controller/service/repository; coste notable en un alcance de tiempo reducido.
- Riesgo de dominio anémico si los casos de uso absorben las reglas; se mitiga con invariantes en el agregado y pruebas de dominio.
- Dos estilos conviven (CQRS en audit y agente, no en role): hay que documentarlo para que no parezca inconsistencia.
- Los límites de capa dependen de disciplina y revisión; sin una regla de lint automática pueden erosionarse.

## Alternatives considered

### Alternativa 1 — Capas tradicionales (controller / service / repository)

Menos estructura y desarrollo más rápido. Por qué se descartó: acopla la lógica a NestJS y al ORM, dificulta las pruebas unitarias aisladas y no demuestra los criterios de DDD y Clean Architecture que evalúa el Ejercicio 1.

### Alternativa 2 — CQRS completo con event sourcing en todos los servicios

Máxima trazabilidad y modelos de lectura independientes. Por qué se descartó: complejidad desproporcionada (proyecciones, reconstrucción, versionado de eventos) frente a los tiempos del alcance; solo audit-service tiene una asimetría real lectura/escritura.

### Alternativa 3 — Arquitectura hexagonal sin separación formal de casos de uso

Puertos y adaptadores sin capa `application`. Por qué se descartó: mezcla orquestación con dominio y deja sin lugar claro la transaccionalidad y la publicación de eventos; las 4 capas dan un vocabulario más explícito.

## Implementación

- **Implementado en `build-auth-role-services`**: capas y agregados de auth-service y role-service (este último sin CQRS).
- **Implementado en `build-user-audit-services`**: agregado `User` con outbox; audit-service con separación de comando y consulta.
- **Implementado en `build-ai-agent-rag-service`**: flujo de consulta del agente como caso de uso de lectura, con puertos `LlmProvider` y de recuperación.
- **Evolución**: reglas de lint de dependencias entre capas (por ejemplo verificación automática de imports) y modelos de lectura adicionales si aparece necesidad.
