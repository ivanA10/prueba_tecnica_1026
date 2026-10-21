---
spec: agent-service-runtime
change: build-ai-agent-rag-service
wave: 0,2
epics: EP-EX5
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — agent-service-runtime (`apps/ai-agent-service`)

> Spec canónica promovida desde el cambio archivado `build-ai-agent-rag-service` (as-built, 2026-10-21).

Esqueleto, configuración, empaquetado y cierre del servicio. Decisiones: D1, D2, D21 de `design.md`; ADR-006, ADR-007, ADR-009.

## Requirements

### Requirement: Esqueleto con capas y puertos
El servicio SHALL existir como paquete de workspace `@toka/ai-agent-service` con capas `domain/`, `application/`, `infrastructure/`, `interface/` y los puertos `LlmProvider`, `EmbeddingProvider`, `KnowledgeStore`, `UserDirectoryGateway`, `RateLimiter` y `AgentMetricsRecorder`, y `src/domain/agent-answer.ts` SHALL exportar el esquema de respuesta (`AgentAnswer`, `Source`, `AgentMeta`) que importa el cambio 8. Los puertos están en `application/ports/`. El dominio SHALL NOT importar SDKs ni frameworks. SHALL exponer `GET /health` sin autenticación y usar `@toka/logger` (JSON con `correlationId`).

#### Scenario: Compila y arranca con la configuración mínima
- **WHEN** se construye el servicio y se carga `loadConfig` con las variables obligatorias
- **THEN** `build`, `lint` y la prueba de configuración pasan

### Requirement: Configuración validada al arrancar
`loadConfig` SHALL leer solo del entorno, aplicar los valores por defecto de presupuesto (deadline 30 000 ms, LLM 20 000 ms, herramienta 3 000 ms) y fallar al arrancar con un mensaje claro si falta una variable obligatoria o si hay `ANTHROPIC_API_KEY` sin `LLM_MODEL`. SHALL NOT existir identificadores de modelo ni precios en el código.

#### Scenario: Clave sin modelo
- **WHEN** `ANTHROPIC_API_KEY` está definida y `LLM_MODEL` no
- **THEN** `loadConfig` lanza un error que nombra `LLM_MODEL`

### Requirement: Imagen con modelo horneado
`apps/ai-agent-service/Dockerfile` SHALL construir la imagen sobre Debian-slim (no Alpine), incluir el modelo ONNX descargado durante el build por `scripts/fetch-model.mjs`, ejecutarse como usuario no root y NOT descargar nada al arrancar. El servicio se integra en `docker-compose.yml` (redes `edge`, `backend` y `egress`).

#### Scenario: Modelo presente en la imagen
- **WHEN** se construye la imagen
- **THEN** el archivo del modelo existe en la ruta `EMBEDDING_MODEL_DIR` dentro de la imagen

### Requirement: Verificación integral
El servicio SHALL pasar `build`, `test` (≥70 % de líneas) y `lint` y el cambio SHALL sumar ≤30 pruebas. La versión del SDK contra la que se validó el adaptador SHALL constar en la cabecera de `anthropic.provider.ts`, sin identificadores de modelo ni precios en el código.

#### Scenario: Cierre verificable
- **WHEN** se ejecuta el gate de integración
- **THEN** build, test con cobertura y lint pasan y no existe ningún identificador de modelo en `apps/ai-agent-service/src`

## Evolución

- Sección de verificación contra la documentación del proveedor en `docs/architecture/08-integracion-ia-rag.md` y filas EX5 de `docs/traceability.md` en `Implementado`.
