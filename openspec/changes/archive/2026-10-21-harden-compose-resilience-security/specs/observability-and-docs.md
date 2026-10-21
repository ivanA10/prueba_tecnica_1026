---
spec: observability-and-docs
change: harden-compose-resilience-security
wave: 0,2
epics: EP-EX2
status: draft
created: 2026-10-20
---

# Spec — observability-and-docs

## ADDED Requirements

## Wave 0 — Perfil `observability`

### Requirement: Logs centralizados opcionales
El compose SHALL definir `loki`, `alloy` (Grafana Alloy) y `grafana` con `profiles: [observability]`, la red `grafana-ui` y el puerto de Grafana solo en `127.0.0.1:3000`. Sin el perfil activo NO SHALL crearse ninguno de estos contenedores. `GRAFANA_ADMIN_PASSWORD` SHALL existir en `.env.example` y generarse (sin `change-me`) por `scripts/bootstrap-env.sh`, que sigue siendo idempotente. Grafana SHALL tener el datasource de Loki aprovisionado.

#### Scenario: Perfil inactivo
- **WHEN** se ejecuta `docker compose config --services` sin perfil
- **THEN** la lista no incluye `loki`, `alloy` ni `grafana`

#### Scenario: Perfil activo
- **WHEN** se ejecuta `docker compose --profile observability config -q`
- **THEN** termina con código 0 y `grafana` publica solo `127.0.0.1:3000`

## Wave 2 — Documentación

### Requirement: Sección de ejecución en el README
`README.md` SHALL documentar en ≤6 comandos: requisitos (Docker, Git Bash en Windows), `bash scripts/bootstrap-env.sh`, `docker compose up -d --build --wait`, URL `http://localhost:8080`, credenciales del administrador semilla (dónde leerlas, sin valores reales), `bash scripts/smoke.sh`, cómo activar `observability`, la receta `docker compose logs <servicio> | jq 'select(.correlationId=="<id>")'`, cómo detener (`docker compose down -v`) y la nota de `localhost` para la cookie `Secure`.

#### Scenario: Comandos documentados
- **WHEN** se busca `bootstrap-env.sh`, `up -d --build --wait` y `smoke.sh` en el README
- **THEN** los tres aparecen en la sección de ejecución

### Requirement: DDD/Clean aplicado por servicio
`docs/architecture/09-ddd-clean-aplicado.md` SHALL describir, para cada uno de los 5 servicios, las capas reales (`domain`, `application`, `infrastructure`, `interfaces` o las que existan), el agregado principal, puertos/adaptadores y dónde se aplica CQRS ligero, citando **solo rutas existentes** y señalando cualquier desviación respecto a `05-ddd-clean-cqrs.md` (qué se implementó distinto y por qué).

#### Scenario: Rutas citadas existen
- **WHEN** se extraen las rutas `apps/...` en backticks del documento
- **THEN** todas existen en el repositorio

### Requirement: Reconciliación y trazabilidad
`docs/architecture/04-docker-compose-diseno.md` SHALL reflejar el compose real (etiquetas, healthchecks y comandos definitivos) y corregir referencias obsoletas (p. ej. "definiciones de exchange" en infraestructura). `docs/traceability.md` SHALL pasar a `Implementado` las filas EX1-R17, EX2-R07, EX2-R12, EX2-R13, EX2-R14, EX2-R16, EX2-R17, EX2-R29, EX2-R31, EX2-R32, EX5-R11, EX0-R05 y EX0-R06 con los artefactos reales.

#### Scenario: Sin filas pendientes de este cambio
- **WHEN** se filtran las filas cuyo cambio es `harden-compose-resilience-security`
- **THEN** ninguna conserva el estado `Planeado`, salvo las marcadas Evolución
