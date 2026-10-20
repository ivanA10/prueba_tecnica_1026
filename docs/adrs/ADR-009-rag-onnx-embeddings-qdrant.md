---
id: ADR-009
title: RAG sobre documentos de conocimiento con embeddings ONNX locales y Qdrant
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0, rag, embeddings, qdrant]
---

# ADR-009 — RAG con embeddings locales y Qdrant

## Context
El agente necesita recuperar contexto para responder (Ex5). Los embeddings por API externa añaden dependencia de red, clave y coste, y no funcionan sin API key. Ingerir datos de usuarios en un vector store crearía copias con PII desactualizadas y fuera del RBAC.

## Decision
1. **El RAG indexa documentos de conocimiento**: políticas, catálogo de roles/permisos y guías de uso. **No se ingiere PII de usuarios**: esos datos solo llegan por la herramienta REST hacia user-service (frescos y autorizados, ADR-008).
2. **Embeddings locales con ONNX** (modelo MiniLM), **384 dimensiones**, sin llamadas externas.
3. **Chunks de ≤256 tokens con solapamiento de ~32** (límite de entrada de MiniLM).
4. **El modelo se hornea en la imagen** (base Debian-slim, no Alpine, por compatibilidad con ONNX Runtime) para que el arranque no requiera descargas.
5. **Embeddings `hash` solo para tests unitarios**; nunca en ejecución normal.
6. **Qdrant**: colección `knowledge_base` (384-d, distancia coseno); payload `{source, docId, chunkIdx, roleScope}`; **upsert por `docId`** estable (idempotente).
7. **Ingesta**: `POST /agent/ingest` (solo admin) y la cola `agent.ingest` (binding `role.#`) que regenera los documentos del catálogo de roles cuando cambian (consumidor idempotente por `eventId`, ADR-004).
8. Sin API key, el RAG funciona completo; solo la generación cae a `mock` (ADR-008).

## Consequences
### Positivas
- Sin dependencias externas para recuperar contexto; el sistema se evalúa sin credenciales.
- Sin PII en Qdrant: menor superficie de fuga y sin datos obsoletos.
- El upsert por `docId` hace la ingesta repetible.

### Negativas y riesgos
- La imagen del agente crece por el modelo horneado y por ONNX Runtime.
- MiniLM tiene calidad limitada en español técnico frente a modelos mayores.
- Los chunks de 256 tokens pueden cortar contexto; el solapamiento lo mitiga parcialmente.
- Un cambio de modelo exige reindexar la colección (la dimensión es parte del contrato).
- Un documento de conocimiento malicioso puede inyectar instrucciones: se trata como dato no confiable (ADR-008).

## Alternatives considered
### Alternativa 1 — Embeddings por API externa
Por qué se descartó: requiere clave y red, añade coste y latencia, y no permite RAG real sin API key.

### Alternativa 2 — Chroma como almacén vectorial
Por qué se descartó: Chroma también ofrece filtros por metadatos y upsert por id, por lo que la funcionalidad no es el factor decisivo. Se prefiere Qdrant por ser un servidor dedicado con healthcheck propio en compose (contenedor independiente, sin acoplar el almacén al proceso del agente), por su payload indexado para el filtro obligatorio por `roleScope` y como preferencia declarada del diseño. Adoptar Chroma sería viable y no invalida el puerto `KnowledgeStore`.

### Alternativa 3 — Ingerir usuarios al vector store
Por qué se descartó: duplica PII, queda desactualizada y evade el RBAC de user-service.

## Implementación
- **Implementado en `build-ai-agent-rag-service`**: embeddings ONNX, chunking, colección `knowledge_base`, ingesta y consumidor `agent.ingest`.
- **Implementado en `harden-compose-resilience-security`**: verificación del arranque sin red y healthcheck de Qdrant.
- **Evolución**: modelos de embeddings multilingües mayores; reindexado versionado.
