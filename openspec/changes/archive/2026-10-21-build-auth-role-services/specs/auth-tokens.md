---
spec: auth-tokens
change: build-auth-role-services
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — auth-tokens (`apps/auth-service`: login, JWT, JWKS, refresh, logout, `/oauth/token`)

Implementa `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md`. Validación en consumidores: `@toka/jwt-guard` (cambio 2).

## ADDED Requirements

### Requirement: Login con argon2id y respuesta uniforme
`POST /auth/login` SHALL verificar la contraseña con argon2id contra `credentials` y exigir `status=ACTIVE`. Usuario inexistente, contraseña errónea, `PENDING` y `DISABLED` SHALL producir la misma respuesta 401 (`invalid_credentials`); para usuario inexistente SHALL verificarse contra un hash ficticio. El servicio SHALL NOT persistir ni loguear la contraseña. Cada resultado SHALL publicar `auth.login.succeeded` o `auth.login.failed` en `toka.events`.

#### Scenario: Login correcto
- **WHEN** un usuario `ACTIVE` envía credenciales válidas
- **THEN** responde 200 con `accessToken` y una cookie `refresh_token` `HttpOnly; SameSite=Strict; Path=/api/auth` (`Secure` según `COOKIE_SECURE`)
- **AND** publica `auth.login.succeeded` con el `correlationId` de la petición

#### Scenario: Credencial no utilizable
- **WHEN** la contraseña es errónea, el usuario no existe o su estado es `PENDING`/`DISABLED`
- **THEN** responde 401 idéntico en cuerpo para todas las causas
- **AND** publica `auth.login.failed` con el motivo real solo en el payload y en el log

### Requirement: Emisión de JWT RS256 con kid, aud e iss
El access token SHALL firmarse con RS256, cabecera `kid` = `JWT_KID`, y claims `sub`, `roles[]`, `jti` (único), `iat`, `exp` (`ACCESS_TOKEN_TTL_SECONDS`), `iss` (`JWT_ISSUER`) y `aud='toka-api'`. `roles` SHALL resolverse por join de `user_roles_projection` con `role_names_projection`; si no hay nombre resoluble SHALL emitirse `roles: []` y registrarse `warn` con `event=role.unresolved`.

#### Scenario: Claims y cabecera
- **WHEN** se emite un token de usuario
- **THEN** su cabecera es `alg=RS256` con `kid` y sus claims incluyen `sub`, `roles`, `jti`, `iat`, `exp`, `iss`, `aud`

### Requirement: JWKS de una sola clave
`GET /.well-known/jwks.json` SHALL devolver únicamente la clave pública activa (`kty`, `n`, `e`, `alg=RS256`, `use=sig`, `kid`). La clave privada se carga desde `JWT_PRIVATE_KEY_FILE` y SHALL NOT aparecer en respuestas ni logs. La rotación de claves queda fuera de alcance.

#### Scenario: JWKS coherente con los tokens
- **WHEN** se consulta el JWKS
- **THEN** contiene el mismo `kid` que usan los tokens emitidos y no contiene componentes privados (`d`, `p`, `q`)

### Requirement: Refresh rotatorio por familia
`POST /auth/refresh` SHALL aceptar solo la cookie `refresh_token` (único camino de refresco). El refresh es opaco; en BD SHALL guardarse solo su hash SHA-256. Cada uso válido SHALL marcar el token como rotado y emitir uno nuevo de la misma `family_id`. Reutilizar un token ya rotado SHALL revocar toda la familia y responder 401. SHALL rechazarse el refresh de un usuario que no esté `ACTIVE`.

#### Scenario: Rotación
- **WHEN** se presenta un refresh válido
- **THEN** responde 200 con nuevo access y nueva cookie; el refresh anterior queda rotado

#### Scenario: Reutilización
- **WHEN** se presenta de nuevo un refresh ya rotado
- **THEN** responde 401 y todos los refresh de esa familia quedan revocados

### Requirement: Logout y revocación
`POST /auth/logout` (Bearer válido) SHALL escribir `auth:deny:jti:{jti}` con TTL igual a la vida restante del access token, revocar la familia del refresh de la cookie (si existe) y borrar la cookie. `RevokeUserSessions(userId)` SHALL escribir `auth:deny:user:{userId}` con la marca en **epoch segundos** y `EX=ACCESS_TOKEN_TTL_SECONDS`, y revocar todos los refresh del usuario. Auth SHALL ser la única escritora de `auth:deny:*`.

#### Scenario: Logout
- **WHEN** un usuario autenticado hace logout
- **THEN** `auth:deny:jti:{jti}` existe con TTL ≤ vida restante del token y su familia de refresh queda revocada

### Requirement: Tokens de servicio (`client_credentials`)
`POST /oauth/token` SHALL aceptar `grant_type=client_credentials`, `client_id`, `client_secret` y `audience`, validar contra `SERVICE_CLIENTS` en tiempo constante y emitir un JWT con `sub=client_id`, `roles=['service']`, `scope='svc:internal'`, `aud` = el pedido y vida `SERVICE_TOKEN_TTL_SECONDS`. El endpoint SHALL existir solo en la red interna (el gateway no lo enruta). Un `client_id` desconocido o secreto incorrecto SHALL responder 401.

#### Scenario: Token de servicio válido
- **WHEN** un cliente conocido pide un token con `audience=role-service`
- **THEN** recibe un JWT RS256 con `aud=role-service` y `roles=['service']`

### Requirement: Publicación directa con respaldo
Los eventos `auth.login.*` SHALL publicarse con reintento en memoria (`PUBLISH_RETRIES`, backoff corto). Al agotarse SHALL registrarse el sobre completo en un log estructurado con `event="audit.fallback"` y la petición de login SHALL NOT fallar.

#### Scenario: Broker caído
- **WHEN** la publicación falla en todos los reintentos
- **THEN** el login responde igualmente y el log contiene el sobre completo con `event=audit.fallback`
