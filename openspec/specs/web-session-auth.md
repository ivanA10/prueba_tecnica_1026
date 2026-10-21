---
spec: web-session-auth
change: build-frontend-user-console
wave: 0,1
epics: EP-EX3
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — web-session-auth

> Spec canónica promovida desde el cambio archivado `build-frontend-user-console`. Describe el comportamiento as-built, con visibilidad por permisos.

## Requirements

### Requirement: Access token solo en memoria
El token de acceso SHALL vivir únicamente en el slice `session` de Redux (`status` `unknown|authenticated|anonymous`). `apps/web/src` SHALL NOT usar `localStorage` ni `sessionStorage`. Las peticiones SHALL enviar `credentials: 'include'` para la cookie de refresh HttpOnly.

#### Scenario: Sin persistencia en storage
- **WHEN** se busca `localStorage` o `sessionStorage` en `apps/web/src`
- **THEN** no hay coincidencias

### Requirement: Usuario de sesión derivado del JWT
Login y refresh devuelven `{accessToken, expiresIn}`. El cliente SHALL decodificar el payload del JWT (sin verificar firma) y guardar `session.user = {id: sub, roles, permissions}`, tanto en el login como en el refresh inicial que lanza `App` al cargar.

#### Scenario: Permisos tras refresh
- **WHEN** el refresh inicial devuelve un JWT con `permissions: ["audit:read"]`
- **THEN** `session.user.permissions` contiene `audit:read`

#### Scenario: Sin sesión previa
- **WHEN** el refresh inicial responde 401
- **THEN** `session.status` pasa a `anonymous`

### Requirement: Reautenticación con refresh único
La `baseQuery` SHALL adjuntar `Authorization: Bearer <token>`; ante un 401 en una ruta que no sea `/auth/*` SHALL llamar una sola vez a `POST /api/auth/refresh` aunque haya peticiones concurrentes, reintentar la original una vez y, si el refresh falla, despachar `clearSession`.

#### Scenario: 401 recuperable
- **WHEN** una petición devuelve 401 y el refresh responde 200
- **THEN** la petición se reintenta con el token nuevo y el usuario sigue autenticado

#### Scenario: Refresh fallido
- **WHEN** una petición devuelve 401 y el refresh responde 401
- **THEN** la sesión se limpia y no hay más reintentos

### Requirement: Login, rutas protegidas y navegación por permisos
El login SHALL validar con zod (email válido, contraseña no vacía) antes de enviar `POST /api/auth/login`, mostrar carga, mostrar `ErrorMessage` ante un error (p. ej. 401 o el 429 del gateway) y, en éxito, guardar la sesión y navegar a `/`. `RequireAuth` SHALL mostrar `Spinner` mientras `status` sea `unknown` y redirigir a `/login` si es `anonymous`. La navegación SHALL mostrar cada sección solo si `useCan(permiso)` es verdadero. Salir SHALL llamar `POST /api/auth/logout` y limpiar la sesión.

#### Scenario: Validación sin red
- **WHEN** se envía el formulario con email inválido
- **THEN** se muestra el error de validación y no se llama a `fetch`

#### Scenario: Ruta protegida sin sesión
- **WHEN** un usuario anónimo abre `/users`
- **THEN** es redirigido a `/login`

#### Scenario: Navegación filtrada
- **WHEN** inicia sesión un usuario sin `users:read`
- **THEN** el enlace Usuarios no aparece en la navegación
