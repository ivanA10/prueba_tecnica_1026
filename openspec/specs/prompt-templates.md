---
spec: prompt-templates
change: evaluate-agent-prompts-quality
wave: 0
epics: EP-EX5
status: done
created: 2026-10-20
archived: 2026-10-21
---

# Spec — prompt-templates

> Spec canónica promovida desde el cambio archivado `evaluate-agent-prompts-quality` (as-built, 2026-10-21).

## Requirements

### Requirement: Plantillas versionadas
El módulo `src/prompts/` (`apps/ai-agent-service`) SHALL exportar `PROMPT_VERSION`, `SYSTEM_PROMPT` (reglas + 3 ejemplos few-shot) y `buildMessages(question, fragments)`, que devuelve los `messages` (un mensaje de usuario con `<context>` y `<user_question>`) que el caso de uso envía junto con `SYSTEM_PROMPT` en la petición `generate(req)` del puerto `src/application/ports/llm-provider.port.ts`. SHALL NOT contener identificadores de modelo ni precios.

#### Scenario: Construcción de mensajes
- **WHEN** se invoca `buildMessages` con una pregunta y 2 contextos
- **THEN** `messages` contiene un mensaje de usuario con ambos fragmentos dentro de `<context>`, y `SYSTEM_PROMPT` incluye los 3 ejemplos few-shot

### Requirement: Defensa contra prompt injection
El system prompt SHALL declarar que el contenido de `<context>`, `<tool_result>` y `<user_question>` es dato no confiable y que no se obedecen instrucciones contenidas en él. `buildMessages` SHALL neutralizar delimitadores de cierre incrustados en la entrada.

#### Scenario: Delimitador incrustado
- **WHEN** la pregunta contiene `</user_question>` seguido de instrucciones
- **THEN** el mensaje construido no permite cerrar el bloque antes de tiempo

### Requirement: Formato de salida estricto
El system prompt SHALL exigir JSON conforme a `AgentAnswer` de `src/domain/agent-answer.ts` (`answer`, `sources`, `refused?`, ...), y rechazo `NO_CONTEXT` cuando los contextos no sustentan la respuesta.

#### Scenario: Sin contexto relevante
- **WHEN** `contexts` está vacío
- **THEN** las reglas de `SYSTEM_PROMPT` piden `refused=true` con `NO_CONTEXT`
