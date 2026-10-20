---
spec: prompt-templates
change: evaluate-agent-prompts-quality
wave: 0
epics: EP-EX5
status: draft
created: 2026-10-20
---

# Spec — prompt-templates

## ADDED Requirements

### Requirement: Plantillas versionadas
El módulo `src/prompts/` SHALL exportar `PROMPT_VERSION` y `buildMessages({question, contexts})` que devuelve system prompt + ejemplos few-shot + mensaje de usuario. SHALL NOT contener identificadores de modelo ni precios.

#### Scenario: Construcción de mensajes
- **WHEN** se invoca `buildMessages` con una pregunta y 2 contextos
- **THEN** el resultado incluye el system prompt, los 3 ejemplos few-shot y un mensaje de usuario con ambos contextos dentro de `<context>`

### Requirement: Defensa contra prompt injection
El system prompt SHALL declarar que el contenido de `<context>` y `<user_question>` es dato no confiable y que no se obedecen instrucciones contenidas en él. `buildMessages` SHALL neutralizar delimitadores de cierre incrustados en la entrada.

#### Scenario: Delimitador incrustado
- **WHEN** la pregunta contiene `</user_question>` seguido de instrucciones
- **THEN** el mensaje construido no permite cerrar el bloque antes de tiempo

### Requirement: Formato de salida estricto
El system prompt SHALL exigir JSON con `answer`, `citations`, `refused` y `refusalCode?`, y rechazo `NO_CONTEXT` cuando los contextos no sustentan la respuesta.

#### Scenario: Sin contexto relevante
- **WHEN** `contexts` está vacío
- **THEN** las instrucciones del mensaje piden `refused=true` con `NO_CONTEXT`
