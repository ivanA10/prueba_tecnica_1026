---
spec: requirements-traceability
change: design-architecture-docs
wave: 0
epics: EP-EX1
status: done
created: 2026-10-20
archived: 2026-10-20
---

# Spec — requirements-traceability

> Spec canónica promovida desde el cambio archivado `design-architecture-docs`.

## Requirements

### Requirement: Matriz PDF → cambio → artefacto
`docs/traceability.md` SHALL contener una tabla por ejercicio (1 a 5) con columnas `ID | Requisito (cita del PDF) | Tipo (técnico / entrega / evaluación) | Cambio | Artefacto (ruta) | Estado`. Los IDs SHALL seguir `EX<n>-R<NN>`.

#### Scenario: Cobertura de los 5 ejercicios
- **WHEN** se cuentan las filas `| EX1-` … `| EX5-`
- **THEN** cada ejercicio tiene >= 8 filas y el total es >= 60

### Requirement: Todo requisito del PDF tiene dueño
Cada viñeta de "Requisitos técnicos", "Tecnologías requeridas/sugeridas", "Requisitos de entrega", "Evaluación" de cada ejercicio, las 5 viñetas de la instrucción del Ejercicio 4 y la sección "Entregables Esperados" SHALL aparecer en una fila con el cambio responsable (uno de los 9 cambios planeados) y la ruta del artefacto esperado.

Los ítems de "Entregables Esperados" usan IDs `EX0-R<NN>`. El criterio de Ex1 "Dockerización completa y funcional" SHALL asignarse a `harden-compose-resilience-security`, citando `docs/architecture/04-docker-compose-diseno.md` como artefacto de diseño.

#### Scenario: Ningún requisito huérfano
- **WHEN** una fila tiene columna Cambio vacía o fuera de la lista de 9 cambios
- **THEN** el documento es inválido

### Requirement: Requisitos en riesgo explícitos
La matriz SHALL marcar con la etiqueta `[RIESGO]` los requisitos propensos a omitirse: explicación de flujo de datos (Ex1), DDD/Clean explicados dos veces (Ex1 y Ex2), dos documentos de ejecución (sistema y frontend), resiliencia como código, OWASP mapeado a código, autorización además de autenticación, ejemplo ejecutable del agente, rate limiting y validación de respuestas como código, optimización de costo de tokens, reporte de cobertura como artefacto, comunicación a stakeholders (Ex4), frontend en el mismo compose.

#### Scenario: Etiquetas de riesgo presentes
- **WHEN** se ejecuta `grep -c 'RIESGO' docs/traceability.md`
- **THEN** el resultado es >= 10

### Requirement: Lista de los 9 cambios
La matriz SHALL incluir una sección `## Cambios planeados` con los 9 cambios en orden: design-architecture-docs, bootstrap-monorepo-platform, build-auth-role-services, build-user-audit-services, harden-compose-resilience-security, build-frontend-user-console, build-ai-agent-rag-service, evaluate-agent-prompts-quality, document-diagnosis-delivery.

#### Scenario: Nombres de cambio consistentes
- **WHEN** se buscan los 9 nombres en el documento
- **THEN** todos aparecen al menos una vez
