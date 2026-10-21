---
spec: web-users-roles
change: build-frontend-user-console
wave: 1
epics: EP-EX3
status: draft
created: 2026-10-20
---

# Spec — web-users-roles

## ADDED Requirements

### Requirement: Gestión de usuarios con rol
La pantalla de usuarios SHALL listar `GET /api/users` con paginación (`{items, page, limit, total}`; cada item trae `roleId`, cuyo nombre se resuelve con la lista de roles y, si el usuario no es admin y `GET /roles` da 403, se muestra el `roleId`), mostrar `Spinner` al cargar y `ErrorMessage` ante fallo. Para administradores SHALL permitir crear (`POST`, validado con zod: nombre, email, contraseña ≥8 y `roleId` obligatorio), editar (`PATCH`), borrar (`DELETE`, tras `ConfirmDialog`) y asignar rol (`PUT /api/users/{id}/role`). Cada mutación exitosa SHALL notificar éxito e invalidar la lista; un usuario nuevo se muestra con estado `PENDING`.

#### Scenario: Lista con carga
- **WHEN** se abre `/users` y la petición está en curso
- **THEN** se muestra `Spinner` y luego las filas devueltas

#### Scenario: Alta inválida
- **WHEN** se envía el alta con email inválido
- **THEN** se muestran errores de validación y no se llama a `POST`

#### Scenario: Alta correcta
- **WHEN** el backend responde 201
- **THEN** se muestra un aviso de éxito y la lista se recarga

#### Scenario: Borrado confirmado
- **WHEN** el administrador confirma el borrado
- **THEN** se llama `DELETE /api/users/{id}` y el usuario desaparece de la lista tras recargar

#### Scenario: Asignación de rol
- **WHEN** el administrador elige un rol para un usuario
- **THEN** se llama `PUT /api/users/{id}/role` con `{roleId}` y se notifica el éxito

### Requirement: Listado de roles
La pantalla de roles SHALL listar `GET /api/roles` (nombre, permisos, versión) con estados de carga y error. Las acciones de escritura de usuarios SHALL ocultarse a quien no tenga el rol `admin`.

#### Scenario: Roles listados
- **WHEN** el backend devuelve dos roles
- **THEN** se muestran ambos con sus permisos

#### Scenario: Error de roles
- **WHEN** la petición falla con 500
- **THEN** se muestra `ErrorMessage`

#### Scenario: Usuario no admin
- **WHEN** `GET /api/roles` responde 403
- **THEN** la pantalla de roles muestra el mensaje del 403 vía `ErrorMessage`
