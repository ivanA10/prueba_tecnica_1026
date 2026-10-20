# Repo Audit — `<repo-name>`

> **EPHEMERAL.** Rendered into `.sdd/repo-audit.md` during bootstrap (multi-repo: `.sdd/repo-audit-<repo-key>.md` in the hub, one per member). Reviewed by the developer at the 📋 audit gate. **Auto-deleted** once the AGENTS.md `project-stack` section is written.
>
> Do not edit by hand. To regenerate, re-run `/sdd Mode 6` (greenfield) or `/sdd Mode 6b` (brownfield change-request).

## 1. Stack (detected)

| Field | Detected value | Source |
|---|---|---|
| Runtime | `<e.g. Node 22 / Python 3.12 / Go 1.22>` | `<package.json engines / pyproject / go.mod>` |
| Language | `<TypeScript 5.4 / Python 3.12 / Go 1.22>` | `<tsconfig / pyproject / go.mod>` |
| Framework | `<Next.js 15 / FastAPI / Gin>` | `<dependency manifest>` |
| Package manager | `<pnpm 9 / uv / cargo>` | `<lockfile>` |
| ORM / DB | `<Prisma + Postgres / SQLAlchemy + Postgres / sqlc + MySQL>` | `<schema file>` |
| Test runner | `<vitest / pytest / go test>` | `<package.json scripts / pyproject>` |
| Lint / format | `<eslint+prettier / ruff+black / golangci-lint>` | `<config file>` |
| `verify_cmd` | `<full command — e.g. pnpm test && pnpm lint>` | inferred |

## 2. Domain map (detected)

```
frontend_paths:       <list, or empty>
backend_paths:        <list, or empty>
database_paths:       <list, or empty>
test_frontend_paths:  <list, or empty>
test_backend_paths:   <list, or empty>
config_paths:         <list>
```

## 3. Repo signals

- **Type**: `<greenfield | brownfield | hybrid>`
- **Topology**: `<standalone | monorepo | member-repo | coordination-hub>`
- **Suggested preset**: `<solo | coordination-hub | member-repo>`
- **Suggested profiles**: `<frontend | backend-api | brownfield | high-risk>`
- **High-risk surface present**: `<yes/no>` — `<auth | payments | PII | infra>` (if any)

## 3.5 Repo pairings (member repos only — feeds the `repo-pairings` section)

- **Repo key**: `<key from hub openspec/config.yaml repos:>`
- **Coordination hub**: `<../relative-path>` — specs at `<hub>/openspec/changes/`
- **Peer repos**: `<key> @ <../relative-path> — <one-line role>` (one line per peer)
- **Contracts dir**: `<hub>/openspec/contracts/` + Engram `contract/<endpoint-slug>` topics
- **Expected response envelope**: `<e.g. { data, error, meta }>`

## 4. Existing tooling

| Tool | Detected | Path / Version |
|---|---|---|
| `.claude/` | `<yes/no>` | `<path>` |
| `.cursor/` | `<yes/no>` | `<path>` |
| `.opencode/` | `<yes/no>` | `<path>` |
| `.codex/` | `<yes/no>` | `<path>` |
| `.vscode/` | `<yes/no>` | `<path>` |
| `openspec/` | `<yes/no>` | `<path>` |
| `.engram/` | `<yes/no>` | `<chunks>` |
| `AGENTS.md` | `<yes/no — sections present>` | — |
| `CLAUDE.md` | `<yes/no — sections present>` | — |

## 5. Gaps and recommendations

- `<gap or risk #1, with concrete remedy>`
- `<gap or risk #2, with concrete remedy>`
- ... (max 8 items; if more, split bootstrap into phases)

## 6. CI / branch protection

- **Default branch**: `<main / master / develop>`
- **Branch protection**: `<yes/no>` (`<rules summary>`)
- **CI provider**: `<github actions / circleci / etc.>`
- **Codacy / SonarQube**: `<yes/no>`

## 7. Bootstrap plan (proposed)

1. `<step — concrete file/section to be written>`
2. `<step>`
3. ... (max 6 steps)

## 8. Approval

Review the above and respond with one of:

- ✅ **Approved** — proceed to write `project-stack` to AGENTS.md, this audit auto-deletes.
- ✏️ **Feedback**: `<list any corrections or missing items>` — bootstrap will re-run with your input.
- ❌ **Reject** — stop bootstrap.
