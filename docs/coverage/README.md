# Cobertura de pruebas unitarias

Fecha de generación: 2026-10-21

| Paquete | Tests | % statements | % branches | % functions | % lines | Umbral (70 líneas) |
|---|---|---|---|---|---|---|
| apps/auth-service | 15/15 | 95.37 | 79.47 | 92.85 | 96.36 | cumple |
| apps/user-service | 21/21 | 81.92 | 49.15 | 72.28 | 84.1 | cumple |
| apps/role-service | 9/9 | 91.21 | 72.88 | 96.96 | 92.5 | cumple |
| apps/audit-service | 13/13 | 83.75 | 64.93 | 60.71 | 85.71 | cumple |
| apps/ai-agent-service | 26/26 | 94.23 | 77.23 | 94.4 | 97.15 | cumple |
| apps/web | 30/30 | 87.52 | 85.06 | 85.06 | 88.67 | cumple |
| packages/contracts | 5/5 | 95 | 89.47 | 100 | 93.93 | cumple |
| packages/logger | 5/5 | 98.27 | 65.71 | 100 | 98.03 | cumple |
| packages/jwt-guard | 9/9 | 94.05 | 76.56 | 100 | 95.18 | cumple |
| packages/http-client | 5/5 | 92.62 | 83.95 | 83.33 | 98.05 | cumple |

Valores tomados de la fila "All files" de cada ejecución.

Nota: en una primera ejecución de ai-agent-service falló 1 test de 26 (no identificado); la repetición pasó 26/26. Las cifras de la tabla son de la repetición.

## Reproducir

```bash
corepack pnpm -r --filter "!@toka/e2e" test -- --coverage
```

(o, por paquete: `cd apps/<x> && corepack pnpm test -- --coverage`).

## Informes HTML

`apps/<x>/coverage/lcov-report/index.html` (ignorados por git).

## E2E

Suite Playwright, 22 tests; se ejecuta con `pnpm --filter @toka/e2e e2e` contra `docker compose`. Ver `e2e/CHECKLIST.md`. No se incluye en esta tabla.
