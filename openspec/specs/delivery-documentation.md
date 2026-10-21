---
spec: delivery-documentation
change: document-diagnosis-delivery
wave: 2
epics: EP-DLV
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — delivery-documentation

> Spec canónica promovida desde el cambio archivado `document-diagnosis-delivery` (as-built, 2026-10-21).

## Requirements

### Requirement: README raíz de ejecución del sistema
`README.md` SHALL describir el sistema (tabla de componentes con puertos internos: `web` como UI y gateway `/api/*` publicado en `8080`, los 5 microservicios y la infraestructura en redes internas), los requisitos, la puesta en marcha (`bash scripts/bootstrap-env.sh`, `docker compose up -d --build --wait`, `bash scripts/smoke.sh`, `docker compose down`), las URLs (`http://localhost:8080`, `/healthz`, rutas `/api/*`, `WEB_PORT` configurable), el uso del agente (proveedor `mock` sin `ANTHROPIC_API_KEY`, activación de un LLM real, evaluación), las pruebas (Jest con umbral de 70 % de líneas, e2e Playwright contra el stack levantado, resumen de cobertura), una tabla `Alcance entregado y evolución` por ejercicio del PDF y los enlaces de documentación (`docs/architecture/README.md`, `docs/adrs/`, `docs/traceability.md`, `docs/diagnostico-ex4.md`, `docs/prompt-engineering.md`, `docs/eval/report.md`). Los comandos SHALL ser los reales de `package.json`, `docker-compose.yml` y `scripts/`.

#### Scenario: Enlaces válidos
- **WHEN** se extraen los enlaces relativos del README
- **THEN** cada ruta existe en el repositorio

#### Scenario: Arranque reproducible
- **WHEN** se siguen los comandos de la sección de puesta en marcha
- **THEN** se usan solo `scripts/bootstrap-env.sh`, `docker compose` y `scripts/smoke.sh`, que existen en el repositorio

### Requirement: Alcance y evolución declarados
La sección `Alcance entregado y evolución` del README SHALL mapear cada ejercicio del PDF a sus artefactos y SHALL listar como Evolución los siguientes pasos conocidos (consumidor AMQP `agent.ingest`, pin `sha256` del modelo ONNX, `/ready` de auth-service con comprobación de dependencias, validación del agente contra la API de Anthropic en vivo, pipeline de CI).

#### Scenario: Evolución visible
- **WHEN** se lee la sección `Alcance entregado y evolución`
- **THEN** aparece una fila por ejercicio (1 a 5) y la lista de siguientes pasos

## Evolución

- `apps/web/README.md` independiente (desarrollo local con Vite, variables de entorno, proxy y autenticación) enlazado desde el README raíz.
- `scripts/agent-demo.sh` y `docs/agent-example.md` como ejemplo ejecutable dedicado del agente; hoy el agente se ejercita con `scripts/smoke.sh` y `e2e/agent.spec.ts`.
- Apartado propio de aplicación de DDD y Clean Architecture en el README (hoy enlazado vía `docs/architecture/README.md`).
