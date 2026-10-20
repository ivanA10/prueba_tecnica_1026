# Implementation Handoff — build-user-audit-services

## Change summary
- **Change:** build-user-audit-services (4 de 9)
- **Artefactos:** `proposal.md`, `design.md`, `tasks.md` (12 tareas: W0=4, W1=5, W2=3), `specs/` (5)
- **Prerrequisitos:** cambio 2 (`bootstrap-monorepo-platform`) implementado (paquetes `@toka/*`, infra compose, `bootstrap-env.sh`); cambio 3 puede ir en paralelo (los servicios solo lo necesitan en ejecución real, no en pruebas unitarias).

## Goal
`apps/user-service` (saga de alta, outbox, eventos) y `apps/audit-service` (consumidor idempotente con reintentos/DLQ, consulta con RBAC), con Dockerfile, cobertura >=70 % y humo del pipeline de auditoría.

## Decisions already closed
- Ver `design.md` D1–D16 y los supuestos A1–A9 (reconciliar tras cambios 2 y 3: firma exacta de `@toka/http-client`, parámetro `audience` en `/oauth/token`, cuerpo de `PUT credentials`, respuesta de `GET /roles/{id}`).
- Audit descarta `reason=resync`; la contraseña nunca se persiste (reconciliación solo compensa); retardo de reintento fijo por env.

## Out of scope
Compose/nginx/egress (cambio 5), auth/role (cambio 3), agente (cambio 7), `access.denied` por AMQP, escalonado de retardos.

## Open risks / follow-ups
- Tareas densas: 2.1 y 3.2. Si la jornada (17:30) aprieta, diferir 3.2 como seguimiento.
- Seguimiento 3 del cambio 1: mantener marcas Implementado/Evolución en ADR (tarea 3.3).
- Seguimiento 1 (egress de user-service) pertenece al cambio 5.
- Topic_keys a guardar por el orquestador (el planner no tiene `mem_save`): `spec/build-user-audit-services`, `gate/plan-approved/build-user-audit-services`.

## Implementation guidance
- TDD estricto en 1.3–2.5; tope 6 pruebas por tarea, 8 por archivo, 30 por cambio.
- Pistas independientes tras 1.1: user (1.3→1.4→2.1→2.2) y audit (1.2→2.3→2.4→2.5).
- No ejecutar `pnpm add` fuera de 1.1.

## Suggested checkpoints
Plan-approved; fin Wave 0; fin Wave 1; pre-verify (tras 3.3); post-verify.
