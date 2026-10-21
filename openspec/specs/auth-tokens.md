---
spec: auth-tokens
change: build-auth-role-services
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — auth-tokens (`apps/auth-service`: login, JWT, JWKS, refresh, logout, `/oauth/token`)

> Spec canónica promovida desde el cambio archivado `build-auth-role-services`. Describe el comportamiento as-built, incluido el claim `permissions`. Implementa ADR-003; la validación en los consumidores es `jwt-guard`.

## Requirements

### Requirement: Login con argon2id y respuesta uniforme
`POST /auth/login` (`{email, password}`) SHALL normalizar el email a minúsculas, verificar la contraseña con argon2id (`@node-rs/argon2`) y exigir `status=ACTIVE`. Usuario inexistente (verificado contra un hash ficticio), contraseña errónea, `PENDING` y `DISABLED` SHALL producir el mismo 401 `invalid_credentials`. Cada intento SHALL publicar `auth.login.succeeded` (actor = el usuario) o `auth.login.failed` (actor `system`, motivo real solo en el payload). La contraseña SHALL NOT persistirse ni registrarse.

#### Scenario: Login correcto
- **WHEN** un usuario `ACTIVE` envía credenciales válidas
- **THEN** responde 200 con `{accessToken, expiresIn}` y una cookie `refresh_token` `HttpOnly; SameSite=Strict; Path=/api/auth` (`Secure` salvo `COOKIE_SECURE=false`), y publica `auth.login.succeeded`

#### Scenario: Credencial no utilizable
- **WHEN** la contraseña es errónea o el usuario está `PENDING`
- **THEN** responde el mismo 401 en ambos casos y publica `auth.login.failed`

#### Scenario: Recién dado de alta
- **WHEN** se intenta el login durante la ventana (~1 s) entre el alta y el procesamiento de `user.created`
- **THEN** responde el mismo 401, porque la credencial sigue `PENDING`

### Requirement: Emisión de JWT RS256 con permisos
El access token SHALL firmarse con RS256 (`node:crypto`), cabecera `{alg: 'RS256', typ: 'JWT', kid: JWT_KID}` y claims `sub`, `roles[]`, `permissions[]`, `jti` (UUID), `iat`, `exp` (`ACCESS_TOKEN_TTL_SECONDS`, 900 por defecto), `iss` (`JWT_ISSUER`) y `aud='toka-api'`. `roles` y `permissions` SHALL resolverse de `user_roles_projection` + `role_names_projection`; sin proyección resoluble SHALL emitirse `roles: []` y `permissions: []`.

#### Scenario: Claims y cabecera
- **WHEN** se emite un token de usuario cuyo rol tiene permisos `['users:read']`
- **THEN** la cabecera trae `kid` y los claims incluyen `roles`, `permissions: ['users:read']`, `jti`, `iss` y `aud='toka-api'`

### Requirement: JWKS de una sola clave
`GET /.well-known/jwks.json` SHALL devolver solo la clave pública derivada de la privada (`kty`, `n`, `e`, `alg=RS256`, `use=sig`, `kid`). La clave privada se lee de `JWT_PRIVATE_KEY_PATH` (secreto `jwt_private.pem` montado por compose) y SHALL NOT aparecer en respuestas ni logs. La rotación de claves es Evolución.

#### Scenario: JWKS coherente
- **WHEN** se consulta el JWKS
- **THEN** contiene el mismo `kid` que los tokens emitidos y ningún componente privado

### Requirement: Refresh rotatorio por familia
`POST /auth/refresh` SHALL aceptar solo la cookie `refresh_token` (único camino de refresco). En BD SHALL guardarse solo el hash SHA-256. Cada uso válido SHALL marcar el token como rotado y emitir uno nuevo de la misma familia; reutilizar un token rotado SHALL revocar la familia y responder 401. Un refresh de un usuario que no esté `ACTIVE`, caducado o revocado SHALL responder 401.

#### Scenario: Reutilización
- **WHEN** se presenta de nuevo un refresh ya rotado
- **THEN** responde 401 y la familia queda revocada

### Requirement: Logout y revocación
`POST /auth/logout` (Bearer válido) SHALL escribir `auth:deny:jti:{jti}` con TTL igual a la vida restante del token, revocar la familia del refresh de la cookie (o todos los refresh del usuario si no hay cookie válida) y borrar la cookie. `revokeUserSessions(userId)` SHALL escribir `auth:deny:user:{userId}` con epoch en segundos y `EX=ACCESS_TOKEN_TTL_SECONDS`, y revocar todos los refresh del usuario. Auth SHALL ser el único escritor de `auth:deny:*`.

#### Scenario: Logout
- **WHEN** un usuario autenticado hace logout
- **THEN** existe `auth:deny:jti:{jti}` con TTL ≤ vida restante del token y su familia de refresh está revocada

### Requirement: Tokens de servicio (`client_credentials`)
`POST /oauth/token` SHALL aceptar solo `grant_type=client_credentials` (otro valor → 400), validar `client_id`/`client_secret` contra `SERVICE_CLIENTS` (más `SVC_CLIENT_ID`/`SVC_CLIENT_SECRET` si están definidos) comparando hashes en tiempo constante, y emitir un JWT con `sub=client_id`, `roles=['service']`, `aud` = el `audience` pedido y vida `SERVICE_TOKEN_TTL_SECONDS` (300 por defecto). Credenciales inválidas SHALL responder 401. El gateway no enruta `/oauth/*`.

#### Scenario: Token de servicio válido
- **WHEN** un cliente conocido pide un token con `audience=role-service`
- **THEN** recibe `{access_token, token_type: 'Bearer', expires_in}` con un JWT `aud=role-service` y `roles=['service']`

### Requirement: Publicación directa con respaldo
Los eventos `auth.login.*` SHALL publicarse con reintento en memoria (`PUBLISH_RETRIES`, 3 por defecto). Al agotarse SHALL registrarse el sobre completo con `event="audit.fallback"` y el login SHALL NOT fallar.

#### Scenario: Broker caído
- **WHEN** la publicación falla en todos los reintentos
- **THEN** el login responde igualmente y el log contiene el sobre con `event=audit.fallback`
