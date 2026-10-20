---
spec: rag-knowledge
change: build-ai-agent-rag-service
wave: 0,1
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — rag-knowledge (embeddings, almacén vectorial e ingesta)

Implementa ADR-009 y `docs/architecture/08-integracion-ia-rag.md` → `## Pipeline de ingesta`. Decisiones D9–D15 de `design.md`. No se ingiere PII de usuarios.

## Wave 0 — Embeddings y chunking

## ADDED Requirements

### Requirement: Embeddings locales de 384 dimensiones
`EmbeddingProvider` SHALL producir vectores de 384 dimensiones sin llamadas externas, con adaptador ONNX (MiniLM) en ejecución normal y adaptador `hash` determinista solo cuando `NODE_ENV=test`; el selector SHALL rechazar `hash` fuera de pruebas. El modelo SHALL cargarse desde un directorio local obtenido por `scripts/fetch-model.sh` con verificación `sha256`.

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

## Wave 1 — Almacén vectorial e ingesta

### Requirement: Almacén `knowledge_base` con filtro obligatorio
`KnowledgeStore` SHALL gestionar la colección `knowledge_base` (384-d, coseno) con payload `{source, docId, chunkIdx, roleScope, text}`. `search` SHALL exigir `roleScopes` y aplicar el filtro siempre (no existe búsqueda sin filtro). `upsertDocument(docId, chunks)` SHALL reemplazar todos los fragmentos previos del `docId` (idempotente, ids deterministas).

#### Scenario: Filtro por rol
- **WHEN** se busca con `roleScopes=['user','all']`
- **THEN** no se devuelven fragmentos cuyo `roleScope` sea solo `['admin']`

#### Scenario: Reingesta
- **WHEN** se ingesta dos veces el mismo `docId` con menos fragmentos la segunda vez
- **THEN** el almacén contiene únicamente los fragmentos de la segunda ingesta

### Requirement: Orígenes de ingesta
La ingesta SHALL aceptar (1) documentos semilla de `apps/ai-agent-service/knowledge/*.md` cargados al arrancar de forma idempotente, (2) `POST /agent/ingest` solo para el rol `AGENT_ADMIN_ROLE` (403 si no; tamaño ≤`INGEST_MAX_CHARS`) y (3) el consumidor `agent.ingest` (binding `role.#`) que regenera `role-catalog-{roleId}` y es idempotente por `eventId` y tolerante al reordenamiento por `aggregateVersion`. Un mensaje no válido SHALL ir a DLQ sin reencolar; un payload sin los campos esperados SHALL registrarse con `warn` y confirmarse sin lanzar.

#### Scenario: Usuario sin rol admin
- **WHEN** un usuario sin el rol admin llama a `POST /agent/ingest`
- **THEN** responde 403 y no se escribe nada en el almacén

#### Scenario: Evento duplicado
- **WHEN** llega dos veces el mismo `eventId` de `role.updated`
- **THEN** el documento se regenera una sola vez
