---
spec: observability-and-docs
change: harden-compose-resilience-security
wave: 0,2
epics: EP-EX2
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — observability-and-docs

> Spec canónica promovida desde el cambio archivado `harden-compose-resilience-security` (as-built, 2026-10-21).

## Requirements

### Requirement: Sección de ejecución en el README
`README.md` SHALL documentar los requisitos (Docker con Compose v2, Git Bash / bash, `openssl`, Node 22 + pnpm para pruebas), la puesta en marcha (`bash scripts/bootstrap-env.sh`, `docker compose up -d --build --wait`, `bash scripts/smoke.sh`, `docker compose down` con `-v` opcional), la URL `http://localhost:8080` (puerto configurable con `WEB_PORT`) y dónde leer las credenciales del administrador semilla (`ADMIN_SEED_PASSWORD` en `infra/env/user-service.env`) sin incluir su valor.

#### Scenario: Comandos documentados
- **WHEN** se busca `bootstrap-env.sh`, `up -d --build --wait` y `smoke.sh` en el README
- **THEN** los tres aparecen en la sección de puesta en marcha

#### Scenario: Sin secretos en el README
- **WHEN** se lee la sección de credenciales del administrador
- **THEN** indica el archivo y la variable, no la contraseña

## Evolución

- Perfil compose `observability` (Loki + Grafana Alloy + Grafana en `127.0.0.1:3000`) con `GRAFANA_ADMIN_PASSWORD` generado por `scripts/bootstrap-env.sh`; hoy los logs se consultan con `docker compose logs`.
- `docs/architecture/09-ddd-clean-aplicado.md` con las capas reales por servicio.
- Reconciliación de `docs/architecture/04-docker-compose-diseno.md` con el compose real y filas de este cambio en `docs/traceability.md` en `Implementado`.
