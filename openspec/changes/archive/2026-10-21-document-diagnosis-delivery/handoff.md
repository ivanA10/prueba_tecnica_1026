# Implementation Handoff — document-diagnosis-delivery

## Change summary
- **Change name:** document-diagnosis-delivery (change 9 de 9)
- **Artifacts:** `openspec/changes/document-diagnosis-delivery/{proposal,design,tasks}.md` y `specs/{incident-diagnosis-document,coverage-report,delivery-documentation,requirements-traceability}.md`
- **Tasks:** 6 tareas, 3 waves (1 + 1 + 4)

## Goal
Entregar la respuesta del Ejercicio 4 anclada en este sistema (Wave 0, sin depender de código) y la documentación de entrega final: reporte de cobertura fusionado, README raíz, README del frontend, ejemplo ejecutable del agente y matriz de trazabilidad con estados finales.

## Decisions already closed
- D1–D10 de design.md. Notables: 5 categorías de hipótesis (4 del PDF + configuración/despliegue), cobertura = script + artefactos versionados (`docs/coverage.md` + `docs/coverage/`), alcance de escritura `docs/**` + `README.md`, `apps/web/README.md`, `scripts/coverage-report.sh`, `scripts/agent-demo.sh`, estados finales verificados contra el disco.

## Open risks / follow-ups
- Wave 1 exige cambios 3, 4, 6, 7 (8 recomendado); Wave 2 exige además 5 y 8. Verificar `apps/*` antes de despachar.
- Si un componente queda bajo 70 % de líneas, el script falla: corregir en el cambio dueño, no bajar el umbral aquí.
- Rutas del endpoint del agente y comandos de arranque: tomarlos del disco, no inventarlos. Ejecución en vivo de `scripts/agent-demo.sh` = gate ✅ manual.
- Etiquetas de imagen y sintaxis LogQL/Alloy: `needs-verification`.

## Suggested checkpoints
- Planning-approved (📋); fin de Wave 0 (se puede ejecutar de inmediato); fin de Wave 1; pre-verify; post-verify.
