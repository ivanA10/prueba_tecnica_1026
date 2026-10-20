---
spec: agent-service-runtime
change: build-ai-agent-rag-service
wave: 0,2
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — agent-service-runtime (`apps/ai-agent-service`)

Esqueleto, configuración, empaquetado y cierre del servicio. Decisiones: D1, D2, D21 de `design.md`; ADR-006, ADR-007, ADR-009.

## Wave 0 — Esqueleto y configuración

## ADDED Requirements

### Requirement: Esqueleto con capas y puertos
El servicio SHALL existir como paquete de workspace `@toka/ai-agent-service` con capas `domain/`, `application/`, `infrastructure/`, `interface/` y los puertos `LlmProvider`, `EmbeddingProvider`, `KnowledgeStore`, `UserDirectoryGateway`, `RateLimiter`, `EventIdempotencyStore` y `AgentMetricsRecorder` en `application/ports/`. El dominio SHALL NOT importar SDKs ni frameworks. SHALL exponer `GET /health` sin autenticación y usar `@toka/logger` (JSON con `correlationId`).

#### Scenario: Compila y arranca con la configuración mínima
- **WHEN** se construye el servicio y se carga `loadConfig` con las variables obligatorias
- **THEN** `build`, `lint` y la prueba de configuración pasan

### Requirement: Configuración validada al arrancar
`loadConfig` SHALL leer solo del entorno, aplicar los valores por defecto de presupuesto (deadline 30 000 ms, LLM 20 000 ms, herramienta 3 000 ms) y fallar al arrancar con un mensaje claro si falta una variable obligatoria o si hay `ANTHROPIC_API_KEY` sin `LLM_MODEL`. SHALL NOT existir identificadores de modelo ni precios en el código.

#### Scenario: Clave sin modelo
- **WHEN** `ANTHROPIC_API_KEY` está definida y `LLM_MODEL` no
- **THEN** `loadConfig` lanza un error que nombra `LLM_MODEL`

## Wave 2 — Empaquetado y cierre

### Requirement: Imagen con modelo horneado
`apps/ai-agent-service/Dockerfile` SHALL construir la imagen sobre Debian-slim (no Alpine), incluir el modelo ONNX verificado por `sha256`, ejecutarse como usuario no root y NOT descargar nada al arrancar. La integración en `docker-compose.yml` queda fuera de este cambio.

#### Scenario: Modelo presente en la imagen
- **WHEN** se construye la imagen
- **THEN** el archivo del modelo existe en la ruta `EMBEDDING_MODEL_DIR` dentro de la imagen

### Requirement: Verificación integral y trazabilidad
El servicio SHALL pasar `build`, `test` (≥70 % de líneas) y `lint` y el cambio SHALL sumar ≤30 pruebas. `docs/architecture/08-integracion-ia-rag.md` SHALL documentar la verificación contra la documentación del proveedor (fecha, versión del SDK) sin incluir identificadores de modelo ni precios, y las filas EX5 de este cambio en `docs/traceability.md` SHALL pasar a `Implementado`.

#### Scenario: Cierre verificable
- **WHEN** se ejecuta el gate de integración
- **THEN** build, test con cobertura y lint pasan y no existe ningún identificador de modelo en `apps/ai-agent-service/src`
