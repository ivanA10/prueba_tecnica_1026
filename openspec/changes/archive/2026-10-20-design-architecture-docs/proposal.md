# Proposal — design-architecture-docs

> Change 1 de 9. Cubre el Ejercicio 1 del PDF "Prueba Técnica – Senior Full-Stack Engineer (IA)" (Diseño y Arquitectura de Software). Cambio **solo de documentación**: no se escribe código fuente.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (CLI `opsx` no disponible en el sub-agente planner; ver nota en design.md, sección "Plan metadata").

**En simple:** Este cambio deja por escrito, antes de programar, cómo será todo el sistema: qué microservicios existen, cómo se hablan, qué base de datos usa cada uno, cómo se integra el agente de IA y por qué elegimos cada tecnología. Incluye 10 decisiones de arquitectura (ADR) que un auditor externo va a revisar, y una matriz que liga cada requisito del PDF con el cambio que lo cumplirá, para que nada se pierda en los 8 cambios siguientes. No toca código ni levanta contenedores todavía.

## Esquema de identificadores (reutilizable por los 9 cambios)

- Épica de este cambio: `EP-EX1` (Ejercicio 1 — Arquitectura). Los cambios posteriores usan `EP-EX2` … `EP-EX5` según la numeración del PDF.
- Historias: `US-EX1-01` … `US-EX1-11` (ver tabla). Los cambios siguientes usan `US-EX<n>-NN`.
- Requisitos del PDF: `EX<n>-R<NN>` (ver `docs/traceability.md`, generado por la tarea 1.4).

| Historia | Descripción |
|---|---|
| US-EX1-01 | Diagramas de arquitectura (C4 contenedores + secuencias) |
| US-EX1-02 | Justificación técnica por tecnología/patrón |
| US-EX1-03 | Explicación del flujo de datos entre microservicios |
| US-EX1-04 | Diseño de `docker-compose.yml` (estructura básica documentada) |
| US-EX1-05 | Aplicación de DDD, Clean Architecture y CQRS |
| US-EX1-06 | Seguridad y escalabilidad |
| US-EX1-07 | Resiliencia y manejo de fallos entre servicios |
| US-EX1-08 | Integración de IA / RAG en la arquitectura |
| US-EX1-09 | 10 ADRs auditables (Contexto / Decisión / Alternativas / Consecuencias) |
| US-EX1-10 | Estrategia multi-DB justificada |
| US-EX1-11 | Matriz de trazabilidad PDF → cambio → artefacto (5 ejercicios) |

## Problem

La prueba exige diseñar (Ejercicio 1) un sistema de gestión de usuarios con microservicios (auth, usuarios, roles, auditoría), comunicación síncrona y asíncrona, estrategia multi-DB, un módulo de IA con RAG y ejecución local con Docker Compose, y luego implementarlo (Ejercicios 2–5). Sin un diseño explícito y decisiones documentadas con alternativas y trade-offs:

- los 8 cambios de implementación divergirían en nombres, contratos, puertos y eventos;
- el auditor externo no tendría material para evaluar el razonamiento (claridad arquitectónica, patrones, seguridad, resiliencia, multi-DB, IA);
- requisitos secundarios del PDF (explicación de flujo de datos, DDD/Clean dos veces, dos documentos de ejecución, cobertura como reporte) podrían omitirse silenciosamente.

## Solution

Producir, en español, el paquete documental del Ejercicio 1:

1. `docs/architecture/` con 8 documentos temáticos + índice (diagramas Mermaid, justificación técnica, flujo de datos, diseño del compose, DDD/Clean/CQRS, seguridad y escalabilidad, resiliencia, integración IA/RAG).
2. `docs/adrs/ADR-001` … `ADR-010` en formato `forge:adr` (Context / Decision / Consequences / Alternatives considered + `## Implementación` que marca Implementado vs Evolución), con alternativas descartadas y consecuencias positivas/negativas explícitas.
3. `docs/traceability.md`: matriz requisito del PDF → cambio → artefacto para los 5 ejercicios.
4. `design.md` de este cambio fija el **contrato documental** (catálogo de servicios, eventos, endpoints, claves Redis, modelo de datos) que todos los documentos y cambios posteriores deben respetar.

## Scope

- Documentación en `docs/architecture/`, `docs/adrs/`, `docs/traceability.md`.
- Diagramas Mermaid: C4 de contenedores + 3 secuencias (login/validación JWT, `user.created` → auditoría, consulta RAG del agente).
- Diseño (no ejecutable) de `docker-compose.yml` como bloque YAML documentado.
- Contratos de eventos y APIs a nivel de diseño (nombres, campos principales), no OpenAPI completo.

## Out of scope

- Cualquier código fuente, Dockerfile o `docker-compose.yml` ejecutable (cambios 2–7).
- OpenAPI completo por servicio (cambios 3, 4, 7).
- Prompt engineering detallado y evaluación del agente (cambio 8).
- Diagnóstico de incidentes (Ejercicio 4; cambio 9).
- IDs concretos de modelo LLM y precios: se documenta "configurable vía variables de entorno; verificado contra la documentación de Anthropic en `build-ai-agent-rag-service`".
- Pin de ADRs en Engram con `topic_key=adr/NNN`: ese namespace no existe en `schemas/memory-topics.md` (brecha señalada al orquestador).

## Success criteria

1. Existen los 10 ADRs con las 5 secciones requeridas (Context, Decision, Consequences, Alternatives considered, Implementación), frontmatter `forge:adr` y ≥2 alternativas descartadas cada uno (verificable con `grep`).
2. `docs/architecture/01-diagramas.md` contiene ≥4 bloques Mermaid (C4 + 3 secuencias); todos los servicios del catálogo aparecen en el C4.
3. Cada entregable y criterio de evaluación del Ejercicio 1 del PDF (5 entregables, 8 criterios) tiene un documento/sección que lo cubre, citado en `docs/traceability.md`.
4. `docs/traceability.md` cubre los 5 ejercicios, referencia los 9 cambios planeados y cada fila tiene artefacto con ruta.
5. Ningún documento hardcodea IDs de modelo LLM ni precios (`grep` negativo).
6. Consistencia: nombres de servicios, rutas de eventos y claves Redis coinciden con el contrato de `design.md`.
7. Auditor externo puede leer `docs/adrs/*.md` + `proposal.md` + `design.md` y escribir `docs/audit/design-architecture-docs-audit.md` sin información adicional.

## Estado

Archivado 2026-10-20. Commits bd93d18 (plan) y b20318b (entregables). Auditoría final: APROBADO. Validator: 16/18. Specs canónicas promovidas a `openspec/specs/` (architecture-decision-records, requirements-traceability, architecture-documentation).
