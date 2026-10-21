---
spec: system-verification
change: harden-compose-resilience-security
wave: 1,2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — system-verification

> Spec canónica promovida desde el cambio archivado `harden-compose-resilience-security` (as-built, 2026-10-21).

## Requirements

### Requirement: Smoke end-to-end
`scripts/smoke.sh` SHALL ejecutar contra `BASE_URL` (por defecto `http://localhost:8080`), usando solo `curl` y `node` (sin `jq`) y leyendo las credenciales del administrador de `infra/env/user-service.env`: `GET /healthz`, login del administrador semilla (con reintentos mientras se siembra), alta de un usuario con email único, presencia del usuario en `GET /api/users`, sondeo cada 2 s (hasta 20 intentos) de `GET /api/audit/events?type=user.created` hasta encontrar el usuario creado y `POST /api/agent/ask` con `answer` no vacío. SHALL terminar con código distinto de 0 e imprimir `FAIL:` con el paso en cuanto uno falle, y SHALL NOT imprimir contraseñas ni tokens.

#### Scenario: Flujo completo
- **WHEN** el stack está sano y se ejecuta `bash scripts/smoke.sh`
- **THEN** el código de salida es 0 y la última línea es `OK: login, alta de usuario, listado, auditoria y agente funcionan de extremo a extremo`

#### Scenario: Evento de auditoría con consistencia eventual
- **WHEN** el alta termina y el evento aún no llegó a `audit-service`
- **THEN** el script reintenta cada 2 s antes de fallar

### Requirement: Suite e2e en navegador contra el stack real
`e2e/` SHALL contener una suite Playwright (22 pruebas en `agent`, `audit`, `auth`, `permissions`, `roles` y `users`) que se ejecuta contra `E2E_BASE_URL` (por defecto `http://localhost:8080`) con el sistema levantado, y `e2e/CHECKLIST.md` SHALL mapear cada caso manual a su prueba.

#### Scenario: Agente contra Qdrant real
- **WHEN** se ejecuta `e2e/agent.spec.ts` con el stack levantado
- **THEN** un documento ingerido desde "Cargar conocimiento" aparece como fuente citada en la respuesta del agente

## Evolución

- `scripts/resilience-check.sh` (Redis caído: fail-open del denylist; role-service caído: `503` sin usuario `ACTIVE`).
- Verificación integral desde cero encadenando `smoke.sh`, `check-owasp.sh`, `resilience-check.sh` y `verify-isolation.sh`.
