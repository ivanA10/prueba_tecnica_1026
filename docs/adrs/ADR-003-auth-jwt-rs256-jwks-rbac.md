---
id: ADR-003
title: Autenticación JWT RS256 con JWKS, RBAC por rol y refresh en cookie HttpOnly
status: accepted
date: 2026-10-20
amended: 2026-10-21 (Evolución: autorización por permisos)
tier: 0
tags: [adr, tier-0]
---

# ADR-003 — Autenticación JWT RS256 con JWKS, RBAC por rol y refresh en cookie HttpOnly

## Context

El Ejercicio 2 del PDF pide: "Autenticación: Implementar autenticación OAuth2/OIDC distribuida entre microservicios (puede usar JWT con validación distribuida)". Los cinco servicios deben poder validar identidad sin llamar a un servidor central en cada petición, hay que poder revocar sesiones y el agente de IA debe actuar en nombre del usuario que pregunta.

El alcance temporal (Ex2 = 120 min) hace inviable desplegar y operar un proveedor OIDC completo, pero el diseño no debe impedir migrar a uno.

## Decision

### Emisión y validación

**auth-service emite JWT firmados con RS256** y publica su clave pública en `GET /.well-known/jwks.json`. Cada servicio valida los tokens **localmente** con `jwt-guard` (firma, `iss`, `aud`, `exp`), cacheando el JWKS (`<svc>:jwks`). Esta es la lectura que hacemos de la cláusula del PDF "puede usar JWT con validación distribuida": ningún servicio consulta a auth-service por petición.

- **Cabecera**: `alg=RS256` y `kid` (identificador de la clave activa).
- **Claims**: `sub`, `roles[]` (un solo rol por usuario en este alcance; array por compatibilidad futura), `jti`, `iat`, `exp`, `iss` y `aud`. `aud` es `toka-api` para tokens de usuario y el nombre del servicio destino para tokens de servicio; `jwt-guard` rechaza tokens cuyo `aud` no corresponda al servicio.
- **Vida del access token**: corta y configurable (≤5–15 min).
- **Generación de clave**: el par RSA se genera al arrancar el entorno (script de bootstrap, secreto montado, nunca en git). Hay **una sola clave activa identificada por `kid`** en el JWKS; la rotación con clave actual + previa en el JWKS es **Evolución**.

### Tokens de servicio (`client_credentials`)

Cada servicio tiene `client_id`/`client_secret` en `.env` y obtiene tokens de servicio con `POST /oauth/token` (`grant_type=client_credentials`), con caché hasta `exp` y `aud` igual al servicio destino. **Este endpoint solo existe en la red interna** (nginx no enruta `/oauth/*`). El discovery OIDC (`/.well-known/openid-configuration`) es **Evolución**.

### Contraseñas

**argon2id es el único algoritmo de hash y solo auth-service hashea**: ningún otro servicio ve, persiste ni loguea la contraseña salvo el canal interno `PUT /internal/credentials/{userId}` (ADR-002).

### Origen del rol

El claim de rol se construye con dos tablas de `auth_db`:

- `user_roles_projection(user_id, role_id, user_last_version, updated_at)`: asignación de rol por usuario. Se siembra con el rol inicial en `PUT /internal/credentials` y se mantiene con `user.role.assigned` y `user.updated`, ignorando eventos con `aggregateVersion` menor o igual que `user_last_version`.
- `role_names_projection(role_id, role_name, last_version)`: nombre vigente de cada rol. Lo actualiza `role.updated` solo si su `aggregateVersion` es mayor que `last_version`; `user.role.assigned` puede sembrar la fila si falta, con la versión del rol que viaja en su payload.

El nombre del rol se resuelve por join al emitir el token. Cada agregado (`User`, `Role`) tiene su propia secuencia de versiones y nunca se compara una contra la otra. Como no se reinicia ninguna versión al reasignar el rol, un `role.updated` viejo retrasado en una cola de reintento no puede sobrescribir un nombre más reciente. Evolución complementaria: usar un `code` de rol inmutable en el claim en lugar del nombre editable.

### Autorización: RBAC por rol

La autorización se decide por el **rol del claim**. Los permisos de role-service son la fuente de verdad para consulta y UI y son informativos en este alcance; en este alcance no se consulta role-service por petición. La evolución es incluir un claim `permissions[]` en el token.

### Revocación: denylist

Hay dos claves en Redis, ambas escritas solo por auth-service y leídas por todos los servicios vía `jwt-guard` en solo lectura:

- **`auth:deny:jti:{jti}`**: revocación de un token concreto (logout, reutilización de refresh), con TTL igual a la vida restante del access token.
- **`auth:deny:user:{userId}`** = marca de tiempo de revocación: al consumir `user.updated(DISABLED)` o el borrado de un usuario, auth-service la escribe con TTL igual a la **vida máxima del access token**. `jwt-guard` rechaza todo token del usuario cuyo `iat` sea anterior a esa marca. Así la deshabilitación es efectiva tras la propagación del evento (normalmente segundos; más si el broker está caído o el evento en reintento/DLQ, y anulada mientras Redis esté caído por el fail-open) sin que auth tenga que registrar los `jti` emitidos.

`auth:deny:jti:*` y `auth:deny:user:*` son la única excepción de lectura cruzada declarada en ADR-002 (Redis: auth escribe, el resto solo lee). La política ante Redis caído es la misma para ambas claves (siguiente sección).

### Política de `jwt-guard` si Redis no responde

**Fail-open solo en el denylist (`auth:deny:jti:*` y `auth:deny:user:*`)**: la consulta tiene un timeout corto; si Redis no responde, la petición continúa, con **log `warn` y métrica**. La **firma, `aud` y `exp` siguen validándose siempre**. El riesgo queda acotado por la vida corta del access token (≤5–15 min): como máximo un token ya revocado se acepta durante esa ventana. **Se descartó fallar cerrado** porque una caída de Redis tumbaría los cinco servicios y contradice el objetivo de validación local.

### Refresh token

Refresh opaco con **rotación** por `family_id` (reutilización de un refresh ya rotado revoca la familia). Se entrega en cookie `HttpOnly; SameSite=Strict; Path=/api/auth`, con `Secure` configurable por variable de entorno (activo por defecto; desactivable para desarrollo en HTTP; el README indica acceder por `localhost`). **El único camino de refresco es `POST /auth/refresh`**. El access token vive solo en memoria del cliente (ADR-010).

## Consequences

### Positivas

- Validación sin salto de red: baja latencia y sin punto único de fallo en auth para peticiones ya autenticadas.
- La clave privada solo la conoce auth-service; los demás solo tienen la pública vía JWKS.
- `aud` evita que un token emitido para un destino sea aceptado en otro (confused deputy entre servicios).
- Cookie `HttpOnly` mitiga el robo de refresh por XSS; la rotación por familia detecta reutilización.
- Revocación efectiva sin renunciar a la validación local.

### Negativas y riesgos

- Revocación no inmediata ante caída de Redis (fail-open): ventana de hasta la vida del access token. Riesgo aceptado y documentado.
- Con una sola clave y `kid`, comprometer o rotar la clave obliga a reiniciar el emisor e invalida los tokens vigentes; la rotación sin cortes (JWKS actual + previa) es Evolución.
- Los roles en el claim pueden quedar desfasados hasta que expire el access token o llegue el evento de proyección (consistencia eventual).
- RBAC por rol sin `permissions[]` es menos granular; los permisos de role-service no se aplican por petición.
- Implementar emisión propia significa asumir la seguridad del emisor (gestión de secretos, `client_secret` en `.env`); no hay federación ni SSO.
- `Secure` desactivable en desarrollo puede dejarse desactivado por error en entornos reales; se mitiga con activo por defecto.

## Alternatives considered

### Alternativa 1 — Keycloak / OIDC completo

Proveedor de identidad estándar con federación, rotación y discovery. Por qué se descartó: añade un componente pesado (JVM, su propia base de datos, realm y clientes por configurar) que excede el presupuesto de tiempo del Ejercicio 2 y el `docker compose` ligero buscado; además oculta la lógica de auth que la prueba pide demostrar. Queda como camino de evolución: el JWKS y `aud` ya siguen el estándar.

### Alternativa 2 — Sesiones opacas con introspección

Cada servicio consulta a auth-service (o a un almacén de sesiones) por petición. Por qué se descartó: contradice la "validación distribuida" del PDF, convierte a auth en punto único de fallo y de latencia para todo el tráfico.

### Alternativa 3 — Revocación solo por vida corta (sin denylist)

Más simple, sin estado en Redis. Por qué se descartó: el logout y la deshabilitación de un usuario (`auth:deny:user:{userId}`) no tendrían efecto inmediato, lo que es inaceptable para una consola de gestión de usuarios y roles.

### Alternativa 4 — Fallar cerrado ante Redis caído

Rechazar toda petición si no se puede consultar el denylist. Por qué se descartó: una caída de Redis tumbaría los cinco servicios y rompería la validación local; se prefiere fail-open acotado por el token de vida corta, con log y métrica.

## Implementación

- **Implementado en `build-auth-role-services`**: emisión RS256 con `kid` y `aud`, JWKS con una sola clave, `/oauth/token` (`client_credentials`) solo interno, argon2id, `user_roles_projection` y `role_names_projection` (versión por agregado), denylist por `jti` y por usuario, refresh con rotación en cookie HttpOnly y `POST /auth/refresh`, política de `jwt-guard` (fail-open solo en el denylist con log `warn` y métrica).
- **Implementado en `bootstrap-monorepo-platform`**: script de generación de la clave RSA y montaje del secreto.
- **Evolución** (no implementado, riesgo aceptado): rotación de claves con JWKS actual + previa; discovery `/.well-known/openid-configuration`; claim `permissions[]`; migración a un proveedor OIDC completo como Keycloak.

## Evolución: autorización por permisos

**Fecha**: 2026-10-21. **Estado**: Accepted (enmienda a esta ADR). El texto original se conserva arriba; esta sección prevalece sobre "Autorización: RBAC por rol" y sobre el punto `permissions[]` de la lista de Evolución de "Implementación", que queda implementado.

### Motivación

- Con RBAC por nombre de rol, los permisos definidos en role-service eran informativos: editar los permisos de un rol no cambiaba lo que sus usuarios podían hacer, y un rol nuevo creado desde la UI no tenía efecto en la autorización.
- Los nombres de rol son editables; acoplar la autorización a ellos hacía frágil cada comprobación.
- La UI necesitaba saber qué acciones mostrar sin replicar la tabla rol → capacidades.

### Decisión

- **Catálogo de permisos** en `packages/contracts/src/permissions.ts`: `users:read`, `users:write`, `roles:read`, `roles:write`, `audit:read`, `agent:ask`, `agent:ingest`, más el comodín `*` (todos los permisos). Roles sembrados: `admin` (`*`), `operador` (`users:read`, `roles:read`, `audit:read`, `agent:ask`) y `auditor` (`audit:read`).
- **Claim `permissions`** en el access token. auth-service lo resuelve al emitir desde `role_names_projection`, que ahora guarda también `permissions` y se mantiene con `role.created`/`role.updated` (misma regla de versión por agregado descrita en "Origen del rol"). El claim `roles` se mantiene (lo usan el filtro `roleScope` del agente y el `actor` de los eventos de dominio).
- **`PermissionsGuard` + `@RequirePermissions(...)`** en `packages/jwt-guard`, encadenado tras `JwtAuthGuard`. Cada servicio declara y aplica sus propios permisos por endpoint (user, role, audit y ai-agent-service); la decisión sigue siendo local, sin consultar role-service por petición.
- **Tokens de servicio**: los tokens `client_credentials` llevan `roles: ['service']` y no tienen permisos de usuario. Un endpoint que deba aceptarlos lo declara explícitamente con `@AllowServiceToken()` (p. ej. `GET /roles/:id`, que user-service consulta durante el alta). Los endpoints internos de auth-service siguen protegidos por rol `service`.
- **Web**: el hook `useCan(permiso)` decide navegación, tarjetas de Inicio y acciones visibles; la página Permisos muestra la matriz rol × permiso. La UI solo oculta; la autorización efectiva la aplica cada servicio.
- **Sin escalada de privilegios**: nadie puede conceder ni asignar permisos que no posee. role-service (`POST/PUT /roles`) exige que los permisos resultantes sean un subconjunto de los del actor (solo quien tiene `*` puede conceder `*`) y user-service (`POST /users`, `PUT /users/:id/role`) aplica la misma regla al rol destino; un actor sin `*` tampoco puede cambiar su propio rol. Violaci�n: 403 `permission_escalation`. El rol `admin` sembrado es inmutable en nombre y permisos (403 `admin_role_immutable`; la descripci�n s� es editable). La UI solo deshabilita opciones.
- El agente expone la herramienta `lookup_users` al LLM solo si el llamante tiene `users:read`.

### Consecuencias

- **Positivas**: los roles creados o editados desde la UI tienen efecto real; autorización granular y declarativa por endpoint; el nombre del rol deja de ser relevante para la seguridad; UI y backend comparten un único catálogo.
- **Negativas y riesgos**: los permisos del token pueden quedar desfasados hasta que expire el access token o llegue el evento de proyección (misma consistencia eventual que el rol); el tamaño del token crece con el número de permisos; `*` concede también permisos futuros, por lo que solo se asigna a `admin`; no existe borrado de roles (requeriría reasignar usuarios), por diseño en este alcance.
