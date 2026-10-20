# Section Ownership Registry

Single source of truth for which tier owns each `forge:section:*` block in
`AGENTS.md` / `CLAUDE.md`. Consumed by `python -m installer validate` (gate 6)
and exported to target repos as `.forge/section-ownership.json` for the
drift/ownership checks in `scripts/sdd-context-drift.sh`.

## Taxonomy rules

- Section names must match `\w[\w-]*` (the merge-engine regex in
  `installer/core/section_merge.py`). Namespacing uses **hyphens**, never
  colons: `hub-repo-map` is valid, `hub:repo-map` is not.
- **hub** sections may appear only in coordination-repo files (and the
  standalone/monorepo base templates, which are exempt — a single repo is its
  own hub). They never ship to member repos.
- **member** sections carry per-repo stack/domain facts. They live in each
  member repo's own files and must NEVER appear in a coordination repo's
  AGENTS.md — a coordination repo containing member sections is flagged
  `needs-split` and migrated via bootstrap Mode 6b.
- **shared** sections ship everywhere.
- `forge:context:<repo>:<hash12>` is a separate marker class (not a section):
  a 12-hex truncated sha256 of a member repo's normalized `project-stack`
  content, pinned inside the hub's `hub-repo-map` section for drift detection.

## File-total line budgets

| File | Budget | Rationale |
|---|---|---|
| hub AGENTS.md | ≤ 180 lines | hub-owned sections only; protects Codex 32KiB chain + CC adherence guidance |
| member AGENTS.md | ≤ 200 lines | CC 150–200 line adherence guidance; far under Codex `project_doc_max_bytes` |

## Registry

| Section | Owner | Max lines | Lives in | Notes |
|---|---|---|---|---|
| `project` | shared | 12 | AGENTS.md | One-line identity + purpose; filled by agent-prep |
| `project-stack` | member | 45 | AGENTS.md | Full stack + Domain Map; agent-prep generated; hashed for `forge:context` |
| `commands` | member | 25 | AGENTS.md | Exact command table |
| `repo-pairings` | member | 35 | AGENTS.md | Peer repos, `openspec/contracts/` pointer, response shapes; bootstrap generated |
| `hub-repo-map` | hub | 60 | AGENTS.md | ≤3 lines per member repo + pointer line + `forge:context` hash line |
| `sdd-workflow` | shared | 45 | AGENTS.md | Gates, conventions, interface |
| `memory` | shared | 45 | AGENTS.md | Engram protocol, access tiers, briefing cards |
| `boundaries` | shared | 15 | AGENTS.md | Guardrails |
| `agents-import` | shared | 5 | CLAUDE.md | `@AGENTS.md` (Claude Code parses; inert text elsewhere) |
| `claude-specifics` | shared | 20 | CLAUDE.md | CC-only runtime notes |
| `orchestrator-identity` | hub | 15 | CLAUDE.md | Dispatch monopoly; hub + standalone only — never member repos |

Owners: `hub` = coordination repo, `member` = member repo, `shared` = both.
Template trees validated by gate 6: `src/templates/hub/`, `src/templates/member/`
(the base `src/templates/` files serve standalone/monorepo and are exempt from
the ownership exclusivity check, but every section in them must be registered).
