---
spec: architecture-decision-records
change: design-architecture-docs
wave: 0
epics: EP-EX1
status: done
created: 2026-10-20
archived: 2026-10-20
---

# Spec — architecture-decision-records

> Spec canónica promovida desde el cambio archivado `design-architecture-docs`.

## Requirements

### Requirement: Diez ADRs en formato forge:adr
El repositorio SHALL contener `docs/adrs/ADR-001` a `ADR-010` con los nombres de archivo definidos en `design.md` ("Documentation contract"). Cada ADR SHALL tener frontmatter (`id`, `title`, `status`, `date`, `tier: 0`, `tags`) y las secciones `## Context`, `## Decision`, `## Consequences`, `## Alternatives considered` e `## Implementación` (marca "Implementado en <cambio>" o "Evolución"). El contenido SHALL estar en español.

#### Scenario: ADR completo
- **WHEN** el auditor abre cualquier `docs/adrs/ADR-NNN-*.md`
- **THEN** encuentra las 5 secciones (incluida `## Implementación`), `tier: 0` y un `status` (`proposed` hasta la aprobación 📋, luego `accepted`)

### Requirement: Alternativas y trade-offs explícitos
Cada ADR SHALL listar al menos 2 alternativas como `### Alternativa N — <nombre>` indicando "Por qué se descartó", y SHALL dividir `## Consequences` en `### Positivas` y `### Negativas y riesgos`.

#### Scenario: Trade-off auditable
- **WHEN** se ejecuta `grep -c '^### Alternativa'` sobre un ADR
- **THEN** el resultado es >= 2 y existe `### Negativas y riesgos`

### Requirement: Cobertura temática de los 10 ADRs
Los ADRs SHALL cubrir, en este orden: (001) monorepo TypeScript/NestJS; (002) límites de servicio y BD por servicio; (003) autenticación JWT RS256/JWKS y RBAC; (004) mensajería asíncrona RabbitMQ; (005) comunicación síncrona REST y resiliencia; (006) Clean Architecture + DDD; (007) observabilidad y calidad; (008) puerto LLM; (009) RAG con embeddings locales y Qdrant; (010) frontend y reverse proxy / gateway ligero (archivo `ADR-010-frontend-react-rtk-nginx-gateway.md`). Las decisiones SHALL reflejar la auditoría externa: bindings `#`, cola `auth.user-projection`, excepción única de lectura de `auth:deny:jti:*` (y `auth:deny:user:*`), `aud`/`kid` (clave única)/`client_credentials` solo interno, orden por `aggregateVersion`, `audit.fallback`, `jwt-guard` fail-open ante Redis caído, argon2id, outbox solo en user-service, identidad delegada del agente, RAG sobre documentos de conocimiento, chunks ≤256 y cookie HttpOnly; Evolución explícita para rotación JWKS, discovery OIDC, ACL de Redis, barrido de auth y `access.denied` por AMQP.

#### Scenario: Decisiones coherentes con el contrato
- **WHEN** un ADR menciona servicios, puertos, eventos o claves Redis
- **THEN** coinciden con el catálogo de `design.md`

### Requirement: Sin valores sensibles al tiempo
Los ADRs (en particular 008 y 009) SHALL NOT incluir IDs de modelo LLM ni precios; SHALL indicar "configurable vía variables de entorno; verificado contra la documentación de Anthropic en `build-ai-agent-rag-service`".

#### Scenario: Grep negativo
- **WHEN** se busca `claude-` o `$` seguido de cifra de precio en `docs/adrs/`
- **THEN** no hay coincidencias de IDs de modelo ni precios
