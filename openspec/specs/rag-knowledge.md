---
spec: rag-knowledge
change: build-ai-agent-rag-service
wave: 0,1
epics: EP-EX5
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — rag-knowledge (embeddings, almacén vectorial e ingesta)

> Spec canónica promovida desde el cambio archivado `build-ai-agent-rag-service` (as-built, 2026-10-21).

Implementa ADR-009 y `docs/architecture/08-integracion-ia-rag.md` → `## Pipeline de ingesta`. Decisiones D9–D15 de `design.md`. No se ingiere PII de usuarios.

## Requirements

### Requirement: Embeddings locales de 384 dimensiones
`EmbeddingProvider` SHALL producir vectores de 384 dimensiones sin llamadas externas, con adaptador ONNX (MiniLM) en ejecución normal y adaptador `hash` determinista solo cuando `NODE_ENV=test`; el selector SHALL rechazar `hash` fuera de pruebas. El modelo SHALL cargarse desde un directorio local (`EMBEDDING_MODEL_DIR`) poblado durante el build de la imagen por `scripts/fetch-model.mjs`, que comprueba que la salida es de 384 dimensiones.

#### Scenario: Hash determinista
- **WHEN** se embebe el mismo texto dos veces con el adaptador `hash`
- **THEN** ambos vectores son idénticos y de longitud 384

#### Scenario: Hash fuera de pruebas
- **WHEN** se solicita el adaptador `hash` con `NODE_ENV` distinto de `test`
- **THEN** el selector lanza un error

### Requirement: Chunking acotado con solape
El chunker SHALL dividir el texto normalizado en fragmentos de ≤`CHUNK_MAX_TOKENS` (256) con solape de ~`CHUNK_OVERLAP_TOKENS` (32), usando el contador de tokens del proveedor de embeddings, y SHALL NOT producir fragmentos vacíos.

#### Scenario: Documento largo
- **WHEN** se trocea un texto que excede 256 tokens
- **THEN** cada fragmento tiene ≤256 tokens y fragmentos consecutivos comparten el solape

### Requirement: Almacén `knowledge_base` con filtro obligatorio
`KnowledgeStore` SHALL gestionar la colección `knowledge_base` (384-d, coseno) con payload `{source, docId, chunkIdx, roleScope, text}`. `search` SHALL exigir `roleScopes` y aplicar el filtro siempre (no existe búsqueda sin filtro). `upsertDocument(docId, chunks)` SHALL reemplazar todos los fragmentos previos del `docId` (idempotente, ids deterministas). La búsqueda SHALL usar la API `query` de `@qdrant/js-client-rest` (fijado a `~1.19.0`, versión que no expone `search`), con el cliente creado con `checkCompatibility: false` porque la versión del servidor está fijada en `docker-compose.yml`.

#### Scenario: Filtro por rol
- **WHEN** se busca con `roleScopes=['user','all']`
- **THEN** no se devuelven fragmentos cuyo `roleScope` sea solo `['admin']`

#### Scenario: Reingesta
- **WHEN** se ingesta dos veces el mismo `docId` con menos fragmentos la segunda vez
- **THEN** el almacén contiene únicamente los fragmentos de la segunda ingesta

### Requirement: Orígenes de ingesta
La ingesta SHALL aceptar (1) documentos semilla de `apps/ai-agent-service/knowledge/*.md` cargados al arrancar de forma idempotente, (2) `POST /agent/ingest` solo con el permiso `agent:ingest` (403 si no; tamaño ≤`INGEST_MAX_CHARS`), invocable también desde la UI web. El consumidor AMQP `agent.ingest` (binding `role.#`, regeneración de `role-catalog-{roleId}`) no forma parte de este cambio (ver Evolución).

#### Scenario: Usuario sin permiso de ingesta
- **WHEN** un usuario sin el permiso `agent:ingest` llama a `POST /agent/ingest`
- **THEN** responde 403 y no se escribe nada en el almacén

#### Scenario: Semilla repetida
- **WHEN** el servicio arranca dos veces con los mismos documentos semilla
- **THEN** el almacén no contiene fragmentos duplicados

## Evolución

- Pin de integridad `sha256` del modelo ONNX descargado por `fetch-model.mjs`.
- Consumidor AMQP `agent.ingest` para reindexar conocimiento a partir de eventos `role.#`.
