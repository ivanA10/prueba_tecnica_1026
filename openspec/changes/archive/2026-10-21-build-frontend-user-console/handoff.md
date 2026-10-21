# Handoff — build-frontend-user-console

Multi-wave (3 waves, 11 tareas). Detalle en `tasks.md`.

| Wave | Tareas | Contenido | Entrega a la siguiente wave |
|---|---|---|---|
| 0 | 1.1, 1.2, 1.3, 1.4 | Andamiaje + Jest jsdom + `config.ts`; store/API/sesión + `routes.tsx` con páginas stub; componentes compartidos; nginx + Dockerfile + servicio `web` | Store, `baseQueryWithReauth`, `api.injectEndpoints`, `renderWithProviders`, `mockFetchRoutes`, componentes de feedback, páginas stub y rutas |
| 1 | 2.1–2.5 | Login/RequireAuth/Layout; usuarios; roles; auditoría; agente (paralelo; cada tarea reemplaza su página stub) | Todas las pantallas con pruebas |
| 2 | 3.1, 3.2 | Cobertura/build/lint/smoke Docker; trazabilidad | Cambio listo para verificar y archivar |

Convenios compartidos: alias `@/`; solo `@/config` usa `import.meta`; pruebas en `src/**/__tests__/*.test.tsx`; presupuesto 25 pruebas (techo 30); formas de API supuestas en `design.md` (`needs-verification`) y centralizadas en `src/api/types.ts`.

Cambio 5 (`harden-compose-resilience-security`) hereda de este: `depends_on` de `web` hacia los 5 servicios, cabeceras de seguridad (CSP, `X-Content-Type-Options`), `Secure` por entorno y reconciliación de `build: ./apps/web` (04) con el contexto raíz usado aquí.
