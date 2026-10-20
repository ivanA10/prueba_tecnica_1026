---
id: ADR-002
title: Límites de servicio por contexto delimitado y base de datos por servicio
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0]
---

# ADR-002 — Límites de servicio por contexto delimitado y base de datos por servicio

## Context

El Ejercicio 1 pide una estrategia multi-DB "según diseño" (SQL Server, MySQL, Postgres, MongoDB, Redis según corresponda) y el Ejercicio 2 exige microservicios con responsabilidades separadas. Una base de datos compartida acoplaría los esquemas de identidad, usuarios y roles y haría imposible razonar sobre la propiedad de los datos.

Al mismo tiempo, el entorno objetivo es un `docker compose` local evaluado en una máquina de desarrollo: levantar una instancia de Postgres por servicio multiplica el consumo de memoria y el tiempo de arranque.

## Decision

Un contexto delimitado por servicio, y **cada servicio es dueño exclusivo de sus datos**:

| Servicio | Contexto | Almacén propio |
|---|---|---|
| `auth-service` | Identidad y sesiones | Postgres `auth_db`; Redis prefijo `auth:` |
| `user-service` | Gestión de usuarios | Postgres `user_db` (incluye `outbox_events`) |
| `role-service` | Roles y permisos | Postgres `role_db`; Redis prefijo `role:` |
| `audit-service` | Auditoría de accesos | MongoDB `audit_db` (append-only) |
| `ai-agent-service` | Agente IA + RAG | Qdrant `knowledge_base`; Redis prefijo `agent:` |

### Postgres: una instancia, tres bases lógicas, un rol por base

Trade-off explícito: **una sola instancia Postgres con tres bases lógicas** (`auth_db`, `user_db`, `role_db`) y **un rol de BD por base, sin permisos cruzados** (cada rol solo tiene `CONNECT` y privilegios sobre su propia base; `REVOKE` de `PUBLIC`). Un script de init crea bases y roles. Se gana simplicidad operativa y de recursos en local; se pierde aislamiento de fallos y de recursos (una instancia caída o saturada afecta a los tres servicios) y no hay aislamiento físico. El aislamiento lógico y de credenciales sí se mantiene: un servicio comprometido no puede leer la base de otro con sus credenciales.

### Redis: prefijo por servicio por convención

Todas las claves llevan el prefijo del servicio propietario (`auth:`, `role:`, `agent:`, y `<svc>:jwks` para la caché JWKS). **Los prefijos son una convención, no una frontera de seguridad**: cualquier servicio con las credenciales de Redis puede técnicamente leer cualquier clave. Los usuarios ACL de Redis por prefijo son **Evolución**. Solo escribe el propietario de cada prefijo.

### Única excepción de lectura cruzada: `auth:deny:jti:*` y `auth:deny:user:*`

Las denylists `auth:deny:jti:{jti}` (logout; TTL = vida restante del access token) y `auth:deny:user:{userId}` (marca de deshabilitación; los tokens con `iat` anterior se rechazan; TTL = vida máxima del access token) **las escribe auth-service y las leen todos los servicios a través de `jwt-guard`, en modo solo lectura**. Justificación: la validación local de JWT (ADR-003) no puede revocar un token sin consultar algún estado compartido; sin esta lectura cruzada, un logout o la deshabilitación de un usuario no tendría efecto hasta la expiración del token. Es la única violación deliberada de "solo el dueño lee sus datos" y queda acotada a esas dos familias de claves de solo lectura, sin datos personales. Su política ante Redis caído (fail-open solo en el denylist) se fija en ADR-003.

### Saga de alta de usuario (decisión cerrada)

1. `POST /users`: user-service valida la entrada y crea `users(status=PENDING)`. La contraseña no se persiste en user-service ni se loguea.
2. user-service valida el rol con role-service (REST con circuit breaker, ADR-005).
3. user-service llama `PUT /internal/credentials/{userId}` (REST interno con JWT de servicio, idempotente por `user_id`). **auth-service es el único que hashea la contraseña** (argon2id, ADR-003) y crea `credentials(status=PENDING)`; el login se rechaza mientras esté `PENDING`. La llamada es síncrona porque el alta no debe confirmarse sin credenciales aprovisionadas.
4. user-service marca `ACTIVE` y escribe `outbox_events(user.created)` en la misma transacción. El publicador emite `user.created` y auth-service lo consume y **activa las credenciales solo si el estado actual es `PENDING` y el `aggregateVersion` del evento es mayor que su `user_last_version`** (la proyección de auth separa los agregados: `user_roles_projection(user_id, role_id, user_last_version)` no guarda nombre de rol; los eventos `role.updated` actualizan `role_names_projection(role_id, role_name, last_version)` solo si su versión es mayor, y el nombre se resuelve por join al emitir el token). Nunca reactiva desde `DISABLED`.
5. **Compensación** (orden invertido para no bloquear el email): si falla el paso 2, 3 o 4, user-service llama **primero** `DELETE /internal/credentials/{userId}` (idempotente, con reintento y backoff) y **solo tras confirmarse** elimina el usuario `PENDING`; después responde error. Si el `DELETE` falla, el usuario sigue `PENDING` (el email permanece reservado) y la reconciliación reintenta el `DELETE` y luego elimina el usuario: el email nunca queda bloqueado por credenciales huérfanas en auth. Los pasos 2 y 3 comparten un presupuesto total de ≤10 s antes de compensar (los reintentos cuentan contra él; ver 07-resiliencia).
6. **Reconciliación con período de gracia** (configurable, mayor que el presupuesto de 10 s del alta): **solo user-service**, como fuente de verdad, barre los usuarios `PENDING` más antiguos que la gracia, llama al `DELETE` y, solo cuando se confirma, los elimina.
7. **auth-service nunca borra credenciales automáticamente.** Las credenciales `PENDING` solo se activan por `user.created` y solo se eliminan por el `DELETE` de compensación o por `user.deleted`. Un barrido de auth por antigüedad es **Evolución**: podría borrar credenciales de un usuario ya `ACTIVE` si el evento se demora (broker caído o DLQ), porque la contraseña inicial no se guarda en otro sitio.
8. Unicidad de email: manda user-service (`users.email unique`); un `409` de auth por email duplicado dispara compensación.

### Superficie de red

`/internal/*` y `/oauth/*` **no se enrutan por nginx**: solo son alcanzables dentro de la red interna de Docker. Los endpoints `/internal/*` exigen JWT de servicio con `aud: auth-service` y `scope: svc:internal`.

## Consequences

### Positivas

- Propiedad de datos clara por contexto; cada servicio evoluciona su esquema sin coordinar migraciones con otros.
- El rol de BD por base limita el radio de impacto de una credencial filtrada o de una inyección SQL.
- La saga es explícita, idempotente y sin dependencia inversa auth→user ni carrera con altas en vuelo (la reconciliación vive solo en user-service).
- El almacén por servicio permite elegir la tecnología adecuada: SQL transaccional, documentos append-only para auditoría y vectores para RAG.

### Negativas y riesgos

- Consistencia eventual entre `users` y `credentials`: tras el alta hay una ventana (normalmente segundos) en que el login aún no está habilitado.
- Doble escritura en el alta (user-service y auth-service): requiere compensación e idempotencia; si el proceso cae a mitad, la reconciliación con gracia es la red de seguridad.
- Una instancia Postgres es punto único de fallo y de contención de recursos para tres servicios.
- Los prefijos de Redis no impiden accesos cruzados mientras no existan usuarios ACL; es una disciplina de código, no un control técnico.
- La excepción `auth:deny:jti:*` / `auth:deny:user:*` introduce un acoplamiento de lectura de todos los servicios con Redis y con el formato de esas claves.
- Credenciales `PENDING` huérfanas pueden acumularse si user-service no reconcilia (aceptado: no permiten login).

## Alternatives considered

### Alternativa 1 — Base de datos compartida única

Un solo esquema con tablas de todos los servicios. Por qué se descartó: acopla esquemas y despliegues, rompe la propiedad de datos entre contextos y contradice el requisito de microservicios con multi-DB del PDF; cualquier servicio podría leer el hash de contraseñas.

### Alternativa 2 — Una instancia Postgres por servicio

Aislamiento físico completo. Por qué se descartó: tres instancias elevan el consumo de RAM y el tiempo de arranque del `docker compose` en la máquina del evaluador sin beneficio proporcional para el alcance; se declara como Evolución si se despliega en producción.

### Alternativa 3 — Hash de contraseña en user-service y envío del hash a auth

Evitaría enviar la contraseña en claro por el canal interno. Por qué se descartó: reparte la responsabilidad criptográfica en dos servicios y obliga a que user-service conozca el algoritmo y sus parámetros; se prefiere un único punto (auth) con canal interno autenticado por JWT de servicio y la contraseña nunca persistida ni logueada fuera de auth.

## Implementación

- **Implementado en `bootstrap-monorepo-platform`**: script de init de Postgres con las tres bases y un rol por base sin permisos cruzados; convención de prefijos de Redis; configuración de red interna sin enrutar `/internal/*` ni `/oauth/*`.
- **Implementado en `build-auth-role-services`**: `auth_db`, `role_db`, endpoints `PUT/DELETE /internal/credentials/{userId}`, activación de credenciales desde `PENDING` con `aggregateVersion`.
- **Implementado en `build-user-audit-services`**: `user_db`, outbox, saga de alta, compensación, reconciliación con gracia en user-service y `audit_db` en Mongo.
- **Evolución** (no implementado, riesgo aceptado): usuarios ACL de Redis por prefijo; barrido de auth de credenciales `PENDING` por antigüedad; una instancia Postgres por servicio en producción.
