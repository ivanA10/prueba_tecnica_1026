---
id: ADR-008
title: Puerto LlmProvider con Anthropic por defecto y mock sin API key
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0, ia, llm, seguridad]
---

# ADR-008 — Puerto `LlmProvider`

## Context
El agente de IA depende de un proveedor externo con latencia, límites de tasa (429), coste variable y riesgos específicos (prompt injection, fuga de datos). El PDF nombra OpenAI/Azure OpenAI en Ex1 y permite explícitamente usar Anthropic en Ex5; la arquitectura (puerto + ranura de adaptador) satisface ambos. El evaluador debe poder ejecutar el sistema sin clave de API, y los valores sensibles al tiempo (modelos, precios) no deben quedar fijados en la documentación.

## Decision
1. **Puerto `LlmProvider`** en la capa de aplicación de `ai-agent-service` (ADR-006); el dominio no conoce SDKs.
2. **Adaptador Anthropic por defecto**. Las capacidades que necesita el diseño las ofrecen también otros proveedores (incluido OpenAI), por lo que no son diferenciadoras; se eligió por:
   - **Disponibilidad de clave y preferencia del equipo**: es el proveedor con el que se cuenta para la implementación.
   - **Capacidades que el diseño requiere y el SDK cubre**: tool use con esquema de entrada para la herramienta de solo lectura hacia user-service, prompt caching para reducir tokens de entrada y reintentos/backoff ante 429 y 5xx configurables con `max_retries` y `timeout` explícitos (punto 5).
   - **Embeddings locales** (ADR-009): no se necesita la API de embeddings de ningún proveedor, así que la elección afecta solo a la generación.
   - El PDF permite Anthropic de forma explícita en Ex5.
3. **Ranura de adaptador OpenAI/Azure OpenAI**: el Ex1 del PDF nombra OpenAI/Azure OpenAI. El puerto `LlmProvider` es el mecanismo por el que ese requisito se cumple por arquitectura: añadir el adaptador no toca dominio ni casos de uso. La implementación del adaptador es Evolución (ver `## Implementación`).
4. **Adaptador `mock` determinista**: se activa automáticamente si no hay API key, de modo que el sistema arranca y responde sin credenciales. Los embeddings locales (ADR-009) siguen funcionando; solo la generación cae a `mock`.
5. **Manejo de 429 y fallos, con presupuesto total**: el agente tiene un *deadline* extremo a extremo de **30 s** por consulta. Jerarquía: nginx (`proxy_read_timeout` de 40 s en `/api/agent/`) > agente (30 s) > llamada al LLM (20 s) y herramienta hacia user-service (3 s).
   - Se permite **como máximo 1 reintento** del LLM, y solo si queda presupuesto. Ante 429 se respeta `retry-after` únicamente dentro del presupuesto restante.
   - Al agotarse el presupuesto el agente responde **degradado** (solo fragmentos recuperados, indicando que no hay generación) y **cancela la petición en curso** con `AbortController`: se deja de esperar y de retener recursos locales, pero el consumo ya iniciado en el proveedor puede facturarse (una petición no streaming no garantiza detener la generación). `max_tokens` acota ese coste; el streaming sería la evolución para cortarlo.
   - Además: limitador de concurrencia, rate limit por usuario en Redis (`agent:rl:{userId}:{route}`) y circuit breaker agent→LLM (ADR-005).
6. **Configuración por entorno**: el modelo y los precios son variables de entorno. Para estimar coste se usan `LLM_PRICE_INPUT_PER_MTOK` y `LLM_PRICE_OUTPUT_PER_MTOK`, sin valores en la documentación. Es decir: configurable vía variables de entorno; verificado contra la documentación de Anthropic en `build-ai-agent-rag-service`.
7. **Identidad delegada**: `POST /agent/ask` exige JWT y la herramienta REST hacia user-service **reenvía el JWT del llamante**; user-service aplica RBAC sobre ese token (evita el confused deputy). El agente no tiene identidad privilegiada.
8. **Lista blanca de campos enviados al LLM**: solo `id`, `name`, `role`, `status` de usuario. Nunca hash, email completo ni datos sensibles salvo decisión documentada.
9. **Prompt injection (OWASP LLM01)**:
   - El contenido recuperado (RAG) y la salida de herramientas son datos no confiables: se delimitan y no se tratan como instrucciones.
   - Las herramientas del agente son de solo lectura.
   - La salida se valida contra un esquema y se acota con `max_tokens`.
   - No hay PII de usuarios en el vector store (ADR-009).
10. Cada llamada registra `llm.provider`, `llm.tokensIn`, `llm.tokensOut` (ADR-007), nunca el contenido del prompt.

## Consequences
### Positivas
- Cambiar de proveedor no toca dominio ni casos de uso; las pruebas usan `mock` sin red.
- El evaluador ejecuta el flujo completo sin clave de API.
- La delegación del JWT mantiene la autorización en un único punto (user-service).

### Negativas y riesgos
- El `mock` no refleja la calidad real de un LLM; las respuestas de demostración son deterministas.
- El adaptador OpenAI/Azure no está implementado: riesgo aceptado, declarado como Evolución. Un evaluador del Ex1 puede leerlo como desviación; se mitiga porque el puerto permite añadirlo sin tocar dominio.
- La degradación por agotamiento del presupuesto entrega solo fragmentos, sin texto generado.
- La lista blanca limita la utilidad de preguntas que requieran campos excluidos.
- La mitigación de prompt injection reduce, no elimina, el riesgo; por eso las herramientas son de solo lectura.
- Depender de variables de entorno exige verificar la configuración al desplegar.

## Alternatives considered
### Alternativa 1 — OpenAI/Azure OpenAI como único proveedor
Por qué se descartó: aunque el Ex1 nombra OpenAI/Azure OpenAI, fijarlo como único proveedor sin puerto dificulta las pruebas sin red y el cambio de proveedor, y obliga a elegir hoy un proveedor sin poder cambiarlo. No es una cuestión de capacidades (OpenAI ofrece tool use, caching y SDK con reintentos equivalentes): con el puerto, OpenAI/Azure sigue disponible como adaptador.

### Alternativa 2 — Llamada directa al SDK sin puerto
Por qué se descartó: acopla la lógica del agente al SDK, impide un `mock` limpio y viola la regla de dependencias de Clean Architecture (ADR-006).

### Alternativa 3 — Identidad privilegiada propia para el agente
Por qué se descartó: introduce un confused deputy; reenviar el JWT del llamante preserva el RBAC.

## Implementación
- **Implementado en `build-ai-agent-rag-service`**: puerto `LlmProvider`, adaptador Anthropic, adaptador `mock`, limitador y rate limit, lista blanca, defensas de prompt injection, reenvío de JWT.
- **Evolución**: adaptador OpenAI/Azure OpenAI.
