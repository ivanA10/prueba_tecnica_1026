---
spec: owasp-security-verification
change: harden-compose-resilience-security
wave: 1
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — owasp-security-verification

## ADDED Requirements

## Wave 1 — OWASP mapeado a código

### Requirement: Checklist con evidencia por riesgo
`docs/security/owasp-checklist.md` SHALL tener una fila por cada riesgo de la tabla `## OWASP` de `docs/architecture/06-seguridad-escalabilidad.md` con: control, archivo(s) reales que lo implementan, comprobación (comando o prueba) y estado (`Verificado` o `Corregido en este cambio` con referencia a la prueba de regresión). Ninguna fila SHALL tener evidencia que apunte a una ruta inexistente.

#### Scenario: Evidencia resoluble
- **WHEN** se extraen las rutas en backticks de la columna de archivos
- **THEN** todas existen en el repositorio

### Requirement: Comprobador estático repetible
`scripts/check-owasp.sh` SHALL salir con código 0 solo si: los 5 servicios cablean `ValidationPipe` con `whitelist: true` y `forbidNonWhitelisted: true` y `helmet`; no existen `$queryRawUnsafe` ni `$executeRawUnsafe` en `apps/`; `audit-service` sanea operadores `$` en los filtros; `argon2` aparece solo en `auth-service`; existen `auth:rl:login` (auth) y `agent:rl:` (agente); los 5 servicios usan `JwtAuthGuard` de `@toka/jwt-guard`; cada `apps/*/Dockerfile` declara `USER` no root; `.gitignore` cubre `.env` y `secrets/`; existe `pnpm-lock.yaml`. SHALL imprimir `OK:`/`FAIL:` por control.

#### Scenario: Brecha detectada
- **WHEN** un servicio no declara `forbidNonWhitelisted: true`
- **THEN** el script imprime `FAIL:` con el servicio y sale con código distinto de 0

### Requirement: Correcciones mínimas y probadas
Una brecha detectada SHALL corregirse con el cambio mínimo en el servicio dueño (cableado, sin rediseño) y una prueba de regresión, y SHALL registrarse en el checklist. El total de pruebas añadidas por este cambio SHALL ser ≤6.

#### Scenario: Corrección registrada
- **WHEN** se corrige una brecha
- **THEN** la fila del checklist indica `Corregido en este cambio` y cita la prueba
