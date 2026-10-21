---
spec: user-signup-saga
change: build-user-audit-services
wave: 0
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — Alta de usuario con saga (`apps/user-service`)

Implementa `docs/architecture/03-flujo-de-datos.md` (flujo de alta) y `07-resiliencia.md` (compensación, reconciliación, presupuesto). Suposiciones sobre auth/role/http-client: `design.md` A1, A5–A7.

## ADDED Requirements

### Requirement: Saga PENDING → ACTIVE
`CreateUser` SHALL crear el usuario con `status=PENDING`, validar el rol con `GET /roles/{id}`, aprovisionar credenciales con `PUT /internal/credentials/{userId}` con cuerpo `{email, password, roleId, roleName, roleVersion}` (nombre y versión del rol tomados de `GET /roles/{id}`) y, solo entonces, marcar `ACTIVE` y escribir `outbox_events(user.created)` en una única transacción. La contraseña SHALL NOT persistirse ni registrarse en logs en user-service.

#### Scenario: Camino feliz
- **WHEN** el rol existe y auth aprovisiona las credenciales
- **THEN** el usuario queda `ACTIVE` con `version=2` y existe una fila de outbox `user.created` con `aggregateVersion=2` sin contraseña

#### Scenario: Email duplicado local
- **WHEN** el email ya existe en `users`
- **THEN** la respuesta es 409 y no se llama a role-service ni a auth-service

### Requirement: Presupuesto del alta
Todo el alta (validación de rol y aprovisionamiento, con sus reintentos) SHALL respetar un presupuesto total de `SIGNUP_BUDGET_MS` (10 000 ms por defecto). Cada llamada SHALL recibir el presupuesto restante; con presupuesto agotado SHALL NOT intentarse ni reintentarse y SHALL iniciarse la compensación.

#### Scenario: Presupuesto agotado
- **WHEN** el tiempo restante del presupuesto es <= 0 antes de una llamada
- **THEN** no se realiza la llamada, se compensa y se responde 503

### Requirement: Compensación con orden seguro
Ante fallo del rol, de auth o de la activación, `CreateUser` SHALL llamar primero `DELETE /internal/credentials/{userId}` y SHALL borrar el usuario `PENDING` solo tras confirmarse el `DELETE` (2xx o 404). Si el `DELETE` falla, el usuario SHALL permanecer `PENDING` y la respuesta SHALL ser 503. Un `409` de auth SHALL compensar y responder 409.

#### Scenario: Rol no responde
- **WHEN** role-service falla o excede el timeout
- **THEN** se ejecuta `DELETE` de credenciales y después se borra el `PENDING`, y la respuesta es 503

#### Scenario: Falla el DELETE de compensación
- **WHEN** `DELETE /internal/credentials/{userId}` falla
- **THEN** el usuario sigue `PENDING` y no se invoca `deletePending`

### Requirement: Reconciliación con período de gracia
`ReconcilePending` SHALL procesar solo usuarios `PENDING` con antigüedad mayor que `RECONCILE_GRACE_MS` (por defecto 60 000, siempre > presupuesto del alta), llamar `DELETE` de credenciales y borrar el usuario solo si se confirma. Un fallo individual SHALL NOT abortar el resto. SHALL NOT existir dependencia inversa auth → user.

#### Scenario: Huérfano vencido
- **WHEN** hay un `PENDING` con más antigüedad que el período de gracia y el `DELETE` responde 2xx
- **THEN** el usuario se elimina

#### Scenario: Alta en vuelo
- **WHEN** el `PENDING` es más reciente que el período de gracia
- **THEN** la reconciliación no lo toca
