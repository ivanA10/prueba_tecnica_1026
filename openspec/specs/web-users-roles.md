---
spec: web-users-roles
change: build-frontend-user-console
wave: 1
epics: EP-EX3
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — web-users-roles

> Spec canónica promovida desde el cambio archivado `build-frontend-user-console`. Describe el comportamiento as-built: gestión de usuarios, gestión de roles por permisos y matriz de permisos.

## Requirements

### Requirement: Gestión de usuarios
La pantalla de usuarios SHALL listar `GET /api/users` con paginación y filtro local por nombre o email sobre la página actual, mostrando el nombre del rol (o el `roleId` si `GET /roles` responde 403) y el estado (incluido `PENDING`), con `Spinner` y `ErrorMessage`. Con `users:write` SHALL permitir crear (`POST`, validado con zod: nombre, email, contraseña ≥8, `roleId` obligatorio), editar (`PATCH`, y `PUT /api/users/{id}/role` si cambia el rol), cambiar el rol en línea y borrar (`DELETE` tras `ConfirmDialog`); sin ese permiso las acciones de escritura no se muestran. Cada mutación exitosa SHALL notificar éxito e invalidar la lista.

#### Scenario: Alta inválida
- **WHEN** se envía el alta con email inválido
- **THEN** se muestran errores de validación y no se llama a `POST`

#### Scenario: Borrado confirmado
- **WHEN** el usuario con `users:write` confirma el borrado
- **THEN** se llama `DELETE /api/users/{id}` y la fila desaparece tras recargar

#### Scenario: Solo lectura
- **WHEN** un usuario con `users:read` pero sin `users:write` abre `/users`
- **THEN** ve la tabla sin el botón Nuevo usuario ni acciones de edición

### Requirement: Gestión de roles
La pantalla de roles SHALL listar `GET /api/roles` (nombre, permisos, versión) con carga y error (el 403 muestra el mensaje del backend). Con `roles:write` SHALL permitir crear (`POST`) y editar (`PUT /api/roles/{id}` con la `version` leída) eligiendo permisos con casillas del catálogo `PERMISSIONS`; la opción "Todos los permisos (*)" SHALL enviar `['*']` y deshabilitar las demás. Un 409 SHALL mostrarse como error. La UI SHALL NOT ofrecer borrar roles.

#### Scenario: Comodín
- **WHEN** se marca "Todos los permisos (*)"
- **THEN** las demás casillas quedan deshabilitadas y el rol se envía con `permissions: ['*']`

#### Scenario: Conflicto de versión
- **WHEN** el backend responde 409 al editar
- **THEN** se muestra el mensaje de error del backend

### Requirement: Matriz de permisos
La página Permisos (`/permissions`, visible con `roles:read`) SHALL mostrar una matriz de roles × permisos con las etiquetas de `PERMISSION_LABELS`.

#### Scenario: Rol nuevo en la matriz
- **WHEN** se crea un rol y se abre `/permissions`
- **THEN** la matriz incluye una columna para ese rol
