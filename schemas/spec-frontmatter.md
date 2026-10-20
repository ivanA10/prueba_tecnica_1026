# Spec frontmatter — required schema

Every delta spec in `openspec/changes/<change-name>/specs/` MUST use this frontmatter:

```yaml
---
spec: <spec-id>
change: <change-name>
wave: <N or N,M for multi-wave>
epics: <EP-XXX, EP-YYY>
status: draft | ready | in-progress | done
created: <YYYY-MM-DD>
---
```

## Rules

- `spec` must be kebab-case matching the filename without extension
- `change` must match the parent change folder name exactly
- `wave` is a single number or comma-separated list for multi-wave specs
- Multi-wave specs MUST contain `## Wave N — [scope]` sections in the body
- `status` starts as `draft`, moves to `ready` after approval gate
- Delta specs live ONLY at `openspec/changes/<change-name>/specs/`
- NEVER write specs directly to `openspec/specs/` — that directory is updated only by `opsx:archive`
