---
spec: jwt-guard
change: bootstrap-monorepo-platform
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — jwt-guard (`@toka/jwt-guard`)

Implementa el comportamiento de `docs/adrs/ADR-003-auth-jwt-rs256-jwks-rbac.md`. La integración con el JWKS real de `auth-service` y el guard de roles (`@Roles`) pertenecen a `build-auth-role-services`.

## ADDED Requirements

### Requirement: Validación local de JWT
`JwtAuthGuard` SHALL aceptar solo `Bearer` tokens con `alg=RS256`, cabecera `kid` presente, firma válida contra el JWKS (caché en memoria), `iss` y `exp` válidos, y `aud` incluido en el `audience` configurado por servicio (`string | string[]`). SHALL NOT consultar a `auth-service` por petición. En éxito SHALL exponer `request.user` con `sub`, `roles`, `jti`, `iat`, `exp` y `aud`. Cualquier fallo SHALL producir `UnauthorizedException`.

#### Scenario: Token válido
- **WHEN** llega un token RS256 con `kid`, `aud` correcto y vigente
- **THEN** el guard permite la petición y `request.user.sub` coincide con el claim

#### Scenario: Audiencia o kid inválidos
- **WHEN** el `aud` no corresponde al servicio, o la cabecera no trae `kid`/usa otro algoritmo
- **THEN** el guard rechaza con 401

### Requirement: Denylist por jti y por usuario
El guard SHALL leer, en solo lectura y mediante un `DenylistReader`, `auth:deny:jti:{jti}` (rechazo si la clave existe) y `auth:deny:user:{sub}` (valor = epoch en segundos; rechazo si `iat` < valor). `RedisDenylistReader` SHALL implementar el puerto sobre un cliente tipo ioredis. El guard SHALL NOT escribir en Redis.

#### Scenario: jti revocado
- **WHEN** existe `auth:deny:jti:{jti}` del token presentado
- **THEN** el guard rechaza con 401

#### Scenario: Usuario revocado después de emitir el token
- **WHEN** `auth:deny:user:{sub}` contiene un instante posterior al `iat` del token
- **THEN** el guard rechaza con 401

### Requirement: Fail-open acotado en el denylist
Si la consulta al denylist lanza un error o supera `denylistTimeoutMs` (por defecto 200 ms), el guard SHALL continuar con la petición, emitir `logger.warn` con `event=denylist.unavailable` e invocar el hook de métrica `metrics.increment('jwt_guard_denylist_unavailable')` si existe. La firma, `aud` y `exp` SHALL validarse siempre, incluso con Redis caído.

#### Scenario: Redis no responde
- **WHEN** el lector del denylist no resuelve dentro del timeout
- **THEN** un token válido pasa, se registra el `warn` y se incrementa la métrica
- **AND** un token con firma o `exp` inválidos sigue siendo rechazado
