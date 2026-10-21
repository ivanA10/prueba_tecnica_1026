---
spec: web-session-auth
change: build-frontend-user-console
wave: 0,1
epics: EP-EX3
status: draft
created: 2026-10-20
---

# Spec — web-session-auth

## ADDED Requirements

## Wave 0 — Store, cliente API y sesión

### Requirement: Access token solo en memoria
El token de acceso SHALL vivir únicamente en el slice `session` de Redux. El código de `apps/web/src` SHALL NOT usar `localStorage` ni `sessionStorage`. Las llamadas a `/api/auth/*` SHALL enviar `credentials: 'include'` para la cookie de refresh HttpOnly.

#### Scenario: Sin persistencia en storage
- **WHEN** se busca `localStorage` o `sessionStorage` en `apps/web/src`
- **THEN** no hay coincidencias

### Requirement: Usuario de sesión derivado del JWT
Login y refresh devuelven `{accessToken, expiresIn}` sin objeto `user`. El cliente SHALL decodificar el payload del JWT (sin verificar firma) para obtener `sub` y `roles` y guardarlos en `session.user`, tanto en el login como en el refresh inicial.

#### Scenario: Roles tras refresh
- **WHEN** el refresh inicial devuelve un JWT con `roles: ["admin"]`
- **THEN** `session.user.roles` contiene `admin`

### Requirement: Reautenticación con refresh único
`baseQueryWithReauth` SHALL adjuntar `Authorization: Bearer <token>`; ante un 401 SHALL llamar una sola vez a `POST /api/auth/refresh` aunque haya varias peticiones concurrentes, reintentar la petición original una vez con el nuevo token y, si el refresh falla, despachar `clearSession`.

#### Scenario: 401 recuperable
- **WHEN** una petición devuelve 401 y el refresh responde 200
- **THEN** la petición se reintenta con el token nuevo y el usuario sigue autenticado

#### Scenario: Refresh fallido
- **WHEN** una petición devuelve 401 y el refresh responde 401
- **THEN** la sesión se limpia y no hay más reintentos

## Wave 1 — Login y rutas protegidas

### Requirement: Login con validación y rutas protegidas
La pantalla de login SHALL validar con zod (email válido, contraseña no vacía) antes de enviar `POST /api/auth/login`, mostrar carga durante la petición, el mensaje del backend ante 401/429 y, en éxito, guardar la sesión y navegar a la consola. `RequireAuth` SHALL redirigir a `/login` si no hay sesión; mientras `session.status` sea `unknown` (refresh inicial en curso) SHALL mostrar `Spinner` sin redirigir. Logout SHALL llamar `POST /api/auth/logout` y limpiar la sesión.

#### Scenario: Validación sin red
- **WHEN** se envía el formulario con email inválido
- **THEN** se muestra el error de validación y no se llama a `fetch`

#### Scenario: Login correcto
- **WHEN** las credenciales son válidas y el backend responde 200
- **THEN** se guarda la sesión y se navega a `/users`

#### Scenario: Ruta protegida sin sesión
- **WHEN** un usuario anónimo abre `/users`
- **THEN** es redirigido a `/login`
