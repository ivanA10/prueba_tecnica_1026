# MCP integration

<!-- updated: refactor/audit-v2 2026-05-05 -->

Loaded when an MCP issue arises or when the user asks about tools.

## Required MCPs

### Engram (memory)

- **What**: SQLite + FTS5 persistent memory backed by a single binary, exposed via MCP stdio.
- **Required**: yes — every agent has `mcp__engram__*` in its tools allowlist.
- **Default port**: `7437` (HTTP health check + cross-project search helper).
- **Project name**: auto-detected from git remote; override with `ENGRAM_PROJECT=<name>`.
- **Install**: `claude plugin install engram` (Claude Code), `engram setup opencode` (OpenCode). See `agent_docs/engram-install.md`.
- **Topic schema**: `schemas/memory-topics.md` — every save must conform.
- **Down behavior**: continue with `[MEMORY] WARNING`. Exception: `.engram/` or `engram.db` present → BLOCK with install instructions.

Common ops:
- `mem_search topic_prefix:<ns>/` — search before save.
- `mem_save topic_key=<ns>/<scope>[/<sub>]` — save with strict topic_key.
- `mem_context` — pull session-relevant context after compaction.
- `mem_session_summary` — end-of-session digest (called by orchestrator).

### context7 (live library docs)

- **What**: Up-to-date documentation for any library by ID.
- **Required**: yes for researcher, planner, agent-prep, frontend, backend, validator?, devstart, tester-* — anywhere library APIs are consulted.
- **Flow**: `resolve-library-id` → `get-library-docs`.
- **When to use**: before writing code that imports an unfamiliar package; when a behavior change is suspected; when migrating versions.

## Tool I/O compression — rtk

- **What**: A CLI proxy that compresses outputs of common dev commands (`ls`, `cat`, `grep`, `find`, `git status|diff|log|show|branch`, `pnpm test|lint|typecheck`, `jest`, `vitest`, `eslint`, `tsc`, `prettier`) before they reach the model. 60-90% token reduction on covered commands.
- **NOT an MCP server.** rtk is a Bash CLI proxy installed via a PreToolUse hook. It is listed here for discoverability alongside MCPs but does not appear in `mcp__*` allowlists or `mcp.json` configs.
- **Required**: in the default plugin set (installed when `--plugins` is unset). Removed only if the user passes an explicit `--plugins` list that omits it.
- **Install**: `brew install rtk` (macOS) / `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh` (Linux/WSL). Run `rtk init -g` once to enable automatic command rewriting (rtk's own hook). The forge plugin ships an advisory hook that hints but does not rewrite (rewrite protocol is rtk-owned and version-sensitive).
- **Coverage bypass**: rtk's hook intercepts only Bash. For native tools that bypass Bash (`Read`, `Grep`, `Glob`), agents should call `rtk read` / `rtk grep` / `rtk find` via Bash when expected output is large. Rule documented in `rules/agent-common.md` → "Tool-I/O compression (rtk)".
- **Down behavior**: if `rtk` is not on PATH, the advisory hook no-ops silently. Agents fall back to un-prefixed commands.

## Conditional MCP

### Figma

- **Required only when** `frontend_paths` is non-empty in the project-stack Domain Map.
- **Capabilities**: `get_design_context`, `get_screenshot`, `get_metadata`, Code Connect mappings.
- **Use cases**: design-to-code, component mapping, design system reconciliation.
- Skipped silently when no frontend paths are present.

## Browser tooling (D1 — agent-browser default)

### agent-browser (Vercel)

- **Default** for ad-hoc probes, validator manual checks, Mode 1 verification, and `agent-browser:`-typed verification gates.
- Rust CLI + persistent daemon. Accessibility-tree refs (`@e1`, `@e2`) — 82% less context than Playwright MCP.
- Wrapped by the `forge:browse` skill.
- Install: `npm i -g agent-browser && agent-browser install`. Detection lives in `scripts/sdd-preflight.sh`.

### Playwright CLI (`npx playwright test`)

- **Retained** for committed `*.spec.ts` test suites and advanced cases (network mocks, multi-tab, PDF).
- `Verification gate: playwright:<spec-path>` runs through the CLI.
- Also serves as silent fallback when `agent-browser` is not installed.

### Playwright MCP

- **Removed** — was the loser on every metric (context cost, schema overhead, iterations per budget). No replacement needed.

## Removed MCPs

| MCP | Status | Why |
|-----|--------|-----|
| Serena | Removed (plugin directory deleted in W1 of forge-token-cascade-refactor) | Replaced by Engram (richer schema, plugin lifecycle, multi-project). The `lsp` plugin's `forge:lsp-explore` skill remains the supported semantic-code-search story. |
| AIRIS Gateway | Removed from base | Optional via local-packs only. The 3-meta-tool surface added cognitive overhead with no measurable agent gain. |
| Magic | Optional | Available via local-packs; not required by `forge:*` skills. |
| Morphllm | Optional | Available via local-packs; not required. |
| Playwright MCP | Removed | CLI-only is faster and removes a moving part. |

## Agent-MCP allowlist

Each agent's frontmatter `tools:` field includes the explicit `mcp__<server>__*` entries. Sub-agents do **not** inherit MCPs from the main session — without the explicit allowlist, the MCP is invisible to the sub-agent.

See the per-agent matrix in `docs/SDD-DEV-SUITE.md` for who has what.

## Local-packs (developer-only, never synced)

Use `local-packs/bootstrap.sh` to install advanced MCPs (AIRIS, magic, morphllm, etc.) into your **personal** Claude Code config. These never enter target repos via the sync action.
