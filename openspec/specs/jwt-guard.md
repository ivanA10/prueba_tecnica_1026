---
spec: jwt-guard
change: bootstrap-monorepo-platform
wave: 1
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — jwt-guard (`@toka/jwt-guard`)

> Spec canónica promovida desde el cambio archivado `bootstrap-monorepo-platform`. Describe el comportamiento as-built, incluida la autorización por permisos añadida después. Implementa ADR-003.

## Requirements

### Requirement: Validación local de JWT
`JwtAuthGuard` SHALL aceptar solo `Authorization: Bearer <token>` con cabecera `alg=RS256` y `kid` presente, firma válida, `iss` igual a `issuer`, `aud` incluido en `audience` (`string | string[]`) y `exp` vigente, y SHALL exigir los claims `sub`, `jti`, `iat`, `exp` y `aud`. La clave SHALL resolverse con `keyResolver` si se inyecta, o con `createRemoteJWKSet(jwksUri)` de `jose` 5. SHALL NOT consultar a auth-service por petición. En éxito SHALL exponer `request.user` = `{sub, roles, permissions, jti, iat, exp, aud}` (`roles` y `permissions` vacíos si el claim falta). Cualquier fallo SHALL responder 401.

#### Scenario: Token válido
- **WHEN** llega un token RS256 con `kid`, `aud` correcto y vigente
- **THEN** el guard permite la petición y `request.user.sub` coincide con el claim

#### Scenario: Cabecera o audiencia inválidas
- **WHEN** el token no trae `kid`, usa otro algoritmo, su `aud` no corresponde o falta el `Bearer`
- **THEN** el guard responde 401

### Requirement: Tolerancia a fallos del JWKS
El guard SHALL guardar en memoria la última clave resuelta por `kid` y, si una resolución posterior falla, SHALL verificar con esa clave y registrar `warn` con `event=jwks.refresh_failed`.

#### Scenario: auth-service no responde al JWKS
- **WHEN** falla el refresco del JWKS y el token usa un `kid` ya conocido
- **THEN** el token se verifica con la clave cacheada

### Requirement: Denylist por jti y por usuario
El guard SHALL consultar en solo lectura, mediante `DenylistReader`, `auth:deny:jti:{jti}` (rechazo si existe) y `auth:deny:user:{sub}` (epoch en segundos; rechazo si `iat` < valor). `RedisDenylistReader` SHALL implementar el puerto sobre un cliente tipo ioredis.

#### Scenario: Usuario revocado después de emitir el token
- **WHEN** `auth:deny:user:{sub}` contiene un instante posterior al `iat` del token
- **THEN** el guard responde 401, y un token emitido después de ese instante se acepta

### Requirement: Fail-open acotado en el denylist
Si la consulta al denylist falla o supera `denylistTimeoutMs` (200 ms por defecto), el guard SHALL continuar, registrar `warn` con `event=denylist.unavailable` e invocar `metrics.increment('jwt_guard_denylist_unavailable')` si hay métricas. Firma, `aud` y `exp` SHALL validarse siempre.

#### Scenario: Redis no responde
- **WHEN** el lector del denylist no resuelve dentro del timeout
- **THEN** un token válido pasa con `warn` y métrica, y un token con firma o `exp` inválidos sigue siendo rechazado

### Requirement: Autorización por permisos
El paquete SHALL exportar `PermissionsGuard`, `@RequirePermissions(...perms)` y `@AllowServiceToken()`. `PermissionsGuard` SHALL ejecutarse después de `JwtAuthGuard`; sin metadatos SHALL permitir; con permisos requeridos SHALL exigir cada uno en `request.user.permissions` (el comodín `*` concede todos) y responder 403 `Permiso requerido: <perm>` si falta. Un token con rol `service` SHALL pasar solo en rutas marcadas con `@AllowServiceToken()`. El paquete SHALL NOT importar otros `@toka/*` (copia local de `hasPermission`).

#### Scenario: Permiso ausente
- **WHEN** un token sin `users:write` llama una ruta con `@RequirePermissions('users:write')`
- **THEN** responde 403

#### Scenario: Token de servicio
- **WHEN** un token con `roles=['service']` llama una ruta con `@AllowServiceToken()`
- **THEN** pasa sin permisos de usuario; en una ruta sin esa marca responde 403
