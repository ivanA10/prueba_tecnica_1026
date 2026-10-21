---
spec: delivery-documentation
change: document-diagnosis-delivery
wave: 2
epics: EP-DLV
status: draft
created: 2026-10-20
---

# Spec — delivery-documentation

## ADDED Requirements

### Requirement: README raíz de ejecución del sistema
`README.md` SHALL contener `## Visión general` (propósito, los 5 microservicios, `web` como reverse proxy / gateway ligero, bases de datos y mensajería), `## Requisitos previos`, `## Cómo ejecutar` (generación de entorno con `scripts/bootstrap-env.sh`, arranque con Docker Compose, URLs, acceso por `localhost` por la cookie `Secure` configurable, verificación con `/health` y `/ready`), `## Pruebas y cobertura` (enlace a `docs/coverage.md`), `## Documentación` (enlaces a `docs/architecture/README.md`, ADRs, `docs/diagnostico-ex4.md`, `docs/prompt-engineering.md`, `docs/agent-example.md`), `## Aplicación de DDD y Clean Architecture` (resumen y enlace a `docs/architecture/05-ddd-clean-cqrs.md`), `## Trazabilidad PDF → artefacto` (estado por ejercicio y enlace a `docs/traceability.md`) y `## Evolución declarada`. Los comandos SHALL tomarse de `package.json`, `docker-compose.yml` y `scripts/` reales; NO SHALL inventar variantes.

#### Scenario: Enlaces válidos
- **WHEN** se extraen los enlaces relativos del README
- **THEN** cada ruta existe en el repositorio

#### Scenario: Frontend en documento aparte
- **WHEN** se busca `apps/web/README.md` en el README
- **THEN** aparece como enlace

### Requirement: README del frontend independiente
`apps/web/README.md` SHALL ser un documento separado con `## Requisitos`, `## Desarrollo local`, `## Pruebas` (Jest + React Testing Library), `## Variables de entorno` (`config.ts` envuelve `import.meta.env`), `## Build y Docker` (servicio `web` del compose principal) y `## Proxy y autenticación` (nginx como reverse proxy / gateway ligero, access token en memoria, refresh en cookie HttpOnly, `localhost`). SHALL enlazar al README raíz.

#### Scenario: Documentos de ejecución distintos
- **WHEN** se comparan `README.md` y `apps/web/README.md`
- **THEN** son archivos diferentes y cada uno enlaza al otro

### Requirement: Ejemplo ejecutable del agente
`scripts/agent-demo.sh` SHALL ejecutar de extremo a extremo (login → consulta al agente → mostrar respuesta y `correlationId`) contra el sistema levantado, con `set -euo pipefail`, URL base configurable y sin credenciales ni claves embebidas. `docs/agent-example.md` SHALL documentar `## Requisitos`, `## Ejecución con proveedor mock` (sin API key), `## Ejecución con API key`, `## Salida esperada` y `## Seguir la petición por correlationId`.

#### Scenario: Script válido
- **WHEN** se ejecuta `bash -n scripts/agent-demo.sh`
- **THEN** termina con código 0

#### Scenario: Sin secretos
- **WHEN** se busca un valor de clave de API literal en el script y el documento
- **THEN** no hay ninguno (solo el nombre de la variable de entorno)
