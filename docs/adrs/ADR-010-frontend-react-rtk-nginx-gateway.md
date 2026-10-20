---
id: ADR-010
title: Frontend React + RTK Query con nginx como reverse proxy / gateway ligero
status: accepted
date: 2026-10-20
tier: 0
tags: [adr, tier-0, frontend, nginx, seguridad]
---

# ADR-010 — Frontend y reverse proxy

## Context
La consola de usuarios debe consumir cinco APIs sin exponer sus puertos ni complicar CORS. El PDF admite "servicio de agregación simple o BFF básico si es necesario". Los tokens en el navegador son un vector de robo (XSS), y el login es objetivo de fuerza bruta.

## Decision
1. **React 18 + Vite + TypeScript**, estado con **Redux Toolkit + RTK Query**.
2. **Pruebas con Jest + React Testing Library (no Vitest)**: el PDF exige Jest, y además es el runner de los servicios (ADR-007). Un módulo `config.ts` envuelve `import.meta.env` y se mockea en Jest, porque Jest no interpreta `import.meta`.
3. **nginx como reverse proxy / gateway ligero** (no "BFF": no media ni transforma tokens). Sirve el SPA y enruta `/api/{auth,users,roles,audit,agent}` al servicio correspondiente (mismo origen, sin CORS). No enruta `/internal/*` ni `/oauth/*`.
4. **Access token solo en memoria** del cliente (nunca `localStorage`).
5. **Refresh token en cookie `HttpOnly; SameSite=Strict; Path=/api/auth`**; `Secure` configurable por entorno (desactivable en desarrollo HTTP; se documenta acceder por `localhost`). Único camino de refresco: `POST /auth/refresh`.
6. **`limit_req` en `/api/auth/login`** en nginx, complementando `auth:rl:login:{ip}` en Redis.
7. Cabeceras de seguridad básicas (CSP restrictiva, `X-Content-Type-Options`) en nginx.

## Consequences
### Positivas
- Mismo origen: sin CORS y con una sola superficie pública (puerto 8080).
- La cookie HttpOnly mantiene el refresh fuera del alcance de JavaScript; el access token en memoria limita el impacto de XSS.
- Un solo runner de pruebas (Jest, exigido por el PDF) en todo el monorepo.

### Negativas y riesgos
- El access token en memoria se pierde al recargar: se recupera con `POST /auth/refresh`.
- nginx es punto único de entrada; su caída corta el acceso web (los servicios siguen vivos).
- `limit_req` por IP puede afectar a usuarios tras NAT compartido.
- Con `Secure` activo, el refresh solo funciona por HTTPS o `localhost`.
- Mockear `import.meta.env` añade un módulo de indirección que debe respetarse.

## Alternatives considered
### Alternativa 1 — Zustand + TanStack Query en lugar de Redux Toolkit + RTK Query
Por qué se descartó: Zustand (estado de cliente) junto con TanStack Query (datos remotos) cubre las mismas necesidades y es una opción válida. Se prefiere Redux Toolkit porque un único modelo (slices + RTK Query) gestiona el estado de sesión y la caché de las cinco APIs con devtools y convenciones uniformes, y reduce una dependencia. El criterio es de coherencia, no de capacidad.

### Alternativa 2 — Gateway NestJS como quinto servicio
Por qué se descartó: añade un servicio que mantener y un punto de mediación de tokens innecesario; nginx cubre enrutado y rate limit.

### Alternativa 3 — Tokens en localStorage
Por qué se descartó: legibles por cualquier script (XSS); la cookie HttpOnly lo evita.

## Implementación
- **Implementado en `build-frontend-user-console`**: SPA, `config.ts`, pruebas Jest + RTL, nginx con enrutado y `limit_req`.
- **Implementado en `harden-compose-resilience-security`**: cabeceras de seguridad y ajuste de `Secure` por entorno.
- **Evolución**: HTTPS terminado en el proxy con certificados gestionados.
