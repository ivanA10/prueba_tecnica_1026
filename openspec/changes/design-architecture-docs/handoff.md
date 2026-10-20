# Implementation Handoff — design-architecture-docs

## Change summary
- **Change name:** design-architecture-docs
- **Approved proposal:** `openspec/changes/design-architecture-docs/proposal.md`
- **Approved design:** `openspec/changes/design-architecture-docs/design.md`
- **Approved tasks:** `openspec/changes/design-architecture-docs/tasks.md` (9 tareas, 2 waves)

## Goal
Producir, en español, el paquete documental del Ejercicio 1 (diagramas Mermaid, justificación técnica, flujo de datos, diseño de compose, DDD/Clean/CQRS, seguridad/escalabilidad, resiliencia, IA/RAG), los 10 ADRs auditables y la matriz de trazabilidad de los 5 ejercicios. Solo documentación; sin código.

## In scope
- `docs/architecture/01..08-*.md` + `README.md`, `docs/adrs/ADR-001..010-*.md`, `docs/traceability.md`.

## Out of scope
- Código, Dockerfiles, compose ejecutable, OpenAPI completo, prompts/evaluación del agente, diagnóstico Ex4.
- IDs de modelo LLM y precios (nunca en docs).

## Decisions already closed
- Contrato de `design.md`: catálogo de servicios y puertos (3001–3005, web 8080), exchange `toka.events`, routing keys, claves Redis, colección Qdrant `knowledge_base` 384-d, nombres de archivo de docs y ADRs.
- Alta de usuario: PENDING → REST role-service → `PUT /internal/credentials/{userId}` (idempotente; auth es el único que hashea; credenciales PENDING; no enrutado por nginx; JWT de servicio) → ACTIVE + outbox `user.created` → auth activa credenciales; `DISABLED` se propaga; compensación `DELETE` + reconciliación con período de gracia. Claim de rol desde `user_roles_projection`.
- Eventos: bindings con `#`; colas `audit.events`, `auth.user-projection`, `agent.ingest` (`role.#`); reintentos con colas de retardo antes de DLQ; outbox solo en user-service (auth = Evolución, riesgo aceptado).
- Redis: prefijo por servicio por convención (ACL = Evolución); única lectura cruzada `auth:deny:jti:*` vía `jwt-guard`, fail-open solo en el denylist si Redis cae (log warn + métrica; access token corto). JWT con `aud`, un solo `kid` (rotación = Evolución); tokens de servicio por `client_credentials` en `/oauth/token` solo red interna; único refresh `POST /auth/refresh`; hash argon2id solo en auth.
- Orden de eventos: `aggregateVersion` + `occurredAt`; consumidores ignoran eventos viejos. Auth nunca borra credenciales automáticamente (barrido = Evolución). `access.denied` = log pino (AMQP = Evolución). Respaldo `audit.fallback` en log si se agotan reintentos de publicación de auth.
- Ronda 3: compensación = `DELETE` credenciales primero, luego borrar PENDING (si falla, queda PENDING y user-service reintenta); presupuesto alta ≤10 s (user→role 2 s, user→auth 3 s, agent→user 3 s); agente 30 s (LLM 20 s, ≤1 reintento; nginx `/api/agent/` 40 s; respuesta degradada + `AbortController`); env por servicio en `infra/env/<service>.env` (+ `.example`), sin `env_file` compartido; revocación por usuario `auth:deny:user:{userId}` (jwt-guard rechaza `iat` < timestamp); proyección con `user_last_version` y `role_last_version`; role-service publica directo (riesgo aceptado, re-sync al arrancar); Redis `requirepass ${REDIS_PASSWORD}`; Grafana Alloy (no Promtail); script de init de Mongo con `audit_user` (readWrite `audit_db`).
- Ronda 4: reconciliación = `DELETE` credenciales y solo al confirmarse borrar el PENDING; proyecciones `user_roles_projection(user_id, role_id, user_last_version)` + `role_names_projection(role_id, role_name, last_version)` (nombre por join al emitir token); excepción de lectura cruzada = `auth:deny:jti:*` y `auth:deny:user:*`; redes `public` (web), `edge` internal, `backend` internal, `egress` (solo ai-agent), `grafana-ui`; re-sync de role-service con `actor=system`, `reason=resync`, `eventId` determinista.
- Nota para `bootstrap-monorepo-platform`: decidir `packages/http-client` (cliente HTTP con timeout, retry y circuit breaker) dado que user-service y ai-agent-service necesitan resiliencia saliente; alternativa: duplicar en `apps/{user-service,ai-agent-service}/src/infrastructure/http/` (ADR-001: sin dominio en paquetes compartidos; un cliente HTTP es transversal y admisible).
- Seguimientos: (1) `harden-compose-resilience-security` incluye la verificación de egress (`user-service` no puede hacer `fetch` a Internet); (2) `build-user-audit-services` prueba el filtro `reason=resync` (re-sync de role-service no contamina la auditoría) y el payload de `user.role.assigned` (`userId`, `roleId`, `roleName`, `roleVersion`); (3) cada cambio conserva las marcas Implementado/Evolución de los ADR y actualiza el estado en `docs/traceability.md`.
- Evolución declarada (no implementar en esta prueba): rotación JWKS, discovery OIDC, ACL Redis, barrido de auth, outbox de auth, `access.denied` por AMQP, adaptador OpenAI/Azure, perfil `observability`.
- Agente: reenvía el JWT del llamante; lista blanca de campos al LLM; RAG solo sobre documentos de conocimiento; chunks ≤256.
- nginx = reverse proxy / gateway ligero (no "BFF"); ADR-010 en `ADR-010-frontend-react-rtk-nginx-gateway.md`.
- Gates por contenido (sin umbrales de líneas).
- ADRs con `status: proposed` hasta aprobar el 📋; luego el orquestador los pasa a `accepted`.
- Wave 0 (ADRs + trazabilidad) antes de Wave 1 (docs de arquitectura citan ADRs).

## Open risks / follow-ups
- Brecha: `adr/NNN` no existe en `schemas/memory-topics.md`; ADRs no se fijan en Engram.
- `openspec/config.yaml` ausente (el orquestador corre `openspec init`).
- Versiones mayores del stack según `AGENTS.md`; imágenes/librerías no listadas allí: `needs-verification`.
- El pin de ADRs vía forge:adr se omitirá con `[MEMORY] WARNING` (namespace `adr/` ausente); los archivos en `docs/adrs/` son la fuente de verdad.
- Dispatch de tareas: el orquestador despacha `backend` acotado a `docs/**` (el planner no puede ejecutar gates `cmd:`); perfil de tarea `fullstack`.

## Source-of-truth files
- `openspec/changes/design-architecture-docs/proposal.md`
- `openspec/changes/design-architecture-docs/design.md`
- `openspec/changes/design-architecture-docs/tasks.md`
- `openspec/changes/design-architecture-docs/specs/{architecture-decision-records,requirements-traceability,architecture-documentation}.md`
- PDF: `Prueba_Tecnica_Desarrollador_Fullstack IA.pdf` (Ejercicio 1, pp. 1–2)

## Implementation guidance
- Tareas 1.1–1.4 son independientes (paralelizables, archivos distintos); 2.1–2.5 dependen de los ADRs.
- No ampliar alcance; si un documento contradice `design.md`, pausar y enmendar el contrato primero.

## Verification guidance
- Cada tarea trae un gate `cmd:` (existencia + encabezados + conteos + grep negativo de modelos/precios).
- Después: validador + auditor externo (`docs/audit/design-architecture-docs-audit.md`).

## Suggested implement prompt
Ejecutar `forge:orchestrate` para `design-architecture-docs`: Wave 0 (1.1–1.4) y luego Wave 1 (2.1–2.5), con checkpoint tras cada wave y gate ✅ al final.

## Suggested checkpoints
- Planning-approved (📋)
- Fin de Wave 0 (ADRs + trazabilidad)
- Fin de Wave 1 / pre-verify
- Post-verify
