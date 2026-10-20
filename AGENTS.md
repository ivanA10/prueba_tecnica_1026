<!-- forge:section:project:1.0.0 -->
## Project

Node 22 + NestJS 11 + React 18 + Postgres/Mongo/Redis/RabbitMQ/Qdrant — user-management microservices with AI RAG agent (Toka Senior Full-Stack IA technical test).

Bootstrapped by `agent-prep`. Edit only via an `agent-prep` re-run.
<!-- /forge:section:project -->

<!-- forge:section:project-stack:1.1.0 -->
## Stack

- **Runtime**: Node 22
- **Language**: TypeScript 5.x
- **Framework**: NestJS 11 (backend services); React 18 + Vite (frontend `apps/web`)
- **Package manager**: `pnpm` workspaces (`apps/*`, `packages/*`)
- **ORM / DB**: Prisma + Postgres 17 (DB per service: auth, user, role); Mongoose + MongoDB 7 (audit); ioredis + Redis 7; RabbitMQ 3.13; Qdrant (vector DB)
- **Test runner**: Jest — backend: Jest + Supertest, `coverageThreshold` lines 70 per service; frontend: Jest 29 + React Testing Library via ts-jest (NOT Vitest)
- **Lint / format**: eslint + prettier (`pnpm -r lint`)

Status: planned stack — no source code exists yet. Layout is created in change `bootstrap-monorepo-platform`.

Planned layout: `apps/auth-service`, `apps/user-service`, `apps/role-service`, `apps/audit-service`, `apps/ai-agent-service`, `apps/web`; `packages/logger`, `packages/jwt-guard`, `packages/contracts`; `infra/` (compose support, nginx); `docs/` (architecture, adrs, audit, coverage); `scripts/`.

### Domain Map (generated)

- `frontend_paths`: `apps/web`
- `backend_paths`: `apps/auth-service`, `apps/user-service`, `apps/role-service`, `apps/audit-service`, `apps/ai-agent-service`, `packages`
- `database_paths`: `apps/*/prisma`, `apps/audit-service/src/infrastructure/persistence`
- `test_frontend_paths`: `apps/web/src/**/__tests__`, `apps/web/test`
- `test_backend_paths`: `apps/*/test`, `apps/*/src/**/*.spec.ts`
- `config_paths`: `docker-compose.yml`, `infra`, `.env.example`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `jest.config.base.js`
- Documentation paths (owner for doc-only tasks): `docs/`, `openspec/`
<!-- /forge:section:project-stack -->

<!-- forge:section:commands:1.0.0 -->
## Commands

| Action | Command |
|--------|---------|
| Install | `pnpm install` |
| Dev | `docker compose up --build` |
| Build | `pnpm -r build` |
| Test | `pnpm -r test -- --coverage` |
| Lint | `pnpm -r lint` |
| Migrate | `pnpm --filter <service> exec prisma migrate deploy` |

Status: planned — these commands become valid once created in change `bootstrap-monorepo-platform`.

Use these verbatim. Do not invent variants.
<!-- /forge:section:commands -->

<!-- forge:section:sdd-workflow:1.4.1 -->
## SDD workflow

- No code without an active named change folder (`openspec/changes/<name>/` with `proposal.md`, `design.md`, `tasks.md` all present).
- All implementation uses TDD — tests before code.
- Multi-wave specs use explicit `## Wave N — [scope]` sections; tasks reference the wave slice.
- Verify before archive — always.
- Commits reference `<change-name>` (never an issue number).
- Brownfield repos: `forge:explore` runs first to seed Engram `topic_key=project/memory`.

### Gates (non-skippable)

| Gate | Emoji | Trigger | Resolved by |
|------|-------|---------|-------------|
| Greenfield intake | 📥 | New greenfield project | User confirms PRD or "proceed without" |
| Plan approval | 📋 | Any spec/proposal/tasks.md written | User approves or returns feedback |
| Clarification | ❓ | Agent encounters genuinely blocking ambiguity | User answers |
| Manual test | ✅ | Validator issues PASS | User confirms or reports issues |

### Interface

Humans use `forge:*` skills as the default interface. `opsx:*` is the underlying engine; direct use is an expert exception.

See `agent_docs/dispatch-*.md` for the full cycle, multi-wave handling, and orchestration detail.
<!-- /forge:section:sdd-workflow -->

<!-- forge:section:memory:1.2.0 -->
## Memory protocol (Engram — required)

Engram is the persistent memory backend. The protocol follows `schemas/memory-topics.md` and the per-turn budget in `agent_docs/memory-budget.md`.

**Engram access tiers (W4-W5):**

- **save-only** — `validator`, `tester-front`, `tester-back`, `github-ops`, `agent-sync`. `mem_save` only; prior context arrives via orchestrator briefing cards (`engram_context: [...]`). If cards are insufficient, return `BLOCKED [CONTEXT] missing: <topic_prefix>`.
- **search-capable** — `planner`, `researcher`, `frontend`, `backend`, `database`, `agent-prep`, `devstart`, `bugfix-pr`. Full Engram access. Check briefing cards first; search only if a new domain emerges. Per-turn budget: max 2 `mem_search`, max 1 L3 fetch, max 1200 mem-tokens injected.
- **orchestrator** (main session only) — full access plus exclusive `mem_context` rights (post-compaction / explicit recall / session resume only).

**When to save** (`mem_save`): immediately after a decision, bugfix, pattern, config change, or discovery. Use `topic_key` per schema namespace for your role. Cross-namespace writes are forbidden and rejected.

**Topic schema**: `<namespace>/<scope>[/<subscope>]` — see `schemas/memory-topics.md`.

**Briefing cards pattern**: the orchestrator pre-resolves memory cards ONCE per dispatch via `bash scripts/sdd-memory-governor.sh --need <X> --topic-prefix <Y>` and injects the result as `engram_context: [...]` in the subagent envelope. Subagents do NOT search on start when cards are present.

**`mem_context`**: forbidden for all subagents. Allowed only for the orchestrator after compaction / on explicit user recall / on session resume.

**Engram unavailable**: continue with `[MEMORY] WARNING`. Exception: if `.engram/` exists in repo, BLOCK with install instructions (see `agent_docs/engram-install.md`).

**Memory sync (orchestrator-owned)**: after every `opsx:archive`, the orchestrator runs `engram sync` to export the change's new memories to `.engram/<chunk>.json.gz` and commits the chunk with the PR. Without this, memories stay local and teammates cannot consume them. Optional triggers: end of long sessions, before context compaction, before multi-repo handoffs. See `.claude/rules/orchestrator-dispatch.md` → "Memory Sync".
<!-- /forge:section:memory -->

<!-- forge:section:boundaries:1.0.0 -->
## Boundaries

- Never edit auto-generated directories (resolved at bootstrap; example: `src/generated/`, `dist/`, `.next/`, `target/`, `__pycache__/`).
- Never commit secrets — `.env*` files use `.example` convention.
- Never bypass approval gates 📋 ✅.
- See `agent_docs/` for: workflow detail, multi-repo setup, skill catalog, MCP integrations, profiles, architecture, Engram install.
<!-- /forge:section:boundaries -->
