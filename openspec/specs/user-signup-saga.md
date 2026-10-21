---
spec: user-signup-saga
change: build-user-audit-services
wave: 0
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — Alta de usuario con saga (`apps/user-service`)

> Spec canónica promovida desde el cambio archivado `build-user-audit-services`. Describe el comportamiento as-built. Flujo en `docs/architecture/03-flujo-de-datos.md`; compensación y presupuesto en `07-resiliencia.md`.

## Requirements

### Requirement: Saga PENDING → ACTIVE
`POST /users` SHALL comprobar que el email no existe (409 si existe, sin llamar a otros servicios), crear el usuario `PENDING`, obtener el rol con `GET /roles/{id}`, aprovisionar credenciales con `PUT /internal/credentials/{userId}` enviando `{email, password, roleId, roleName, roleVersion, rolePermissions}` y, solo entonces, marcar `ACTIVE` y escribir `outbox_events(user.created)` en la misma transacción. El payload de `user.created` (`userId`, `email`, `name`, `roleId`, `status`) SHALL NOT contener la contraseña, que solo vive en memoria durante la saga.

#### Scenario: Camino feliz
- **WHEN** el rol existe y auth aprovisiona las credenciales
- **THEN** el usuario queda `ACTIVE` y existe una fila de outbox `user.created` con `aggregateVersion` = versión del usuario y sin contraseña

#### Scenario: Email duplicado local
- **WHEN** el email ya existe en `users`
- **THEN** responde 409 y no se llama a role-service ni a auth-service

### Requirement: Login habilitado por evento
Las credenciales quedan `PENDING` hasta que auth procesa `user.created` (outbox con poll de `OUTBOX_POLL_MS`, 1000 ms por defecto). Durante esa ventana (~1 s) el login SHALL responder el mismo 401 que una contraseña errónea.

#### Scenario: Login inmediato
- **WHEN** el cliente intenta el login justo después de recibir la respuesta del alta
- **THEN** puede recibir 401 y, tras procesarse `user.created`, el login funciona

### Requirement: Presupuesto del alta
Las llamadas a role-service y auth-service del alta SHALL compartir un presupuesto total `SIGNUP_BUDGET_MS` (10 000 ms por defecto); cada llamada recibe el tiempo restante como `budgetMs`. Con presupuesto agotado SHALL NOT intentarse la llamada y SHALL iniciarse la compensación.

#### Scenario: Presupuesto agotado
- **WHEN** el tiempo restante es ≤ 0 antes de una llamada
- **THEN** no se realiza la llamada, se compensa y responde 503

### Requirement: Compensación con orden seguro
Ante cualquier fallo tras crear el `PENDING`, la saga SHALL llamar primero `DELETE /internal/credentials/{userId}` (404 cuenta como éxito) y SHALL borrar el usuario `PENDING` solo si el `DELETE` se confirma. Respuestas: rol inexistente (404 de role-service) → 400 `Role not found`; 409 de auth → 409; otros fallos o compensación fallida → 503. Si el `DELETE` falla, el usuario SHALL permanecer `PENDING` para la reconciliación.

#### Scenario: Rol no responde
- **WHEN** role-service falla o agota su timeout
- **THEN** se ejecuta el `DELETE` de credenciales, después se borra el `PENDING`, y responde 503

#### Scenario: Falla el DELETE de compensación
- **WHEN** `DELETE /internal/credentials/{userId}` falla
- **THEN** el usuario sigue `PENDING` y no se borra

### Requirement: Reconciliación con período de gracia
Un proceso periódico (`RECONCILE_INTERVAL_MS`, 30 000 por defecto) SHALL procesar solo usuarios `PENDING` más antiguos que `RECONCILE_GRACE_MS` (60 000 por defecto), llamar el `DELETE` de credenciales y borrar el usuario solo si se confirma; un fallo individual SHALL NOT abortar el resto. No existe dependencia inversa auth → user.

#### Scenario: Huérfano vencido
- **WHEN** hay un `PENDING` más antiguo que la gracia y el `DELETE` responde 2xx o 404
- **THEN** el usuario se elimina

#### Scenario: Alta en vuelo
- **WHEN** el `PENDING` es más reciente que la gracia
- **THEN** la reconciliación no lo toca
