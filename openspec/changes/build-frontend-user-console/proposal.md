# Proposal — build-frontend-user-console

> Change 6 de 9. Cubre el Ejercicio 3 del PDF (frontend): consola React 18 + TypeScript para gestionar usuarios, roles, auditoría y consultar al agente IA, servida por nginx (reverse proxy / gateway ligero) y añadida al `docker-compose.yml`.
> Artefactos generados a mano conforme a `schemas/spec-frontmatter.md` y `schemas/task-format.md` (el CLI `opsx` y el skill `forge:propose` no están disponibles en el sub-agente planner; ver "Plan metadata" en design.md).

**En simple:** Se construye `apps/web`: una aplicación de una sola página con login, tabla de usuarios (crear, editar, borrar, asignar rol), lista de roles, visor de auditoría y un panel de chat con el agente. Muestra estados de carga y de error, valida formularios y avisa con notificaciones. El navegador solo habla con nginx (puerto 8080), que sirve la app y reenvía `/api/*` a los cinco servicios. Las pruebas usan Jest + React Testing Library con la red simulada, así que no dependen de que los backends existan.

## Esquema de identificadores

- Épica: `EP-EX3` (Ejercicio 3 — Frontend). Historias `US-EX3-NN`.

| Historia | Descripción |
|---|---|
| US-EX3-01 | App `apps/web` (React 18 + Vite + TS) con Jest + RTL (jsdom) y `config.ts` que envuelve `import.meta.env` |
| US-EX3-02 | Sesión: access token solo en memoria, refresh por cookie HttpOnly y reintento único ante 401 |
| US-EX3-03 | Login con validación de formulario y rutas protegidas |
| US-EX3-04 | Gestión de usuarios (lista, alta, edición, baja) y asignación de rol |
| US-EX3-05 | Listado de roles |
| US-EX3-06 | Visor de auditoría con filtros y paginación |
| US-EX3-07 | Panel de chat con el agente IA |
| US-EX3-08 | Estados transversales: carga, error y feedback visual (notificaciones) |
| US-EX3-09 | nginx gateway ligero, Dockerfile multi-stage y servicio `web` en compose |
| US-EX3-10 | Verificación integral (cobertura ≥70 %, build, lint, docker) y trazabilidad |

## Problem

El PDF (Ejercicio 3) exige un frontend React + TypeScript con gestión de estado, consumo de los microservicios, estados de carga y error, validación de formularios, feedback visual, pruebas Jest + RTL y ejecución dentro del `docker-compose.yml`. Los backends (cambios 3, 4 y 7) se construyen en paralelo, por lo que el frontend no puede depender de servicios vivos para desarrollarse ni para probarse.

## Solution

1. **App** `apps/web` (paquete pnpm de nombre `web`): Redux Toolkit + RTK Query sobre Fetch API, react-router, react-hook-form + zod (ADR-010).
2. **Sesión**: token en el estado Redux (memoria); al arrancar se llama una vez a `POST /api/auth/refresh`; un `baseQuery` con reautenticación (refresh único en vuelo) reintenta una vez ante 401 y cierra sesión si el refresh falla.
3. **Pantallas**: login, usuarios (con rol), roles, auditoría, agente. Componentes compartidos de carga, error y notificación.
4. **Pruebas** Jest 29 + RTL con `fetch` simulado (`jest.fn`), sin MSW; `config.ts` mapeado a un mock en Jest.
5. **Entrega**: nginx (plantilla con `envsubst`, resolver dinámico, `limit_req` en login, sin rutas `/internal` ni `/oauth`), Dockerfile multi-stage con contexto en la raíz y servicio `web` en `docker-compose.yml` (sin `depends_on`; ver design D6).

## Scope

- `apps/web/**` (código, pruebas, Dockerfile, plantilla nginx, `.dockerignore`).
- `docker-compose.yml`: solo el servicio `web`.
- `docs/traceability.md`: filas EX3 de este cambio a `Implementado` (excepto EX3-R19, del cambio 9).

## Out of scope

- Backends y su contrato real (cambios 3, 4, 7): aquí se asumen formas de API declaradas `needs-verification` (design.md).
- `depends_on` de `web` hacia los servicios, cabeceras de seguridad (CSP, `X-Content-Type-Options`), `Secure` por entorno: cambio 5 (ADR-010 → Implementación).
- `apps/web/README.md` (EX3-R19): cambio 9.
- E2E con navegador (Playwright), i18n, tema oscuro, paginación avanzada o edición masiva.
- Diseño visual en Figma: no existe; `mockup_ref: n/a` (UI funcional sin mockup).

## Success criteria

1. `pnpm --filter web test -- --coverage` pasa con ≥70 % de líneas y ≤30 pruebas en total.
2. `pnpm --filter web build` y `pnpm --filter web lint` terminan con código 0.
3. `docker build -f apps/web/Dockerfile -t toka-web .` construye la imagen y `nginx -t` es válido sin backends.
4. `docker compose config -q` pasa con el servicio `web`; `docker compose up -d --no-deps --wait web` queda sano, sirve el SPA y `/internal/*` y `/oauth/*` devuelven 404.
5. El token de acceso nunca se escribe en `localStorage`/`sessionStorage`; el refresco usa solo `POST /api/auth/refresh`.
6. Cada pantalla muestra estado de carga, de error y feedback de éxito; los formularios validan con zod antes de enviar.
