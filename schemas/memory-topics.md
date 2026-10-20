# Engram Topic Key Schema (v1.0.0)

> Source of truth for `mem_save(topic_key=...)` calls across the SDD harness.
> Violations are flagged by the planner validator. Agents that emit non-conforming
> topic_keys will have their saves rejected with [TOPIC SCHEMA] error.

## Format

`<namespace>/<scope>[/<subscope>]`

- All lowercase; hyphens only; no spaces; no slashes inside segments.
- Maximum 4 segments (most use 2–3; `state/wave/<change>/<N>` uses 4).
- Must start with one of the namespaces below.

## Namespaces

| Namespace | Owner | Scope segment | Subscope | Purpose | Example |
|-----------|-------|---------------|----------|---------|---------|
| `session` | orchestrator | `<change-name>` | — | Session lifecycle marker | `session/add-auth-flow` |
| `gate` | orchestrator | `plan-approved` \| `manual-test-passed` \| `multi-spec-branch` | `<change-name>` \| `<bundle-name>` | Approval gate / branch-bundle audit (B1) | `gate/multi-spec-branch/auth-bundle` |
| `spec` | planner | `<change-name>` | — | Spec rationale, alternatives discarded | `spec/add-auth-flow` |
| `research` | researcher | `<topic-slug>` | — | Research findings, anti-patterns | `research/oauth-pkce` |
| `project` | agent-prep | `memory` \| `stack` \| `domain-map` | — | Brownfield project knowledge | `project/memory` |
| `workspace` | agent-prep | `<package-name>` | `stack` \| `memory` | Per-workspace stack in monorepos | `workspace/api/stack` |
| `state` | agent-sync | `wave` | `<change-name>/<N>` | Wave progress (upsert) | `state/wave/add-auth-flow/2` |
| `handoff` | agent-sync | `<change-name>` | `<from-agent>-to-<to-agent>` | Wave-to-wave handoff | `handoff/add-auth-flow/backend-to-frontend` |
| `coordination` | orchestrator | `<change-name>` | — \| `cycle/<role>` \| `feedback/<role>` | Multi-repo dispatch plan / per-(change,role) cycle counter (B4) / failure feedback payload (B4) | `coordination/add-auth-flow/cycle/backend` |
| `pr` | github-ops \| bugfix-pr | `<change-name>` | — \| `bugfix-findings` \| `preflight-block` | PR URL + CI status; bugfix-pr findings (B5); pre-flight block payload (B5) | `pr/add-auth-flow/preflight-block` |
| `contract` | backend | `<endpoint-slug>` | — | API contract published (multi-repo) | `contract/post-tickets` |
| `frontend` | frontend | `<feature-slug>` | `decision` \| `pattern` \| `bugfix` | Frontend domain memory | `frontend/login-form/decision` |
| `backend` | backend | `<feature-slug>` | `decision` \| `pattern` \| `bugfix` | Backend domain memory | `backend/auth-middleware/decision` |
| `database` | database | `<table-or-feature>` | `migration` \| `pattern` \| `decision` | DB domain memory | `database/users/migration` |
| `verify` | validator | `<change-name>` | — | Quality scorecard, pre-archive verdict (C5 schema) | `verify/add-auth-flow` |

## Rules

1. **No cross-namespace writes**: frontend agent never writes `backend/*`. Enforced by sub-agent MCP allowlist (Wave 3) and the `memory_namespaces` frontmatter field on each agent.
2. **State upsert**: `state/wave/*` uses upsert (same `topic_key` updates `revision_count`). Always pass `topic_key` for these.
3. **Search before save**: When agent starts a task, `mem_search` with topic prefix to avoid duplicate work.
4. **Compaction recovery**: Orchestrator calls `mem_session_summary` after compaction; topic_key=`session/<change>`.
5. **Archive cleanup**: After `opsx:archive`, agent-sync flags stale state/handoff topics for soft-delete.

## Validator behavior

`scripts/validate-topic-key.sh <topic_key>` — exit 0 if conforming, exit 1 with diagnostic.
Used by planner skill and CI lint.
