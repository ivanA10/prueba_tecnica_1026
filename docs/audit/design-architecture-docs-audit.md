# Auditoría externa — design-architecture-docs

- **Fecha:** 2026-10-20
- **Auditor:** modelo Opus (Claude), externo al proceso de planificación; sin participación previa en las decisiones auditadas.
- **Fuentes revisadas:**
  - `Prueba_Tecnica_Desarrollador_Fullstack IA.pdf` (Ejercicios 1–5, criterios de evaluación, entregables esperados, duración).
  - `openspec/changes/design-architecture-docs/proposal.md`, `design.md`, `tasks.md`, `handoff.md`.
  - `openspec/changes/design-architecture-docs/specs/architecture-decision-records.md`, `architecture-documentation.md`, `requirements-traceability.md`.
  - `AGENTS.md` (secciones Stack y Domain Map).
- **Alcance:** los ADRs (`docs/adrs/`) aún no existen; se auditan las decisiones tal como están en `design.md › Architecture decisions` y en las definiciones de hecho (DoD) de las tareas 1.1–1.3. Cualquier defecto del contrato de `design.md` se propagará a los 10 ADRs y a los 8 documentos, porque `handoff.md › Implementation guidance` los obliga a derivarse de él.

## Dictamen global: APROBADO CON OBSERVACIONES

El stack y la descomposición son razonables, están alineados con el PDF y las alternativas descartadas son reales. Sin embargo, el **contrato de `design.md`** contiene 3 defectos de severidad Alta (bindings de RabbitMQ que no enrutan los eventos de login, contradicción en la propiedad de claves Redis que anula la revocación de tokens, y ausencia de modelo de identidad del agente frente a user-service) y varias contradicciones internas. Todos son corregibles enmendando `design.md` **antes** de despachar las tareas 1.1–1.3; ninguno invalida el stack elegido.

## Tabla de decisiones

| Decisión | Veredicto | Justificación | Riesgo | Recomendación |
|---|---|---|---|---|
| Lenguaje/stack: monorepo pnpm, TS + NestJS en todo (ADR-001) | ✅ | El PDF permite Node.js (Express/NestJS); un solo lenguaje reduce coste de contexto en 4.5 h; paquetes compartidos limitados a transversales (`logger`, `jwt-guard`, `contracts`) evita dominio compartido. Alternativa Python/FastAPI para IA es real. | `packages/contracts` puede convertirse en acoplamiento de despliegue (cambio de contrato = rebuild de todos). Embeddings ONNX en Node tienen dependencias nativas (ver H9). | Versionar eventos en `contracts` (`version` ya está en el sobre) y declarar regla de compatibilidad hacia atrás. |
| Límites de servicio + BD por servicio (ADR-002) | ⚠️ | 5 servicios + web cumplen "3–4 microservicios" con margen; Postgres ×3 lógicas, Mongo para auditoría, Redis, Qdrant cubren la estrategia multi-DB pedida. Trade-off de una instancia Postgres documentado. | Regla "una clave Redis = un propietario" contradice el denylist y `jwks:cache` (H3). Sin usuarios de BD por servicio, la separación lógica no se hace cumplir (H17). | Corregir modelo Redis; un rol Postgres por base. |
| JWT RS256 autoemitido + JWKS vs IdP (ADR-003) | ⚠️ | El PDF admite explícitamente "puede usar JWT con validación distribuida"; descartar Keycloak es proporcional para 4.5 h. Validación local vía JWKS es correcta. | Falta claim `aud`; obtención del JWT de servicio (`svc:internal`) no definida; revocación de access tokens no efectiva fuera de auth-service; no hay plan de generación/rotación de la clave privada (`kid`). | Añadir `aud`, flujo tipo `client_credentials`, `kid` + JWKS con rotación; usar endpoints con forma OAuth2 (`/oauth/token`, `/.well-known/openid-configuration`) para puntuar en "OAuth2/OIDC". |
| RabbitMQ vs Kafka (ADR-004) | ⚠️ | Elección sólida para volumen bajo, local y con DLQ nativa; Kafka/CDC descartados con buen motivo. Sobre de evento, at-least-once e idempotencia por `eventId` correctos. | **Bindings `user.*`/`auth.*`/`role.*` no capturan claves de 3 segmentos** (H1). Cola de auth-service inexistente (H2). Doble escritura sin outbox en el log de auditoría (H7). Sin política de reintento previo a DLQ (H19). | Usar `#`; definir cola `auth.user-projection`; outbox en Prisma al menos para `user.*`. |
| REST síncrono + resiliencia (ADR-005) | ✅ | Timeouts, backoff, circuit breaker y `x-correlation-id` cubren el criterio "Resiliencia y manejo de fallos". gRPC/service mesh descartados con razón. | Circuit breaker en cada arista puede ser sobre-ingeniería; la arista user→auth se justifica con un argumento débil (H6). | Limitar circuit breaker a user→role, user→auth y agent→LLM; documentar timeouts concretos por arista. |
| DDD + Clean Architecture + CQRS ligero (ADR-006) | ✅ | Cubre el criterio "DDD, Clean Architecture, CQRS si aplica"; 4 capas con regla de dependencia; CQRS "donde aplica" es honesto (audit-service es el caso natural). | Riesgo de ceremonia vacía (4 capas en servicios CRUD) dentro de 120 min de Ex2. | Declarar explícitamente CQRS solo en audit-service (lectura) y agente; no en role-service. |
| Observabilidad y testing vs ≥70 % (ADR-007) | ⚠️ | Jest con `coverageThreshold` 70 por servicio y pino JSON + correlation-id cumplen Ex2. | No hay agregación de logs, métricas ni trazas; Ex4 pide "logs centralizados" (H12). Umbral solo de líneas (`AGENTS.md › Stack`). | Perfil compose opcional (Loki/Grafana o Dozzle) o, mínimo, procedimiento `docker compose logs` + filtro por `correlationId`; umbral también de branches. |
| Proveedor LLM (Anthropic) + mock (ADR-008) | ✅ | Ex5 permite Anthropic; puerto `LlmProvider` + adaptador OpenAI/Azure preserva Ex1 ("OpenAI/Azure OpenAI"); mock determinista hace el sistema evaluable sin API key; manejo de 429 explícito. | Evaluador sin clave verá solo mock + embeddings hash → demo sin valor semántico (H9). Coste de tokens requiere tabla de precios configurable (H18). | Implementar realmente el adaptador OpenAI (barato) y documentar tabla de precios vía env. |
| RAG: MiniLM ONNX 384-d, chunk 512/64, Qdrant (ADR-009) | ⚠️ | Anthropic no ofrece embeddings, por lo que embeddings locales están justificados; Qdrant figura en el PDF; filtro `roleScope` es un acierto. | all-MiniLM-L6-v2 trunca a 256 tokens: chunks de 512 pierden la mitad (H8). Ingesta de PII de usuarios en el vector store sin borrado (H20). onnxruntime-node e imágenes Alpine (H9). | Chunk ≤256 (p. ej. 200/40); borrar vectores en `user.deleted`; ingerir solo datos no sensibles. |
| Frontend React + RTK + Jest + nginx BFF-lite (ADR-010) | ⚠️ | React+TS, Redux Toolkit, Jest+RTL coinciden literalmente con el PDF; nginx same-origin evita CORS y oculta `/internal/*`. | "BFF" es en realidad un reverse proxy: no media tokens; almacenamiento de access/refresh token en el navegador indefinido (XSS); Jest + Vite choca con `import.meta.env` (H11, H15). | Refresh token en cookie `HttpOnly; Secure; SameSite=Strict` con path `/api/auth`, access token en memoria; renombrar a "reverse proxy / API gateway ligero". |
| Saga de alta de usuario + compensación | ⚠️ | Compensación explícita e idempotente, "nunca ACTIVE sin credenciales": buen razonamiento. | Contraseña transita por user-service; credenciales válidas mientras el usuario es `PENDING`; `DISABLED` no propagado; job de reconciliación sin fuente de verdad y con carrera; huérfanos `PENDING` no limpiados (H6). | Ver recomendación 4. |
| Propiedad de Redis | ❌ | La regla "ningún otro servicio la lee" es incompatible con un denylist que deben consultar todos los validadores de JWT; `jwks:cache` y `rl:*` no llevan prefijo de servicio (contradice "prefijos por servicio"). | Logout/revocación inefectivo en 4 de 5 servicios, o violación silenciosa de la regla durante la implementación. | Ver recomendación 2. |

## Hallazgos

### H1 — Bindings topic con `*` no enrutan eventos de 3 segmentos — **Alta**
- **Referencia:** `design.md › Data model › Eventos (RabbitMQ)` (bindings `user.*`, `auth.*`, `role.*`) frente a `design.md › Catálogo de servicios` (routing keys `auth.login.succeeded`, `auth.login.failed`, `user.role.assigned`, `role.permissions.changed`).
- **Evidencia:** en un exchange topic de RabbitMQ `*` sustituye exactamente una palabra y `#` cero o más. `auth.*` no casa con `auth.login.succeeded`. Resultado: `audit.events` **nunca recibe los eventos de login** (núcleo de "auditoría de accesos" del Ex1), ni `user.role.assigned` ni `role.permissions.changed`; `agent.ingest` tampoco recibe `user.role.assigned`.
- **Impacto:** el error está en el contrato; tareas 1.2 (ADR-004), 2.1, 2.3 lo copiarán y el cambio `build-user-audit-services` lo implementará tal cual.
- **Corrección:** bindings `user.#`, `auth.#`, `role.#` (o renombrar claves a 2 segmentos).

### H2 — auth-service declarado consumidor sin cola ni binding — **Media**
- **Referencia:** `design.md › Catálogo de servicios` (auth consume `user.role.assigned`, `user.updated`, `user.deleted`) frente a `design.md › Eventos` (solo colas `audit.events` y `agent.ingest`) y `design.md › Component diagram` (no hay arista `MQ → AUTH`).
- **Impacto:** tres secciones del mismo contrato se contradicen; la proyección `user_roles_projection` (origen del claim `roles[]`) no tendría fuente de eventos. ADR-003 (tarea 1.1 DoD) depende de esa proyección.
- **Corrección:** cola `auth.user-projection` con bindings `user.role.assigned`, `user.updated`, `user.deleted` y su DLQ; añadir arista en el diagrama.

### H3 — Regla de propiedad única de Redis contradice el denylist — **Alta**
- **Referencia:** `design.md › Modelo de datos › Redis` ("cada clave tiene UN servicio propietario y ningún otro la lee") frente a `deny:jti:{jti}` y ADR-003 ("validación local en cada servicio … denylist en Redis").
- **Evidencia:** si cada servicio valida JWT localmente, debe consultar el denylist para que el logout/revocación sea efectivo; la regla lo prohíbe. `jwks:cache` es necesariamente por servicio pero no lleva prefijo (colisión), y `rl:{userId}:{route}` tampoco, contradiciendo "prefijos por servicio".
- **Impacto (seguridad, OWASP A07):** tras logout o `user.deleted`, el access token sigue siendo válido en user/role/audit/agent hasta `exp`.
- **Corrección:** declarar `deny:jti:*` como clave de **escritura exclusiva** de auth-service y **lectura permitida** vía `packages/jwt-guard` (excepción explícita y justificada en ADR-002), o aceptar formalmente "revocación = vida corta del access token (≤5 min)" y eliminar el denylist; prefijar `jwks:cache` → `<svc>:jwks` y `rl:*` → `agent:rl:*`.

### H4 — Identidad del agente al consultar user-service no definida; PII y prompt injection — **Alta**
- **Referencia:** `design.md › Component diagram` (`AGENT -->|REST: herramienta consulta usuarios| USER`), `design.md › APIs` (`POST /agent/ask`), `tasks.md › 2.5 DoD` (solo menciona control de acceso en recuperación Qdrant).
- **Evidencia:** no se especifica si la herramienta propaga el JWT del usuario final o usa un token de servicio. Con token de servicio, cualquier usuario autenticado podría obtener datos de todos los usuarios a través del agente (confused deputy, OWASP API1/API5). No se menciona el envío de PII al proveedor LLM externo ni la inyección de prompts (OWASP LLM01) — relevante para el criterio Ex5 "Validación de respuestas del agente".
- **Corrección:** la herramienta reenvía el JWT del llamante (delegación) y user-service aplica RBAC; lista blanca de campos devueltos al LLM (sin hash, sin datos sensibles); sección de prompt injection en `08-integracion-ia-rag.md` y ADR-008.

### H5 — JWT sin `aud`; emisión del token de servicio sin definir — **Media**
- **Referencia:** `design.md › Modelo de datos › JWT` (claims `sub, roles[], jti, iat, exp, iss`); `design.md › APIs` (auth internos con "JWT de servicio, claim `scope: svc:internal`, emitido por auth-service").
- **Evidencia:** sin `aud`, un token emitido para un servicio es aceptado por todos. No se indica cómo user-service obtiene su token (credencial del cliente, dónde se guarda, rotación) ni cómo se genera/monta la clave privada RS256 en compose ni su `kid`.
- **Corrección:** `aud` por servicio; grant `client_credentials` con `client_secret` en `.env` (o JWT firmado por clave del propio servicio); `kid` y procedimiento de generación de claves en `06-seguridad-escalabilidad.md`.

### H6 — Huecos en la saga de alta de usuario — **Media**
- **Referencia:** `design.md › Creación de usuario`; `design.md › APIs` (`PUT /internal/credentials/{userId}` "recibe email, hash/contraseña inicial y rol inicial").
- **Evidencia:**
  1. "hash/contraseña" es ambiguo: si es contraseña en claro, transita por user-service (riesgo de log y de ampliar superficie); si es hash, user-service conoce el algoritmo de auth (acoplamiento).
  2. Entre `PUT /internal/credentials` y `ACTIVE`, las credenciales existen y auth no conoce el estado → login posible de un usuario `PENDING`; `DISABLED` tampoco se propaga a auth (solo se menciona actualizar roles con `user.updated`).
  3. El job de reconciliación "borra credenciales huérfanas sin usuario `ACTIVE`": auth no tiene esa información sin llamar a user-service (nueva dependencia inversa) y puede borrar credenciales de una creación en vuelo (carrera; falta período de gracia). Registros `PENDING` huérfanos tras caída de user-service no se limpian.
  4. Unicidad de email repartida entre `user_db` y `auth_db.credentials` sin regla de cuál manda.
  5. La justificación "el PDF exige REST síncrono" es débil: user→role y agent→user ya cubren el requisito.
- **Corrección:** auth hashea siempre (recibe contraseña sólo por canal interno, nunca logueada) o flujo de invitación/set-password; `credentials.status` inicial `PENDING` que pasa a `ACTIVE` por `user.created`; propagar `DISABLED`; reconciliación con gracia ≥ N minutos y alcance a `PENDING` en user-service, o diferirla como evolución documentada.

### H7 — Doble escritura sin outbox en eventos que alimentan la auditoría — **Media**
- **Referencia:** `design.md › Architecture decisions` (fila ADR-004: "outbox transaccional queda como evolución"); `design.md › Creación de usuario` ("si la publicación falla se reintenta").
- **Evidencia:** un reintento en memoria se pierde si el proceso cae tras el commit; para un sistema cuyo objetivo es "auditoría de accesos", perder eventos es un fallo funcional, no un detalle. Con Prisma, una tabla `outbox` + publicador periódico cuesta poco y puntúa en "Resiliencia y manejo de fallos" y "Comunicación asíncrona bien implementada".
- **Corrección:** outbox al menos en user-service y auth-service (eventos de login); mantener "evolución" solo para role-service.

### H8 — Chunk de 512 tokens excede la longitud máxima de MiniLM — **Media**
- **Referencia:** `design.md › Architecture decisions` (fila ADR-009: "ONNX MiniLM (384-d) … chunking 512 tokens / 64"); `tasks.md › 1.3 DoD`.
- **Evidencia:** all-MiniLM-L6-v2 tiene `max_seq_length` 256 word-pieces (entrenado con 128); la entrada se trunca silenciosamente y la mitad de cada chunk no queda representada en el vector.
- **Corrección:** chunks de ~200–256 tokens con solapamiento ~32–40, o modelo con contexto 512 (p. ej. variantes bge/e5-small) — en ambos casos verificar contra la ficha del modelo (`needs-verification`).

### H9 — Riesgos operativos de ONNX en Node y del fallback `hash` — **Media**
- **Referencia:** `design.md › Architecture decisions` (fila ADR-009: "fallback `hash` determinista para pruebas/offline"); fila ADR-008 (mock sin API key).
- **Evidencia:** onnxruntime-node requiere glibc (no Alpine) y descarga/empaquetado del modelo (~90 MB) en build; si falla, el sistema cae a `hash`. Un evaluador sin API key verá mock LLM + embeddings hash: la demo de RAG no tendría recuperación semántica, afectando "Implementación correcta de RAG con vector database".
- **Corrección:** modelo ONNX descargado en build de la imagen (base Debian slim), `hash` solo en tests unitarios; documentar que la recuperación real funciona sin API key aunque la generación sea mock.

### H10 — RBAC por nombres de rol desacoplado del modelo de permisos — **Media**
- **Referencia:** `design.md › Modelo de datos` (`users.role_id` único; `user_roles_projection.role_names[]`; `role_permissions`; Redis `role:perm:{roleId}`: "los demás servicios autorizan con el claim `roles[]`").
- **Evidencia:** los permisos de role-service no se usan para autorizar (solo nombres de rol), por lo que `PUT /roles/{id}/permissions` no tiene efecto real salvo que cada servicio llame a `GET /roles/{id}` por petición (acoplamiento síncrono). auth no consume `role.updated`: un renombrado deja la proyección obsoleta. Modelo de un rol (`role_id`) vs claim array `roles[]`.
- **Corrección:** decidir explícitamente: (a) claim `permissions[]` en el JWT calculado por auth al emitir (consumiendo `role.permissions.changed`), o (b) RBAC solo por rol y declarar permisos como informativos. Unificar cardinalidad del rol.

### H11 — Almacenamiento de tokens en el navegador y alcance real del "BFF" — **Media**
- **Referencia:** `design.md › Architecture decisions` (fila ADR-010 "nginx como BFF ligero"); `design.md › APIs` (`POST /auth/refresh`); `tasks.md › 2.4 DoD` (OWASP genérico).
- **Evidencia:** no se define dónde viven access y refresh token en el cliente (localStorage = robo por XSS). nginx solo enruta; no hay agregación ni mediación de tokens, por lo que llamarlo BFF sobrevende. Rate limiting solo existe para el agente (`rl:{userId}:{route}`); `/auth/login` queda expuesto a fuerza bruta (OWASP A07).
- **Corrección:** refresh en cookie `HttpOnly` acotada a `/api/auth`, access token en memoria (RTK); `limit_req` de nginx o rate limit en auth para `/auth/login`; renombrar a "reverse proxy / gateway ligero" en ADR-010.

### H12 — Observabilidad insuficiente para el Ejercicio 4 — **Media**
- **Referencia:** `design.md › Architecture decisions` (fila ADR-007); PDF Ex4 ("Explicar cómo usaría logs centralizados", "uso adecuado de logs y herramientas de debugging").
- **Evidencia:** solo pino JSON + correlation-id; ni agregación, ni métricas (latencia, tasa de 5xx), ni trazas. La respuesta del Ex4 (cambio `document-diagnosis-delivery`) será teórica sin soporte en el propio sistema. Las métricas de latencia/tokens del agente (Ex5) tampoco tienen destino definido.
- **Corrección:** perfil compose opcional `observability` (Loki+Grafana o Dozzle) o, como mínimo, campos estándar de log (`service`, `correlationId`, `latencyMs`, `statusCode`, `tokensIn/Out`) y receta de consulta documentada.

### H13 — Requisito "OAuth2/OIDC" sin mapeo explícito — **Baja**
- **Referencia:** PDF Ex2 ("Implementar autenticación OAuth2/OIDC distribuida … (puede usar JWT con validación distribuida)"); `design.md` fila ADR-003 descarta "Keycloak/OIDC completo".
- **Evidencia:** la decisión es válida, pero ningún artefacto obliga a citar textualmente la cláusula del PDF que la permite ni a acercarse a la semántica OAuth2.
- **Corrección:** ADR-003 cita la cláusula; endpoints con forma OAuth2 (`/oauth/token` con `grant_type=password|refresh_token|client_credentials`) y documento de discovery mínimo.

### H14 — Proporcionalidad y gates que incentivan relleno — **Media**
- **Referencia:** `tasks.md` gates 1.1–1.3 (`wc -l ≥ 60` por ADR), 1.4 (`≥ 100` líneas, `≥ 60` filas), 2.1 (`≥ 100` líneas); `proposal.md` (9 cambios); PDF "Duración Total Estimada" (Ex1 = 90 min, total ~4.5 h).
- **Evidencia:** 10 ADRs + 8 documentos + matriz de ≥60 filas para un ejercicio de 90 minutos; los umbrales de líneas miden volumen, no calidad, y empujan a texto de relleno que el evaluador debe leer. En implementación, la suma refresh con familias + denylist + saga con reconciliación + circuit breakers por arista + DLQ + outbox + ONNX supera holgadamente 120 min de Ex2.
- **Corrección:** sustituir umbrales de líneas por checks de contenido (ya existen); marcar en ADRs qué es "implementado" vs "evolución" para que el evaluador no penalice ausencias.

### H15 — Jest con Vite (`import.meta.env`) — **Baja**
- **Referencia:** `design.md` fila ADR-010; `AGENTS.md › Stack` ("Jest 29 + React Testing Library via ts-jest (NOT Vitest)").
- **Evidencia:** ts-jest en CJS no soporta `import.meta.env`; requiere módulo de configuración inyectable o plugin de Babel. Elección correcta (el PDF exige Jest) pero el riesgo no figura.
- **Corrección:** consignar en ADR-010 el patrón `config.ts` envolviendo `import.meta.env` y mockeado en Jest.

### H16 — Inconsistencias de proceso en el plan — **Baja**
- **Referencia:** `design.md › Plan metadata` (Wave 0 vs `wave >= 1` del schema; Owner `fullstack` vs despacho `backend` en `tasks.md` cabecera y `handoff.md › Open risks`); `openspec/config.yaml` ausente; spec `architecture-decision-records` (escenario) vs `proposal.md` (pin Engram omitido).
- **Impacto:** bajo para la arquitectura; riesgo de que los gates de validación rechacen el plan.

### H17 — Aislamiento de datos no forzado — **Baja**
- **Referencia:** `design.md › Catálogo de servicios` ("Postgres 17 (una instancia, tres bases lógicas)"); Redis compartido con prefijos.
- **Evidencia:** sin un usuario Postgres por base y sin ACLs Redis, "BD por servicio" es convención, no frontera.
- **Corrección:** script init de Postgres con `auth_user/user_user/role_user` sin permisos cruzados; usuarios ACL Redis por prefijo (barato en Redis 7).

### H18 — Coste de tokens sin fuente de precios — **Baja**
- **Referencia:** `proposal.md › Out of scope` y `design.md › D5` (sin precios en docs); PDF Ex5 ("Coste de tokens (input/output)").
- **Evidencia:** correcto no fijar precios en docs, pero el cálculo de coste necesita una tabla configurable; no se nombra su forma.
- **Corrección:** variables `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK` en `.env.example`, sin valor por defecto en docs.

### H19 — Política de reintento de consumidores sin definir — **Baja**
- **Referencia:** `design.md › Eventos` (DLX + `<cola>.dlq`).
- **Evidencia:** no se define cuántos reintentos ni con qué retardo antes de enviar a DLQ, ni cómo se reprocesa la DLQ; con `nack` sin requeue todo error transitorio (p. ej. Mongo reiniciando) termina en DLQ.
- **Corrección:** N reintentos con cola de retardo (TTL + DLX) y procedimiento de re-drive documentado en 07.

### H20 — Ingesta de datos de usuario en el vector store — **Media**
- **Referencia:** `design.md › Catálogo` (ai-agent-service consume `user.*` para ingesta); `design.md › Qdrant` (payload `roleScope`).
- **Evidencia:** indexar usuarios en Qdrant duplica PII fuera de su servicio propietario, queda obsoleta en `user.updated` y persiste tras `user.deleted` (no se define borrado de vectores). Además existe ya la herramienta REST a user-service, que da datos frescos y autorizados.
- **Corrección:** RAG sobre documentos de conocimiento (políticas, roles, guías); datos de usuarios solo vía herramienta REST; si se mantiene la ingesta, upsert por `docId=userId` y borrado en `user.deleted`.

**Conteo por severidad:** Alta 3 (H1, H3, H4) · Media 11 (H2, H5, H6, H7, H8, H9, H10, H11, H12, H14, H20) · Baja 6 (H13, H15, H16, H17, H18, H19).

## Requisitos del PDF sin cobertura o débiles

| Requisito del PDF | Estado en el plan | Observación |
|---|---|---|
| Ex1 "auditoría de accesos" | Débil | Por H1 los eventos de login no llegan a audit; los rechazos de autorización (403) no se auditan en ningún punto. |
| Ex2 "Autenticación OAuth2/OIDC distribuida" | Débil | Cubierto por la cláusula "puede usar JWT", pero sin mapeo explícito ni semántica OAuth2 (H13); revocación distribuida rota (H3). |
| Ex2 "Consideración de seguridad OWASP" | Débil | 06 lo trata a nivel genérico; faltan brute-force en login, almacenamiento de tokens (H11), confused deputy del agente (H4), `aud` (H5). |
| Ex4 "logs centralizados" y "herramientas de debugging" | Débil | Sin agregación ni métricas (H12); el diseño no soporta la respuesta del diagnóstico. |
| Ex5 "Validación de respuestas del agente" / "Manejo de errores y rate limiting" | Parcial | Rate limit por usuario definido; validación de salida y prompt injection no se mencionan en el contrato (H4); diferido al cambio 8. |
| Ex5 "Coste de tokens (input/output)" | Parcial | Falta fuente de precios configurable (H18). |
| Ex1 "Integración de IA (OpenAI/Azure OpenAI)" | Parcial | Solo "ranura de adaptador"; si no se implementa, el evaluador de Ex1 puede leerlo como incumplimiento. |
| Ex2/Ex1 "Tests con coverage adecuado" + "coverage report" | Cubierto con riesgo | Marcado `[RIESGO]` en la matriz; umbral solo de líneas. |
| Ex3 "Documentación de cómo ejecutar el front-end" | Cubierto con riesgo | Marcado `[RIESGO]` (spec `requirements-traceability`); correcto. |

No se detectan requisitos del PDF completamente ausentes de la matriz planificada: la spec `requirements-traceability` exige cubrir todas las viñetas, incluidos "Entregables Esperados" (`EX0-*`) y la instrucción del Ex4. La debilidad está en la **calidad** del diseño de algunos requisitos, no en su trazabilidad.

## Recomendaciones antes de implementar

1. **Enmendar `design.md › Eventos` antes de la tarea 1.2:** bindings `user.#`, `auth.#`, `role.#`; añadir la cola de auth-service (`auth.user-projection`) con DLQ y la arista en el diagrama; política de reintentos previa a DLQ (H1, H2, H19).
2. **Resolver la propiedad de Redis y la revocación (H3, H5):** excepción explícita "escritura auth / lectura vía `jwt-guard`" para `deny:jti:*` o eliminar el denylist con access token ≤5 min; prefijar todas las claves por servicio; añadir `aud` y `kid` al JWT y definir la emisión del token de servicio (`client_credentials`).
3. **Definir el modelo de identidad del agente (H4, H20):** la herramienta REST reenvía el JWT del llamante; lista blanca de campos enviados al LLM; RAG sobre documentos de conocimiento, no sobre PII de usuarios; sección de prompt injection en ADR-008/doc 08.
4. **Cerrar la saga de alta (H6, H7):** auth es el único que hashea; credenciales nacen `PENDING` y se activan con `user.created`; `DISABLED` se propaga; outbox en user-service y auth-service; reconciliación con período de gracia o diferida como evolución explícita.
5. **Corregir parámetros de RAG (H8, H9):** chunk ≤256 tokens o modelo de 512; modelo ONNX empaquetado en imagen Debian slim; `hash` solo en tests.
6. **Seguridad de frontend y borde (H11):** refresh en cookie `HttpOnly`, access token en memoria, rate limit en `/auth/login`; renombrar "BFF" a reverse proxy/gateway ligero.
7. **Ajustar proporcionalidad y observabilidad (H12, H14):** sustituir umbrales de líneas en gates por checks de contenido; marcar en cada ADR qué es "implementado" vs "evolución"; añadir perfil compose opcional de logs centralizados o campos de log estándar documentados para Ex4/Ex5.

## Verificación de cierre (ronda 2)

- **Fecha:** 2026-10-20 · **Auditor:** el mismo (modelo Opus, externo) · **Fuentes revisadas:** `design.md`, `tasks.md`, `handoff.md` y `specs/*.md` en su versión revisada, más `proposal.md` para comprobar la consistencia.
- **Desviación aprobada por el usuario:** outbox transaccional solo en user-service; el outbox de auth-service queda como Evolución con riesgo aceptado.

| Hallazgo | Estado | Evidencia (archivo:sección) | Comentario |
|---|---|---|---|
| H1 Bindings `*` vs claves de 3 segmentos | Cerrado | `design.md › Eventos (RabbitMQ)` (`user.#`, `auth.#`, `role.#`, `access.#`, con la semántica `*`/`#` explicada); `tasks.md › 1.2` (gate `user[.]#`) | Correcto, y el gate lo hace cumplir. |
| H2 Cola de auth-service inexistente | Cerrado | `design.md › Eventos` (`auth.user-projection`); `› Catálogo` (columna "Consume (cola)"); `› Component diagram` (`MQ → AUTH`); gate 2.1 | Las tres secciones son coherentes. |
| H3 Propiedad de Redis vs denylist | Cerrado | `design.md › Modelo de datos › Redis` (prefijos, ACL, excepción única `auth:deny:jti:*` en solo lectura vía `jwt-guard`); `› Architecture decisions` (ADR-002) | La excepción está justificada y acotada. Introduce N3 (Redis como dependencia de cada petición). |
| H4 Identidad del agente, PII, prompt injection | Cerrado | `design.md › Agente de IA: identidad, datos y prompt injection`; diagrama "REST con JWT del llamante"; gates 2.4/2.5 (`## Identidad y datos`, `## Prompt injection`) | Delegación, lista blanca de campos y tratamiento de la salida de herramientas como dato no confiable: adecuado. |
| H5 `aud`, token de servicio, claves | Cerrado | `design.md › Modelo de datos › JWT` y `› Servicio-a-servicio`; `› APIs` (`/oauth/token` con `client_credentials`, `aud: auth-service`) | Incluye `kid`, rotación con clave actual + previa y clave fuera de git. |
| H6 Huecos de la saga de alta | Parcial | `design.md › Alta de usuario` pasos 1–7 | Quedan resueltos el hashing exclusivo en auth, las credenciales `PENDING`, la propagación de `DISABLED`, la unicidad de email y la justificación de la llamada síncrona. **Pero la reconciliación de auth introduce N1, y la activación asíncrona introduce N2.** |
| H7 Doble escritura sin outbox | Aceptado como riesgo | `design.md › Eventos` ("Garantía de publicación"); ADR-004; `tasks.md › 2.3` DoD (riesgo documentado) | Ver el juicio sobre la desviación más abajo. Aceptable con la mitigación propuesta. |
| H8 Chunk 512 vs límite de MiniLM | Cerrado | `design.md` fila ADR-009 (≤256 / ~32); gates 1.3 y 2.5 (`256`) | — |
| H9 ONNX en Node / fallback `hash` | Cerrado | `design.md` fila ADR-009 (Debian-slim, modelo horneado en la imagen, `hash` solo en tests); `› Agente de IA` ("RAG real sin API key") | — |
| H10 RBAC vs permisos; cardinalidad del rol | Cerrado | `design.md › Autorización`; `› Modelo de datos` (`user_roles_projection(role_id, role_name)`, consumo de `role.updated`); `› JWT` (`roles[]` de un elemento) | La decisión es explícita: los permisos son informativos y `permissions[]` queda como evolución. |
| H11 Tokens en el navegador; "BFF"; fuerza bruta | Cerrado | `design.md` fila ADR-010 y D6; `› APIs` (`limit_req` en `/api/auth/login`); `› JWT` (cookie HttpOnly, access token en memoria); `auth:rl:login:{ip}` | Ver la nota menor N6 sobre `Secure` en localhost. |
| H12 Observabilidad para Ex4 | Cerrado | `design.md › Campos de log estándar`; fila ADR-007; gates 1.3 y 2.4 (`observability`) | Hay receta mínima con `jq` y un perfil opcional (Evolución). Es proporcional. |
| H13 Mapeo OAuth2/OIDC | Cerrado | `design.md` fila ADR-003 (cita de la cláusula, `/oauth/token`, discovery); gate 1.1 (`validaci.*n distribuida`) | — |
| H14 Proporcionalidad y gates de líneas | Cerrado | `tasks.md` cabecera ("sin umbrales de líneas"); `design.md › Testing strategy`; columna "Implementación" y `## Implementación` en cada ADR; `› Risks` 3 | La línea "Implementado / Evolución" es una buena defensa ante el evaluador. |
| H15 Jest + `import.meta.env` | Cerrado | `design.md` fila ADR-010; gate 1.3 (`import.meta.env`) | — |
| H16 Inconsistencias de proceso | Aceptado como riesgo | `design.md › Plan metadata` (Wave 0 vs `wave >= 1`, `openspec/config.yaml` ausente, Owner `fullstack`→`backend`) | Están declaradas; no afectan a la arquitectura. |
| H17 Aislamiento de datos | Cerrado | `design.md › Catálogo` (rol de BD por base, ACL de Redis); gate 2.4 (`ACL`) | — |
| H18 Fuente de precios | Cerrado | `design.md` fila ADR-008 (`LLM_PRICE_*_PER_MTOK`); gates 1.3 y 2.5 | — |
| H19 Reintentos antes de DLQ | Cerrado | `design.md › Eventos` (colas `.retry`, `x-retry-count`, re-drive); gate 2.3 | Introduce N2 (las colas de retardo rompen el orden). |
| H20 PII en el vector store | Cerrado | `design.md` fila ADR-009; `› Catálogo` (`agent.ingest`: solo `role.#`); `› Agente de IA` | — |

**Conteo por estado:** Cerrado 17 · Parcial 1 (H6) · Aceptado como riesgo 2 (H7, H16) · Abierto 0.

### Juicio sobre la desviación del outbox (H7)

Es aceptable para el alcance de la prueba, por sus propios méritos:
- `auth.login.failed` no lleva una transacción de negocio a la que acoplar un outbox (un login fallido no escribe nada), así que ahí el outbox aporta poco. `auth.login.succeeded` sí podría acoplarse a la inserción del refresh token, pero el coste-beneficio es menor que en user-service, cuyos eventos además mueven estado (activan credenciales).
- **Riesgo infravalorado:** el texto (`design.md › Eventos`, "Garantía de publicación") solo menciona la caída del proceso. El escenario más probable es una **caída de RabbitMQ más larga que la ventana de reintento en memoria**: en ese caso se pierden *todos* los eventos de login de ese periodo, no uno solo. Precisamente es el escenario del Ex4.
- **Mitigación barata recomendada:** cuando se agoten los reintentos, escribir el sobre completo como log estructurado (`event: "audit.fallback"`), recuperable con la receta `jq` de ADR-007, y declararlo en ADR-004 y en `07-resiliencia.md`. Con eso, el riesgo aceptado queda acotado y es demostrable.

### Nuevos hallazgos introducidos por las correcciones

**N1 — La reconciliación de auth puede dejar usuarios `ACTIVE` sin credenciales — Media**
- **Referencia:** `design.md › Alta de usuario` pasos 4 y 6. El período de gracia se define como "mayor al timeout total del alta", y auth borra las credenciales `PENDING` más antiguas que la gracia.
- **Problema:** ahora la activación depende de un camino asíncrono (publicador del outbox → RabbitMQ → colas de retardo de 5 s/30 s/2 min → posible DLQ y re-drive manual). Una caída del broker, o un `user.created` que acabe en la DLQ, puede superar la gracia. Auth borraría entonces las credenciales de un usuario que user-service ya marcó `ACTIVE`, y el re-drive posterior ya no encontraría nada que activar. La contraseña inicial no se guarda en ningún otro sitio, así que no hay recuperación automática. Esto rompe el invariante declarado de "nunca `ACTIVE` sin credenciales".
- **Corrección:** auth no borra por antigüedad. Solo borra al recibir `user.deleted`, o tras una gracia larga (horas) mayor que la retención de la DLQ, y siempre deja traza en el log. La limpieza de huérfanos reales la dispara user-service, la fuente de verdad, cuando elimina un `PENDING` vencido (ya llama a `DELETE /internal/credentials`).

**N2 — Orden de eventos roto por las colas de retardo — Media**
- **Referencia:** `design.md › Eventos` (política de reintento con colas de retardo) y `› Alta de usuario` paso 5 (`user.updated` con `DISABLED` y `user.deleted` consumidos por auth).
- **Problema:** si `user.created` entra en la cola de reintento y entretanto llega `user.updated(DISABLED)`, el `user.created` reintentado reactiva las credenciales de un usuario deshabilitado. Ocurre lo mismo con `user.role.assigned` frente a `role.updated` en la proyección. La deduplicación por `eventId` no protege del desorden.
- **Corrección:** versión monotónica por agregado en el payload (`aggregateVersion`, o `updatedAt` de user-service). Los consumidores aplican el evento solo si su versión es mayor que la almacenada en la proyección. La activación por `user.created` solo transiciona `PENDING → ACTIVE`, nunca desde `DISABLED`.

**N3 — Redis pasa a estar en el camino de cada petición autenticada — Media**
- **Referencia:** `design.md › Modelo de datos › Redis` (todos los servicios leen `auth:deny:jti:*` vía `jwt-guard`).
- **Problema:** no se define qué hace `jwt-guard` si Redis no responde. Si falla abierto, la revocación se anula en silencio. Si falla cerrado, una caída de Redis tumba los 5 servicios. Esto contradice que la validación de JWT sea local, y es un fallo en cascada relevante para el Ex4.
- **Corrección:** timeout corto en la consulta y política explícita en ADR-003/`07-resiliencia.md`. Por ejemplo: fallar cerrado solo en operaciones de escritura o administración, fallar abierto con alerta y log en las lecturas, y apoyarse en la vida corta del access token (≤15 min, ya fijada). Añadir la fila "Redis caído" a la matriz de fallos.

**N4 — `access.denied` desde todos los servicios — Baja**
- **Referencia:** `design.md › Catálogo` (nota "Cualquier servicio … publica `access.denied`") y `› Component diagram` (nodo GUARD).
- **Problema:** todos los servicios, incluidos audit y agent, necesitan credenciales de publicación en RabbitMQ. Además, un atacante con un token válido puede amplificar escrituras en Mongo a base de 403.
- **Corrección:** muestreo o rate limit por `sub`/IP en `jwt-guard`, y permisos de publicación del broker limitados a `access.denied` para los servicios que no publican eventos de dominio.

**N5 — Inconsistencias menores de contrato — Baja**
- **Referencias:** `proposal.md › Solution` punto 2 (sigue listando las secciones del ADR sin `## Implementación`); `design.md › APIs` (`/oauth/token` acepta `refresh_token` además de `POST /auth/refresh`: hay dos caminos de refresco, y la cookie con `Path=/api/auth` solo llega a `/oauth/token` si este se publica bajo `/api/auth/`).
- **Corrección:** un único endpoint de refresco (o documentar que `/oauth/token` se expone como `/api/auth/oauth/token`) y alinear `proposal.md`.

**N6 — Cookie `Secure` en el entorno local — Baja**
- **Referencia:** `design.md › JWT` (`HttpOnly; Secure; SameSite=Strict`) con `web :8080` sobre http.
- **Problema:** los navegadores modernos tratan `http://localhost` como contexto seguro, pero si se accede por IP o por otro hostname (por ejemplo, el evaluador desde otra máquina o una VM), la cookie no se envía y el refresco falla en silencio.
- **Corrección:** documentar el acceso por `localhost` en el README de ejecución, o hacer `Secure` configurable vía env para desarrollo.

**Nuevos hallazgos por severidad:** Alta 0 · Media 3 (N1, N2, N3) · Baja 3 (N4, N5, N6).

## Dictamen actualizado

**APROBADO CON OBSERVACIONES.** Los 3 hallazgos de severidad Alta de la ronda 1 (H1, H3, H4) quedan cerrados, con evidencia en el contrato y con gates que los hacen cumplir. 17 de 20 hallazgos están cerrados y no queda ninguno abierto. La desviación del outbox es razonable para el alcance si se añade la mitigación de log de fallback.

Las correcciones introducen 3 problemas de severidad Media, todos en la capa asíncrona: la reconciliación de auth (N1), el orden de eventos (N2) y la política ante la caída de Redis (N3). Se recomienda enmendar `design.md › Alta de usuario`, `› Eventos` y `› Redis` antes de despachar las tareas 1.1 y 1.2, porque ADR-002/003/004 se derivarán literalmente de esas secciones. Son cambios de pocas líneas y no alteran el stack ni las decisiones principales.

## Auditoría de entregables (ronda 3)

- **Fecha:** 2026-10-20 · **Auditor:** el mismo (modelo Opus, externo).
- **Fuentes revisadas:**
  - `docs/adrs/ADR-001` … `ADR-010`.
  - `docs/architecture/01` … `08` y `README.md`.
  - `docs/traceability.md`.
  - El contrato vigente `openspec/changes/design-architecture-docs/design.md`.
  - El PDF.
- **Contexto:** el validador interno dio PASS con 16/18. Esta ronda no repite sus checks estructurales; evalúa el contenido.

### Fidelidad al contrato y regresiones (H1–H20, N1–N3)

Ningún hallazgo previo se reintroduce:
- **Bindings y colas:** los bindings usan `#` (ADR-004, 01, 03) y existe la cola `auth.user-projection`.
- **Redis y revocación:** la excepción `auth:deny:jti:*` está declarada, con fail-open acotado (ADR-003 y 07 › Matriz).
- **Agente:** reenvía el JWT del llamante (ADR-008, 08 › Identidad y datos).
- **RAG:** chunks ≤256 y sin PII en el vector store (ADR-009).
- **Saga:** auth no hace barrido propio (N1: ADR-002 punto 7, 07). El orden por `aggregateVersion` cubre N2 (ADR-004 › Orden).
- **Outbox:** solo en user-service, con `audit.fallback` como respaldo para auth.

Hay degradaciones respecto de la ronda 2, pero **declaradas honestamente como Evolución** en la sección `## Implementación` de cada ADR y en `traceability.md` › Convenciones:
- ACL de Redis (antes H17 Cerrado).
- Rotación del JWKS y discovery OIDC (parte de H5/H13).
- `access.denied` por AMQP: las denegaciones quedan solo en logs y no en audit-service.

Las tres son aceptables para el alcance. La de ACL de Redis se agrava por R3-9.

### Hallazgos

| ID | Severidad | Archivo:sección | Hallazgo | Recomendación |
|---|---|---|---|---|
| R3-1 | Media | `07-resiliencia.md › Compensación del alta`; `ADR-002 › Saga` pasos 5–7 | La compensación borra primero el usuario `PENDING` y después llama a `DELETE /internal/credentials`. El caso típico de compensación es un timeout del `PUT` porque auth está lento, y es justo cuando el `DELETE` también puede agotar reintentos. Entonces quedan credenciales `PENDING` huérfanas en auth: user-service ya no tiene fila que reconciliar y auth "nunca borra automáticamente". Si el usuario se vuelve a registrar con el mismo email, recibe un `409` en cada intento: **el email queda bloqueado de forma permanente** sin camino de recuperación. | Invertir el orden: llamar primero a `DELETE`, y solo cuando se confirme, borrar el `PENDING`. Si el `DELETE` falla, marcar el usuario `FAILED`/`PENDING` para que el barrido con gracia de user-service reintente. Otra opción: que auth acepte un `PUT` con el mismo email si la credencial existente está `PENDING` y es más antigua que la gracia. |
| R3-2 | Media | `07 › Timeouts por arista` (agent→LLM 30 s; web→servicio 30 s de lectura); `ADR-008` punto 5 | El timeout de lectura de nginx (30 s) es igual o menor que el presupuesto del agente: 30 s del LLM, más hasta ~9,6 s de la herramienta agent→user, más los reintentos del SDK ante 429/5xx (que multiplican los 30 s). nginx devuelve 504 antes de que el agente aplique su degradación, y la llamada al LLM sigue consumiendo tokens sin que nadie reciba la respuesta. | Definir un *deadline* total del agente (p. ej. 25 s) que acote el timeout del LLM y los reintentos del SDK (fijar `max_retries` y `timeout` explícitos), y subir `proxy_read_timeout` solo en `/api/agent` (p. ej. 60 s). Documentar los presupuestos como jerarquía: nginx > agente > LLM. |
| R3-3 | Media | `04 › Bloque de diseño` (`x-service-defaults: env_file: [.env]`); `ADR-002 › Postgres` y `› Consecuencias Positivas` | Todos los servicios reciben el `.env` completo: las contraseñas de todas las bases, todos los `client_secret`, la contraseña de administración de Postgres y `ANTHROPIC_API_KEY`. Eso **anula el control que ADR-002 declara** ("un servicio comprometido no puede leer la base de otro con sus credenciales"). | Eliminar `env_file` del ancla común e inyectar en cada servicio solo sus variables (ya están listadas en `environment:`). Como alternativa, usar `.env.<svc>` por servicio. |
| R3-4 | Media | `ADR-003 › Revocación` ("la escribe auth-service (logout, deshabilitación de usuario)"); `06 › Revocación`; `ADR-003 › Alternativa 3` | Al deshabilitar o borrar un usuario, auth no conoce los `jti` de los access tokens vigentes porque no los registra, así que no puede escribirlos en el denylist. La afirmación de que la deshabilitación es efectiva de inmediato, que es justo el argumento con el que se descarta la Alternativa 3, no se puede cumplir con el diseño actual. | Añadir una revocación por sujeto, `auth:deny:sub:{userId} = disabledAt`, con TTL igual a la vida máxima del token: `jwt-guard` rechaza los tokens con `iat < disabledAt`. Es la misma lectura cruzada ya permitida y no hace falta registrar los `jti`. |
| R3-5 | Media | `ADR-003 › Origen del rol`; `design.md › auth_db` (`user_roles_projection.last_version`); `03 › auth.user-projection` | `role.updated` es un evento del agregado `Role`, con su propio `aggregateVersion`, pero se compara con el `last_version` por usuario de `user_roles_projection`, que pertenece al agregado `User`. Son secuencias distintas: el resultado es descartar renombrados válidos o aplicar algunos viejos. | Guardar `role_last_version` por `role_id` (tabla `role_names_projection(role_id, role_name, last_version)`) y resolver el nombre por join. `last_version` por usuario queda solo para eventos `user.*`. |
| R3-6 | Media | `ADR-008 › Decision` 2–3 y `› Alternativa 1`; `traceability.md` EX1-R04 | El Ex1 nombra explícitamente "OpenAI/Azure OpenAI". El ADR elige Anthropic y no da una razón técnica (solo dice que el PDF lo permite en Ex5), y deja el adaptador OpenAI como Evolución. La fila EX1-R04 cita "OpenAI/Azure OpenAI" sin marcar la desviación (solo EX5-R01 la marca). Un evaluador del Ex1 puede leerlo como incumplimiento. | Dar en ADR-008 razones reales y verificables (p. ej. disponibilidad de clave del equipo, calidad del tool use, que embeddings locales hacen innecesaria la API de embeddings) y marcar la desviación en EX1-R04. Mejor aún: implementar el adaptador OpenAI, que cuesta poco detrás del puerto. |
| R3-7 | Baja | `03 › Garantías` ("role-service publica `role.*` directo") frente a `ADR-004 › Garantía de publicación` | ADR-004 solo declara como riesgo aceptado la publicación directa de auth. role-service también publica sin outbox, y `role.updated` alimenta la proyección del claim y la ingesta del agente; el riesgo no está registrado en el ADR. | Añadir role-service al riesgo aceptado de ADR-004, con respaldo `audit.fallback` igual que auth. |
| R3-8 | Baja | `traceability.md › Ejercicio 1`, EX4-R10, EX2-R32 | (a) Falta una fila para la instrucción del Ex1 (autenticación, autorización, **auditoría de accesos**, gestión de roles, escalable). La DoD de la tarea 1.4 exigía referenciar `auth.#` y `access.denied` para "auditoría de accesos"; la palabra no aparece en la matriz y el validador no lo detectó. (b) EX4-R10 asigna el cambio `evaluate-agent-prompts-quality` pero su artefacto es `docs/diagnostico-ex4.md`, que es del cambio 9. (c) EX2-R32 ubica el código de resiliencia en `packages/contracts/` o `packages/jwt-guard/`, que no le corresponden según ADR-001. | Añadir EX1-R19 (instrucción) con `auth.#` y `event=access.denied`; corregir el cambio de EX4-R10; crear `packages/http-client` (transversal) o ubicarlo en `infrastructure/` de cada servicio. |
| R3-9 | Baja | `04 › redis` (sin `requirepass`, `REDIS_URL` sin credenciales); `ADR-002 › Redis` | Sin ACL (Evolución) **y sin contraseña**, cualquier contenedor de la red `backend`, incluidos loki/promtail/grafana del perfil, puede borrar o escribir `auth:deny:jti:*` y anular revocaciones. | Usar al menos `requirepass` con la contraseña en `.env`; es trivial y no requiere ACL. |
| R3-10 | Baja | `04 › Perfil observability` y `› networks` | Valores introducidos por los redactores. El binding de Grafana a `127.0.0.1:3000` bajo un perfil opcional es **correcto**. Pero: (a) Promtail está deprecado y fuera de soporte desde inicios de 2026 (Grafana recomienda Alloy; `needs-verification`); (b) Grafana está en la red `edge` sin necesitarlo; (c) `backend` con `internal: false` da salida a Internet a todas las bases de datos solo porque el agente la necesita. La separación `edge`/`backend` es correcta en intención pero débil en efecto. | Usar Grafana Alloy (o el driver de logs de Loki); dejar Grafana solo en `backend` más el puerto loopback; `backend` `internal: true` y una red `egress` exclusiva para `ai-agent-service`. |
| R3-11 | Baja | `04 › mongo` y `› audit-service` (`MONGO_URL` con `audit_user`) | No hay init de Mongo que cree `audit_user` en `audit_db`, a diferencia del script detallado de Postgres. Con solo `MONGO_INITDB_ROOT_*`, audit-service no podrá autenticarse. Además, los healthchecks usan `wget`, que no viene en las imágenes `node:*-slim` (Debian-slim del agente). | Añadir `infra/mongo/init/01-audit-user.js` (rol `readWrite` sobre `audit_db`); usar un healthcheck en Node (`node -e "fetch(...)"`) o instalar `wget`/`curl`. |
| R3-12 | Baja | `ADR-010 › Alternativa 1`; `ADR-009 › Alternativa 2`; `ADR-010 › Decision` 2 | Hay alternativas débiles o inexactas. "Zustand en lugar de RTK Query" mezcla categorías (gestor de estado frente a capa de datos remota). Chroma también ofrece filtros por metadatos y upsert por id, así que la razón de descarte no se sostiene. Jest se justifica por "coherencia con el runner" cuando la razón real y más fuerte es que **el PDF exige Jest**. | Reformular: "Zustand + TanStack Query" frente a RTK; Chroma descartado por madurez del servidor o recursos (o por preferencia declarada); citar el PDF en ADR-010. |
| R3-13 | Baja | `ADR-004 › Context`; `ADR-004`/`ADR-005` (sin título H1); `08 › Rate limit` frente a `07 › Matriz` (agent→LLM); `08 › Pipeline` (`roleScope` "permite filtrar"); `01 › C4` (flecha punteada Redis→USER) | Errores e inconsistencias menores: (a) ADR-004 dice que "el Ejercicio 4 exige auditoría de accesos"; es el Ex1. (b) Ante un fallo del LLM, 08 degrada a `mock` **o** a fragmentos, mientras 07 solo a fragmentos; servir texto del mock a usuarios reales confunde. (c) El filtro por `roleScope` es opcional ("permite"), no obligatorio. (d) La lectura síncrona del denylist se dibuja con la convención de flecha asíncrona. | Corregir el contexto de ADR-004; fijar la degradación a "solo fragmentos, marcando que no hay generación"; hacer obligatorio el filtro `roleScope` con el rol del JWT; usar flecha continua. |
| R3-14 | Baja | `07 › Timeouts por arista` (user→role 2 s ×3, user→auth 3 s ×4) | Los valores por arista son razonables para un entorno local, pero no hay presupuesto total: el alta puede tardar ~20 s en el peor caso antes de compensar. Además, reintentar 3 veces un `PUT` tras un *timeout* contra un auth lento amplifica la carga, justo el patrón de fallo en cascada del Ex4. | Definir un deadline del alta (p. ej. 8 s) que acote los reintentos; reintentar en *timeout* como máximo una vez y dejar que el breaker corte. La gracia de reconciliación debe ser mayor que ese deadline. |

**Conteo por severidad (ronda 3):** Alta 0 · Media 6 (R3-1 a R3-6) · Baja 8 (R3-7 a R3-14).

### Calidad de los ADRs como registros de decisión

- **Fortalezas:**
  - Contexto, decisión y consecuencias específicos del sistema, no genéricos.
  - Consecuencias negativas honestas (p. ej. ADR-004 admite la pérdida de eventos de auth; ADR-003, la ventana de fail-open).
  - 2–4 alternativas reales por ADR. Las mejores son ADR-003 (Alt. 3 y 4), ADR-005 (Alt. 3) y ADR-002 (Alt. 3), porque registran decisiones tomadas en esta auditoría.
  - La sección `## Implementación` separa con claridad lo implementado de lo que queda como Evolución.
- **Debilidades:**
  - Ver R3-6 y R3-12.
  - En el conjunto, la marca "Implementado en" promete mucho para los 120 min del Ex2: saga, outbox, colas de retardo, `aggregateVersion`, `client_credentials`, rotación de refresh por familia, denylist, argon2id y 4 breakers. Es creíble con el plan de 9 cambios, pero si algo se recorta durante la implementación, el ADR y la matriz deben actualizarse al archivar cada cambio. Si no, el ADR afirmará algo falso.

### Valores introducidos por los redactores

| Valor | Juicio |
|---|---|
| user→role 2 s, user→auth 3 s, agent→user 3 s | Razonables para red local; falta un deadline total (R3-14). |
| agent→LLM 30 s | Razonable para generación no streaming con `max_tokens` acotado; incompatible con los 30 s de nginx (R3-2). |
| Breaker: 5 fallos o 50 %, semiabierto a 30 s | Estándar y correcto. |
| Grafana `127.0.0.1:3000` bajo el perfil `observability` | Correcto: no expone el puerto a la LAN y es opcional. |
| Redes `edge`/`backend` | Bien intencionadas, pero `backend` con `internal: false` neutraliza el beneficio (R3-10). |
| Reintentos de cola 5 s / 30 s / 2 min, N=3 | Correctos; ya estaban en el contrato. |

### Perspectiva de un evaluador del Ejercicio 1

Puntuaría alto en 7 de los 8 criterios:
- Diagramas C4 y de secuencia coherentes.
- Justificación por tecnología con alternativas.
- Flujo de datos detallado.
- Compose que separa lo normativo de lo ilustrativo.
- DDD con agregados e invariantes reales.
- Mapa OWASP, incluido el de LLM.
- Matriz de fallos completa.

"Dockerización completa y funcional" no se puede puntuar solo con documentos (está asignado correctamente al cambio 5).

Lo que falta o resta puntos:
1. Un **resumen ejecutivo de una página** al inicio de `README.md`, con 5–7 decisiones clave y un diagrama. Son unas 2 100 líneas para un ejercicio de 90 min; el evaluador necesita una entrada rápida.
2. Un flujo de **gestión de roles y autorización** (CRUD de rol → `role.permissions.changed` → proyección/agente/auditoría, y dónde se aplica el RBAC). La instrucción del Ex1 lo nombra y solo aparece de forma indirecta.
3. La desviación OpenAI → Anthropic sin justificar en el Ex1 (R3-6).
4. Los errores fácticos de R3-13, que restan credibilidad en una lectura atenta.

## Dictamen ronda 3

**APROBADO CON OBSERVACIONES.**

Los entregables registran fielmente el contrato auditado; ningún hallazgo H1–H20 ni N1–N3 se reintroduce. Las degradaciones a Evolución (ACL de Redis, rotación del JWKS, discovery, `access.denied` por AMQP) están declaradas con honestidad. El paquete es de calidad alta para el Ejercicio 1, y el PASS 16/18 del validador es coherente con este juicio.

No hay hallazgos Alta. Antes de iniciar `bootstrap-monorepo-platform` y `build-*` conviene corregir las 6 Media:
- En los documentos: R3-1 (orden de la compensación), R3-2 (presupuesto de timeouts del agente frente a nginx), R3-4 (revocación por sujeto) y R3-5 (versión de la proyección de rol), en `07`, `ADR-002`, `ADR-003` y `design.md`.
- R3-3 (`env_file` compartido) es un cambio de una línea en `04`.
- R3-6 requiere justificar Anthropic o implementar el adaptador OpenAI.

Las Baja pueden resolverse en los cambios de implementación correspondientes, sobre todo `harden-compose-resilience-security` (R3-9, R3-10, R3-11, R3-14).

## Verificación de cierre (ronda 4)

- **Fecha:** 2026-10-20 · **Auditor:** el mismo (modelo Opus, externo).
- **Fuentes revisadas** (versiones actualizadas):
  - ADRs: `docs/adrs/ADR-002`, `003`, `004`, `005`, `008`, `009` y `010`.
  - Arquitectura: `docs/architecture/01`, `03`, `04`, `06`, `07` y `08`.
  - `docs/traceability.md`.
  - `openspec/changes/design-architecture-docs/design.md` y `handoff.md`.

| Hallazgo | Estado | Evidencia (archivo:sección) | Comentario |
|---|---|---|---|
| R3-1 Orden de la compensación | Cerrado | `ADR-002 › Saga` paso 5; `07 › Compensación del alta` y `› Matriz` (user→auth); `03 › Flujo: alta` | Ahora se llama primero a `DELETE` y solo tras confirmarse se borra el `PENDING`. Si el `DELETE` falla, el usuario sigue `PENDING` y la reconciliación reintenta. El email ya no queda bloqueado. Ver la inconsistencia residual en `design.md` (R4-3). |
| R3-2 Presupuesto del agente frente a nginx | Cerrado | `07 › Presupuestos de tiempo`; `ADR-008` punto 5; `ADR-005` punto 1; `08 › Rate limit` | La jerarquía nginx 40 s > agente 30 s > LLM 20 s es correcta; incluye como máximo 1 reintento, `retry-after` solo si cabe en el presupuesto, y `max_retries`/`timeout` explícitos. Ver la matización de R4-5 sobre `AbortController`. |
| R3-3 `env_file` compartido | Cerrado | `04 › x-service-defaults` (sin `env_file`) y tabla `infra/env/<servicio>.env` | Cada servicio recibe solo sus credenciales, y el control declarado en ADR-002 vuelve a ser cierto. |
| R3-4 Revocación al deshabilitar | Cerrado | `ADR-003 › Revocación` (`auth:deny:user:{userId}` con `iat` < marca); `06 › Autenticación` | Es la solución recomendada. Matiz: la marca se escribe cuando auth *consume* `user.updated(DISABLED)`, así que "de inmediato" significa "tras la latencia del evento" (R4-7). |
| R3-5 Versión de la proyección de rol | Parcial | `ADR-003 › Origen del rol` (`user_last_version`, `role_last_version`); `design.md › auth_db`; `03 › Garantías` | La separación por agregado es correcta. La decisión de **reiniciar `role_last_version` a 0** al recibir `user.role.assigned` reabre una ventana de desorden (R4-2). |
| R3-6 Justificación de Anthropic | Parcial | `ADR-008 › Decision` 2 y `› Alternativa 1`; `traceability.md` EX1-R04 | La desviación está declarada en EX1-R04, que era lo importante para el evaluador. Pero las "razones técnicas" no diferencian: OpenAI también ofrece *function calling* nativo, *prompt caching* y SDK con reintentos. La Alternativa 1 afirma que descartar Anthropic "renuncia" a esas ventajas, y eso es inexacto. Residual: Baja. |
| R3-7 role-service sin outbox | Cerrado | `ADR-004 › Garantía de publicación` (role-service con riesgo aceptado, `audit.fallback` y resincronización al arrancar) | La resincronización introduce R4-4. |
| R3-8 Huecos de la matriz | Cerrado | `traceability.md` EX1-R19 (instrucción del Ex1, con `auth.#` y `access.denied`), EX4-R10 (cambio corregido), EX2-R32 (`apps/*/src/infrastructure/http/`) | — |
| R3-9 Redis sin contraseña | Cerrado | `04 › redis` (`--requirepass`, healthcheck con `REDISCLI_AUTH`); tabla de `.env` | Riesgo menor: `requirepass` en los argumentos del comando es visible con `docker inspect`; es aceptable en local. |
| R3-10 Redes y observabilidad | Parcial | `04 › networks`, `› Principios`, `› alloy`, `› grafana` | Alloy sustituye a Promtail; Grafana sale de `edge` y publica en loopback vía `grafana-ui`; `backend` pasa a `internal: true` y se añade `egress` para el agente. **Pero `edge` sigue sin ser `internal`**, así que los 5 servicios conservan salida a Internet (R4-1). |
| R3-11 Init de Mongo y healthchecks | Cerrado | `04 › Init de Mongo` (`audit_user`, `readWrite` sobre `audit_db`, `authSource`); healthchecks con `node -e fetch(...)` | — |
| R3-12 Alternativas débiles | Cerrado | `ADR-010 › Alternativa 1` (Zustand + TanStack Query, "coherencia, no capacidad"); `ADR-009 › Alternativa 2` (Chroma viable, preferencia declarada); `ADR-010 › Decision` 2 (cita el PDF) | Las alternativas ahora son honestas. |
| R3-13 Errores menores | Cerrado | `ADR-004 › Context` (Ex1); títulos H1 en ADR-004 y ADR-005; `08 › Proveedor mock` (el mock no se usa como degradación); `08 › Pipeline` (`roleScope` **obligatorio**); `01 › C4` (flecha continua de lectura del denylist) | — |
| R3-14 Presupuesto del alta | Cerrado | `07 › Presupuestos de tiempo` (alta ≤10 s; los reintentos cuentan contra el presupuesto); gracia de reconciliación mayor que el presupuesto | La tabla sigue mostrando 3 reintentos user→auth, pero el presupuesto los trunca. Es aceptable. |

**Conteo por estado:** Cerrado 11 · Parcial 3 (R3-5, R3-6, R3-10) · Abierto 0 · Aceptado como riesgo 0.

### Juicio sobre las decisiones propias de los redactores

- **`role_last_version` reiniciado a 0 en `user.role.assigned`:** no es correcto del todo. Ver R4-2.
- **`backend` `internal: true` + `egress` + `grafana-ui`:** el diseño es bueno y la justificación de `grafana-ui` (una red interna no puede publicar puertos) es técnicamente exacta. Sin embargo, esa misma regla aplicada a `edge` revela el hueco de R4-1.
- **Código de resiliencia en `apps/*/src/infrastructure/http/`:** es correcto y coherente con ADR-001 (sin dominio en paquetes compartidos) y con ADR-006 (adaptadores en `infrastructure`). Solo user-service y ai-agent-service hacen llamadas salientes con breaker, así que el comodín `apps/*` sobrepromete. Basta con `apps/{user-service,ai-agent-service}/src/infrastructure/http/`. La duplicación entre dos servicios es menor y aceptable frente a crear un paquete nuevo.

## Nuevos hallazgos (ronda 4)

| ID | Severidad | Archivo:sección | Hallazgo | Recomendación |
|---|---|---|---|---|
| R4-1 | Media | `04 › networks` (`edge: {}`) y `› Principios` ("`egress`… a la que solo se une `ai-agent-service`") | `edge` no es `internal`, y auth, user, role, audit y agent están conectados a ella. En Docker, un contenedor unido a cualquier red no interna tiene salida a Internet, así que los 5 servicios la conservan. La afirmación de que solo el agente tiene salida es falsa, y un servicio comprometido puede exfiltrar datos. `edge` no puede pasar a `internal: true` sin más, porque `web` publica `8080` en ella; es la misma restricción que motivó `grafana-ui`. | Crear una red `public` solo para `web`, para publicar `8080`, y dejar `edge` con `internal: true`, compartida entre `web` y los servicios. Así solo `ai-agent-service` (vía `egress`) y `web` (vía `public`) tienen salida. Añadir a `harden-compose-resilience-security` una verificación: `docker compose exec user-service node -e "fetch('https://example.com')"` debe fallar. |
| R4-2 | Baja | `ADR-003 › Origen del rol` ("se reinicia a 0 y el siguiente `role.updated` la converge") | Tras reasignar al rol R2, `role_last_version = 0` hace que se acepte **cualquier** `role.updated` de R2, incluido uno viejo retrasado en la cola de reintento. Ese evento sobrescribiría el `role_name` vigente traído por `user.role.assigned` con un nombre obsoleto, hasta que llegue otro `role.updated` (los renombrados son raros, así que puede durar mucho). Además, el nombre obsoleto viaja en el claim usado por el RBAC. | Sembrar `role_last_version` con la versión del rol que user-service obtiene al validarlo (`GET /roles/{id}` devuelve `version`; viaja en el payload de `user.role.assigned`), o usar una tabla por rol `role_names_projection(role_id, role_name, last_version)` resuelta por join. Complementario: que el claim use un `code` de rol inmutable en lugar del nombre editable. |
| R4-3 | Baja | `design.md › Alta de usuario` paso 6 (reconciliación: "los elimina y llama `DELETE`") frente a `07 › Reconciliación` y `ADR-002` paso 5 | El contrato describe la reconciliación con el orden antiguo (borrar y luego `DELETE`), contrario al orden corregido en 07 y en ADR-002. Como `design.md` es la fuente de verdad de los cambios siguientes, un implementador podría seguirlo. | Alinear `design.md` con este texto: "llama `DELETE` y, solo cuando se confirma, elimina el `PENDING`". |
| R4-4 | Baja | `ADR-004 › Garantía de publicación` (role-service "republica el estado vigente" al arrancar) | Si la resincronización emite eventos `role.updated` con `eventId` nuevos, `audit.events` (binding `role.#`) registrará cambios de rol falsos en cada reinicio de role-service, contaminando la auditoría. El agente, además, reingesta el catálogo. | Usar un tipo distinto (`role.snapshot`) sin binding hacia `audit.events`, o un `eventId` determinista (hash de `roleId` + `aggregateVersion`) para que audit lo deduplique. |
| R4-5 | Baja | `ADR-008` punto 5, `07 › Presupuestos`, `08 › Agotamiento` ("sin consumo de tokens huérfano") | Cancelar con `AbortController` una petición **no streaming** cierra la conexión del cliente, pero no garantiza que el proveedor deje de generar y facturar. La afirmación es demasiado fuerte. | Usar streaming (cerrar el stream sí detiene la generación) o rebajar la afirmación a "se deja de esperar; el consumo ya iniciado puede facturarse". En ambos casos, `max_tokens` acota el coste. |
| R4-6 | Baja | `04 › alloy` (`/var/run/docker.sock:ro`) | Montar el socket de Docker, aunque sea `:ro`, da acceso completo a la API de Docker, equivalente a root en el host. Está limitado al perfil opcional, pero no se declara como riesgo. | Leer los ficheros de `/var/lib/docker/containers` o usar el driver de logs de Loki; si se mantiene el socket, declararlo en `› Evolución` o en los riesgos de 06. |
| R4-7 | Baja | `ADR-003 › Revocación` ("la deshabilitación es efectiva de inmediato") | `auth:deny:user` se escribe al consumir `user.updated(DISABLED)` del outbox. Con el broker caído, o el evento en reintento o DLQ, la deshabilitación se demora lo mismo; con Redis caído, el fail-open la anula. | Reformular como "efectiva tras la propagación del evento (normalmente segundos)". Opcional: que user-service invoque `POST /internal/revoke/{userId}` de forma síncrona además del evento. |

**Conteo de nuevos hallazgos:** Alta 0 · Media 1 (R4-1) · Baja 6 (R4-2 a R4-7).

## Dictamen ronda 4

**APROBADO CON OBSERVACIONES.**

Las 14 observaciones de la ronda 3 están atendidas: 11 cerradas, 3 parciales y ninguna abierta. Las 6 de severidad Media de la ronda 3 quedan cerradas (R3-1 a R3-4) o reducidas a residual Baja (R3-5, R3-6). No hay regresiones de H1–H20 ni de N1–N3.

Queda **un único hallazgo Media nuevo (R4-1)**: la red `edge` sigue dando salida a Internet a los 5 servicios, en contra de lo que declara el diseño. Se corrige con una red `public` solo para `web` y `edge` como `internal: true`. Puede resolverse en `harden-compose-resilience-security`, con una verificación ejecutable, sin bloquear el archivado de este cambio documental.

R4-3 (orden de la reconciliación en `design.md`) es de una línea y conviene corregirlo antes de archivar, porque `design.md` es el contrato de los cambios siguientes. El resto de las Baja (R4-2, R4-4 a R4-7) pueden asignarse a los cambios de implementación correspondientes.

Desde la perspectiva de un evaluador del Ejercicio 1, el paquete está listo.

## Verificación de cierre (ronda 5)

- **Fecha:** 2026-10-20 · **Auditor:** el mismo (modelo Opus, externo).
- **Alcance:** comprobación breve del cierre de R4-1 a R4-7 y de los parciales R3-5, R3-6 y R3-10.

| Hallazgo | Estado | Evidencia (archivo:sección) | Comentario |
|---|---|---|---|
| R4-1 Salida a Internet por `edge` | Cerrado | `04 › networks` (`public` solo para `web`; `edge` y `backend` con `internal: true`; `egress` solo para el agente) y `› Principios` | Correcto: solo `web` (vía `public`) y `ai-agent-service` (vía `egress`) tienen salida. Hay una verificación ejecutable asignada a `harden-compose-resilience-security`. |
| R4-2 Reinicio de `role_last_version` | Cerrado | `ADR-003 › Origen del rol` (`user_roles_projection` + `role_names_projection(role_id, role_name, last_version)`, nombre resuelto por join, sin reinicios) | Es la solución recomendada; no quedan referencias al reinicio a 0. El `code` inmutable queda como Evolución. |
| R4-3 Orden de la reconciliación en el contrato | Cerrado | `design.md › Alta de usuario` paso 6 | Ahora se llama a `DELETE` y solo tras confirmarse se borra el `PENDING`, igual que en 07 y ADR-002. |
| R4-4 Resincronización de role-service | Cerrado | `ADR-004 › Garantía de publicación` (`actor=system`, `reason=resync`) | Es aceptable. La responsabilidad recae en audit-service, que debe aplicar el filtro; queda como criterio de prueba en `build-user-audit-services`. Un tipo `role.snapshot` habría sido más robusto, pero no es necesario. |
| R4-5 Afirmación sobre `AbortController` | Cerrado | `ADR-008` punto 5; `07 › Presupuestos`; `08 › Agotamiento` | La afirmación es ahora exacta: el consumo puede facturarse, `max_tokens` lo acota y el streaming queda como Evolución. |
| R4-6 Socket de Docker en Alloy | Cerrado | `04 › alloy` y `› Evolución` | El riesgo está declarado, con una alternativa y la restricción de usar el perfil solo en desarrollo. |
| R4-7 "Efectiva de inmediato" | Cerrado | `ADR-003 › Revocación`; `06 › Autenticación` | Ahora dice "tras la propagación del evento" y menciona el broker caído y el fail-open de Redis. |
| R3-5 Versión de la proyección de rol | Cerrado | Ver R4-2 | — |
| R3-6 Justificación de Anthropic | Cerrado | `ADR-008 › Decision` 2 (reconoce que las capacidades no son diferenciadoras; elige por disponibilidad de clave y preferencia del equipo); EX1-R04 declara la desviación | Ahora es honesto y verificable. |
| R3-10 Redes y observabilidad | Cerrado | Ver R4-1 y R4-6 | — |

**Conteo por estado:** Cerrado 10 · Parcial 0 · Abierto 0.

Matiz menor, sin acción requerida: `ADR-003 › Alternativa 3` todavía dice que, sin denylist, la deshabilitación "no tendría efecto inmediato". Es correcto en términos relativos: segundos frente a la vida completa del token.

## Dictamen final

**APROBADO.** El cambio `design-architecture-docs` puede archivarse.

A lo largo de cinco rondas se resolvieron todos los hallazgos:
- **H1–H20:** 17 cerrados; H7 (outbox solo en user-service) y H16 (inconsistencias de proceso) aceptados como riesgo; H6 cerrado en rondas posteriores.
- **N1–N3:** cerrados.
- **R3-1 a R3-14:** cerrados.
- **R4-1 a R4-7:** cerrados.

No queda ningún hallazgo abierto de severidad Alta, Media o Baja. Los recortes de alcance están declarados como Evolución con riesgo aceptado en la sección `## Implementación` de cada ADR y en `docs/traceability.md`:
- Outbox de auth y de role.
- `access.denied` por AMQP.
- Rotación del JWKS y discovery OIDC.
- ACL de Redis.
- Adaptador OpenAI/Azure.
- Streaming del LLM.

Seguimientos para los cambios de implementación (no bloquean el archivado):
1. `harden-compose-resilience-security`: ejecutar la verificación de egress de R4-1.
2. `build-user-audit-services`: implementar y probar el filtro `reason=resync` en audit-service (R4-4).
3. Cada cambio debe actualizar la marca "Implementado en / Evolución" de los ADRs y el estado de la matriz al archivar, para que la documentación siga siendo veraz.
