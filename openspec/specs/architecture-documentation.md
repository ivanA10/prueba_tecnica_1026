---
spec: architecture-documentation
change: design-architecture-docs
wave: 1
epics: EP-EX1
status: done
created: 2026-10-20
archived: 2026-10-20
---

# Spec — architecture-documentation

> Spec canónica promovida desde el cambio archivado `design-architecture-docs`.

## Requirements

### Requirement: Diagramas Mermaid (C4 + secuencias)
`docs/architecture/01-diagramas.md` SHALL contener al menos 4 bloques Mermaid: (1) C4 de contenedores con `web`, `auth-service`, `user-service`, `role-service`, `audit-service`, `ai-agent-service`, Postgres, MongoDB, Redis, RabbitMQ, Qdrant y proveedor LLM; (2) secuencia login + validación local de JWT vía JWKS; (3) secuencia `user.created` → RabbitMQ → audit-service → Mongo; (4) secuencia consulta RAG del agente (JWT, recuperación en Qdrant, herramienta REST a user-service, LlmProvider).

#### Scenario: Diagrama completo
- **WHEN** se renderiza el C4
- **THEN** aparecen los 6 contenedores de aplicación, los 5 almacenes/broker y las flechas síncronas (REST) y asíncronas (eventos) diferenciadas

### Requirement: Justificación técnica y multi-DB
`docs/architecture/02-justificacion-tecnica.md` SHALL justificar cada tecnología y patrón (NestJS/TS, pnpm, Postgres+Prisma, MongoDB+Mongoose, Redis, RabbitMQ, Qdrant, Anthropic tras puerto, embeddings locales, React+RTK, nginx reverse proxy / gateway ligero, pino, Jest) con motivo y alternativa, y SHALL incluir `## Estrategia multi-DB` explicando qué dato vive en qué almacén, por qué y qué consistencia se acepta.

#### Scenario: Cada tecnología justificada
- **WHEN** un revisor busca una tecnología del catálogo
- **THEN** halla una fila/sección con "Por qué" y "Alternativa considerada"

### Requirement: Flujo de datos y comunicación síncrona/asíncrona
`docs/architecture/03-flujo-de-datos.md` SHALL explicar el flujo de datos entre microservicios (login, creación de usuario, auditoría, ingesta/consulta del agente) con secciones `## Comunicación síncrona` y `## Comunicación asíncrona`, usando los eventos y endpoints del contrato de `design.md`.

#### Scenario: Flujo trazable
- **WHEN** se sigue el flujo "crear usuario"
- **THEN** el documento nombra cada llamada REST, evento publicado, consumidor y almacén tocado

### Requirement: Resiliencia y manejo de fallos
`docs/architecture/07-resiliencia.md` SHALL describir, por interacción entre servicios, el modo de fallo, el mecanismo (timeout, reintento con backoff, circuit breaker, DLQ, idempotencia, healthchecks, degradación del agente a respuesta sin generación) y la compensación del alta de usuario.

#### Scenario: Fallo de role-service
- **WHEN** role-service no responde durante `POST /users`
- **THEN** el documento indica timeout, circuit breaker, respuesta de error al cliente y que no se persiste usuario `ACTIVE`

### Requirement: Diseño de docker-compose
`docs/architecture/04-docker-compose-diseno.md` SHALL incluir un bloque yaml con la estructura básica que orquesta todos los servicios y dependencias (servicios, puertos, redes, volúmenes, `healthcheck`, `depends_on: condition: service_healthy`, variables de entorno por `.env.example`) y SHALL declarar qué partes son normativas y cuáles ilustrativas.

#### Scenario: Todos los servicios presentes
- **WHEN** se lee el bloque YAML
- **THEN** aparecen `web`, los 5 servicios, `postgres`, `mongo`, `redis`, `rabbitmq` y `qdrant`

### Requirement: DDD, Clean Architecture y CQRS
`docs/architecture/05-ddd-clean-cqrs.md` SHALL explicar contextos delimitados (mapa de contextos), agregados y entidades por servicio, capas `domain/application/infrastructure/interfaces` con regla de dependencia, y dónde se aplica (y dónde NO) CQRS.

#### Scenario: Agregados identificados
- **WHEN** se consulta el contexto "Gestión de usuarios"
- **THEN** se nombra el agregado `User`, sus invariantes, sus eventos de dominio y los puertos de repositorio

### Requirement: Seguridad y escalabilidad
`docs/architecture/06-seguridad-escalabilidad.md` SHALL cubrir autenticación/autorización, gestión de secretos, validación y sanitización de entrada (OWASP), rate limiting, cifrado de contraseñas, y escalabilidad (servicios sin estado, escalado horizontal, particionamiento de colas, caché), con límites conocidos del despliegue local.

#### Scenario: Control mapeado
- **WHEN** se busca un riesgo OWASP relevante (inyección, autenticación rota, exposición de datos)
- **THEN** existe un control de diseño y el servicio responsable

### Requirement: Integración de IA y RAG
`docs/architecture/08-integracion-ia-rag.md` SHALL describir el módulo `ai-agent-service`: puerto `LlmProvider` (Anthropic / mock), embeddings (ONNX local; `hash` solo en tests), Qdrant, pipeline de ingesta de documentos de conocimiento (semilla, admin y `role.#`; chunks ≤256 con solapamiento ~32; sin PII de usuarios), identidad delegada (reenvío del JWT del llamante), lista blanca de campos al LLM, sección de prompt injection, manejo de rate limit y costo de tokens vía variables de entorno de precios, SIN IDs de modelo ni precios.

#### Scenario: Sin API key
- **WHEN** no hay `ANTHROPIC_API_KEY`
- **THEN** el documento explica la selección automática del proveedor mock y su impacto en pruebas y evaluación

### Requirement: Índice de arquitectura
`docs/architecture/README.md` SHALL enlazar los 8 documentos, los 10 ADRs y `docs/traceability.md`, y mapear cada entregable y criterio de evaluación del Ejercicio 1 al documento que lo cubre.

#### Scenario: Cobertura del Ejercicio 1
- **WHEN** se revisa la tabla del índice
- **THEN** los 5 entregables y 8 criterios de evaluación del Ejercicio 1 tienen enlace a una sección existente
