# Checklist de pruebas manuales — web (`apps/web`)

Cada caso indica el test de Playwright que lo automatiza (`archivo.spec.ts` › título).
Requiere el sistema levantado con `docker compose up --build` y la web en `http://localhost:8080`.

## Autenticación (`auth.spec.ts`)

- [ ] Login con credenciales inválidas muestra un mensaje de error — `auth.spec.ts` › login inválido muestra un error
- [ ] Login de admin aterriza en Inicio con las cinco tarjetas (Usuarios, Roles, Permisos, Auditoría, Agente) — `auth.spec.ts` › login de admin aterriza en Inicio con las cinco tarjetas
- [ ] Salir devuelve a la pantalla de login — `auth.spec.ts` › salir devuelve a la pantalla de login
- [ ] Entrar a `/users` sin sesión redirige a login — `auth.spec.ts` › /users sin sesión redirige a login

## Permisos por rol (`permissions.spec.ts`)

- [ ] Auditor ve solo Auditoría en la navegación y en Inicio — `permissions.spec.ts` › auditor ve solo Auditoría y no puede listar usuarios
- [ ] Auditor en `/users` recibe error de permiso y no ve la tabla — `permissions.spec.ts` › auditor ve solo Auditoría y no puede listar usuarios
- [ ] Rol personalizado con solo `agent:ask` aterriza en Inicio con la tarjeta Agente — `permissions.spec.ts` › rol personalizado con solo agent:ask aterriza en Inicio con la tarjeta Agente
- [ ] Operador ve Usuarios pero no tiene el botón "Nuevo usuario" — `permissions.spec.ts` › operador ve Usuarios pero no el botón Nuevo usuario

## Usuarios (`users.spec.ts`)

- [ ] Admin crea un usuario desde el diálogo y aparece con el filtro de búsqueda — `users.spec.ts` › admin crea un usuario desde el diálogo y lo encuentra con el filtro
- [ ] Editar el nombre de un usuario se refleja en la tabla — `users.spec.ts` › editar el nombre de un usuario se refleja en la tabla
- [ ] Cambiar el rol en línea asigna el nuevo rol — `users.spec.ts` › cambiar el rol en línea asigna el nuevo rol
- [ ] Eliminar un usuario pide confirmación y lo quita de la tabla — `users.spec.ts` › eliminar un usuario pide confirmación y lo quita de la tabla

## Roles y permisos (`roles.spec.ts`)

- [ ] Crear un rol con casillas de permisos — `roles.spec.ts` › crear un rol con casillas de permisos
- [ ] La opción "Todos los permisos (*)" deshabilita las demás — `roles.spec.ts` › "Todos los permisos (*)" deshabilita los demás permisos
- [ ] Editar la descripción de un rol — `roles.spec.ts` › editar la descripción de un rol
- [ ] La pantalla de roles no ofrece botón para eliminar un rol — `roles.spec.ts` › la pantalla de roles no ofrece eliminar un rol
- [ ] La matriz de Permisos muestra la columna del rol nuevo — `roles.spec.ts` › la matriz de Permisos muestra la columna del rol nuevo

## Auditoría (`audit.spec.ts`)

- [ ] Tras crear un usuario, el filtro Tipo=`user` muestra eventos `user.created` — `audit.spec.ts` › tras crear un usuario, Tipo=user muestra eventos user.created
- [ ] El filtro Actor=`sys` muestra eventos del sistema o un resultado vacío, sin error — `audit.spec.ts` › Actor=sys muestra eventos del sistema o un vacío, sin error
- [ ] La paginación muestra los controles Anterior y Siguiente — `audit.spec.ts` › la paginación muestra Anterior y Siguiente

## Agente (`agent.spec.ts`)

- [ ] Admin carga un `.md` en "Cargar conocimiento" y aparece "Documento indexado" — `agent.spec.ts` › admin indexa un .md desde Cargar conocimiento
- [ ] Preguntar por el contenido indexado devuelve la respuesta y la fuente citada — `agent.spec.ts` › pregunta sobre el contenido indexado devuelve la fuente citada
- [ ] Un usuario sin `agent:ingest` no ve el selector de modo — `agent.spec.ts` › sin agent:ingest no aparece el selector de modo

## No automatizado

Estos puntos siguen siendo manuales:

- Revisión visual (tipografía, espaciados, colores, estados de hover y foco) en cada pantalla.
- Diseño responsive en móvil y tablet.
- Accesibilidad con lector de pantalla real (la suite solo comprueba roles, etiquetas y estados disabled).
- Respuestas reales del agente con API key de Anthropic (la suite asume el LLM mock, sin `ANTHROPIC_API_KEY`).
- Calidad de las respuestas del agente (relevancia, redacción, alucinaciones).
- Flujos de error de red intermitente o caída de servicios individuales (Redis, RabbitMQ, Qdrant).
- Expiración del access token y renovación de sesión en pestañas de larga duración.
- Limitación de intentos de login por nginx (429) fuera de los reintentos de la suite.
- Cambio de estado de usuario (ACTIVE/DISABLED) desde la interfaz, que la web actual no ofrece.
