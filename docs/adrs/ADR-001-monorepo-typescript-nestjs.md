---
id: ADR-001
title: Monorepo pnpm con TypeScript y NestJS en todos los servicios
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0]
---

# ADR-001 — Monorepo pnpm con TypeScript y NestJS en todos los servicios

## Context

El Ejercicio 2 de la prueba técnica exige una solución de microservicios con autenticación distribuida, mensajería asíncrona, multi-DB y Docker, y el Ejercicio 5 añade un agente de IA que debe integrarse con al menos uno de esos servicios. El tiempo disponible es acotado (Ex1 = 90 min de diseño, Ex2 = 120 min de implementación) y el stack declarado del proyecto es Node 22, TypeScript y NestJS 11 (frontend React 18).

Hay cinco servicios de aplicación (`auth-service`, `user-service`, `role-service`, `audit-service`, `ai-agent-service`) más `web`. Necesitamos coherencia de herramientas (lint, test, build, Docker), contratos de eventos compartidos y una librería común de validación JWT, sin acoplar el dominio de unos servicios con otros.

## Decision

Un único repositorio **monorepo gestionado con pnpm workspaces**, con **TypeScript + NestJS en todos los servicios**, incluido el agente de IA.

Paquetes compartidos permitidos: **solo transversales**.

- `packages/logger`: configuración de pino y campos de log estándar (ADR-007).
- `packages/jwt-guard`: guard de validación local de JWT contra JWKS, con consulta de solo lectura del denylist (ADR-003).
- `packages/contracts`: esquemas de eventos, sobre de evento y DTOs de las APIs internas.

**Nunca se comparte dominio**: entidades, agregados, reglas de negocio o repositorios viven dentro de cada servicio. Si dos servicios necesitan el mismo concepto, cada uno lo modela en su contexto delimitado (ADR-002).

**Regla de compatibilidad hacia atrás de `contracts`**: el paquete se versiona con semver y los cambios en esquemas de eventos y DTOs son solo aditivos dentro de una misma versión mayor (campos nuevos opcionales; no se eliminan ni renombran campos, ni se cambia su tipo). Un cambio incompatible exige nueva versión del evento (campo `version` del sobre) y un período de convivencia en que los consumidores aceptan ambas versiones. Cada servicio declara la versión de `contracts` que consume.

## Consequences

### Positivas

- Un solo lenguaje y un solo modelo de DI reducen la carga cognitiva y aceleran la entrega dentro de los tiempos del PDF.
- Cambios atómicos entre servicios y contratos (una sola PR), y tooling único para lint, tests con umbral de cobertura y build de imágenes Docker.
- `jwt-guard` y `logger` aseguran validación de tokens y logging homogéneos sin duplicar código.
- El agente en TypeScript reutiliza `jwt-guard`, `logger` y los contratos de eventos.

### Negativas y riesgos

- Acoplamiento de versión de Node/NestJS entre servicios: una actualización mayor afecta a todos a la vez.
- Riesgo de que `contracts` o los paquetes compartidos degeneren en "dominio compartido" y acoplen despliegues. Mitigación: la regla de solo transversales se revisa en cada PR y el validador la comprueba.
- Un monorepo requiere builds con caché y filtrado por paquete (`pnpm --filter`) para que el CI no reconstruya todo.
- El ecosistema de IA en Node es menos rico que el de Python; se asume porque el agente solo orquesta un LLM por API, embeddings ONNX locales y Qdrant (ADR-008, ADR-009).

## Alternatives considered

### Alternativa 1 — Poliglota (Python FastAPI para el agente de IA)

Aprovecharía las librerías de IA de Python. Por qué se descartó: duplica toolchain, CI, imágenes y librería de validación JWT en un ejercicio con tiempo limitado, y el agente no necesita entrenar ni ejecutar modelos pesados (usa un LLM por API y embeddings ONNX que también corren en Node).

### Alternativa 2 — Repositorios separados por servicio

Máximo aislamiento de despliegue y propiedad. Por qué se descartó: multiplica la fricción de coordinación de contratos y paquetes compartidos, hace imposible un cambio atómico entre servicio y contrato, y dificulta que el evaluador clone y levante todo con un solo `docker compose`.

## Implementación

- **Implementado en `bootstrap-monorepo-platform`**: workspace pnpm, esqueleto de los servicios NestJS, `packages/logger`, `packages/jwt-guard` (estructura) y `packages/contracts` con la regla de compatibilidad.
- `jwt-guard` completo se entrega en `build-auth-role-services`; los esquemas de eventos se completan en `build-user-audit-services`.
- **Evolución** (no implementado, riesgo aceptado): publicación de `contracts` como paquete versionado en un registro privado y verificación automática de compatibilidad (por ejemplo, un check de esquemas en CI).
