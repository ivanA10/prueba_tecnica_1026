# Architecture — four layers

<!-- updated: refactor/audit-v2 2026-05-05 -->

> Loaded for onboarding or when the user asks how the harness fits together. Audit-v2 note: dispatch detail moved out of `rules/orchestrator-dispatch.md` into `agent_docs/dispatch-*.md` (read explicitly when dispatching — they never auto-load).

This repo (`forge`) is a **distribution artifact**, not an application. It ships four discrete layers via a GitHub Action that syncs target repos.

## Layer 1 — OpenSpec (upstream SDD framework)

Source: https://github.com/Fission-AI/OpenSpec.

Provides the underlying spec/change/archive primitives:
- `opsx:propose`, `opsx:apply`, `opsx:verify`, `opsx:archive`, `opsx:explore`, `opsx:new`, `opsx:ff`.
- `openspec/` directory contract: `specs/`, `changes/`, `config.yaml`.

We treat OpenSpec as the engine. The Forge baseline wraps it in skills for team-facing use.

## Layer 2 — Forge baseline (the contract)

Synced to every target repo by the action:
- `AGENTS.md` sections (project, project-stack, commands, sdd-workflow, memory, boundaries) — version-marker merged.
- `CLAUDE.md` minimal entrypoint (`@AGENTS.md` import + Claude-specifics).
- **13** `forge:*` wrapper skills in `.claude/skills/forge-*/SKILL.md` (see `agent_docs/skills-catalog.md`).
- **15** sub-agent definitions in `.claude/agents/*.md` (audit-v2 added `bugfix-pr`).
- Shared rules in `.claude/rules/*` (orchestrator-dispatch, agent-common).
- Settings baseline in `.claude/settings.json` (deep-merged from `templates/settings/`: permissions allow-list, hooks for branch gate / scope guard / perf instrumentation / allowlist suggestions).
- OpenSpec config + handoff/progress templates.
- MCP configs (Engram, context7) per detected tool — `.claude/`, `.cursor/`, `.codex/`, `.opencode/`.

## Layer 3 — Repo profiles (optional)

Per-repo extensions: `frontend`, `backend-api`, `brownfield`, `high-risk`. See `agent_docs/profiles.md`.

## Layer 4 — Local extensions (developer-only)

`local-packs/` content for individual developers' personal Claude Code/OpenCode setup. Examples: AIRIS, Magic, Morphllm, additional MCP servers. **Never** synced to target repos.

## Distribution model — how the action works

`action.yml` runs these steps on a target repo:

1. **Detect tools** — `installer/detect-tools.sh` outputs a comma-separated list (`claude-code,cursor,...`).
2. **Resolve preset** — when `inputs.preset` is set, `installer/resolve-preset.sh` auto-detects role + profiles (overrides legacy `repo_type` / `repo_role` / `profile` inputs).
3. **Merge `AGENTS.md`** — `installer/merge-agents.js` is non-destructive and version-aware via `<!-- forge:section:name:version -->` markers.
4. **Sync MCP configs** — deep JSON merge per detected tool.
5. **Init or merge OpenSpec directory** — copy-if-missing.
6. **Sync schemas and templates** — `schemas/`, `templates/openspec/` — copy-if-missing.
7. **Merge baseline settings** — `installer/merge-settings.js` deep-merges `templates/settings/{permissions,hooks,claude-settings}.json` into `.claude/settings.json` (allow-list union; user keys preserved).
8. **Install SDD commands and scripts** — `/sdd` entrypoint, `sdd-preflight.sh`, `sdd-state-reaper.sh`, `sdd-pre-implement.sh`, `sdd-scope-check.sh`, `sdd-cascade-cap.sh`, `sdd-trace-hook.sh`, `sdd-suggest-allowlist.sh`.
9. **Install/update skills** — force-override for `forge:*` and community skills.
10. **Install/update agents** — version-marker aware; never overwrites user-customized agents.
11. **Install rules** — force-override `rules/*` to `.claude/rules/*` (agent-common, orchestrator-dispatch).
12. **Apply profile** if selected (or auto-resolved from preset).
13. **Merge `CLAUDE.md`** — section-marker merge; create compatibility entrypoints (`.github/copilot-instructions.md`).
14. **Commit and open PR** (or direct push).

## Non-destructive guarantees

- AGENTS.md and CLAUDE.md use versioned section markers — content outside markers is **never** touched.
- MCP configs are deep-merged — user keys preserved.
- OpenSpec, schemas, templates: copy-if-missing only.
- Rules and skills: force-override (always latest from source).
- Agents: version-marker check; user-customized agents preserved.

## Memory architecture (Engram)

- Single binary, ~/.engram/engram.db.
- SQLite + FTS5 backend.
- MCP stdio interface.
- Per-project namespace (auto from git remote).
- Topic_key contract in `schemas/memory-topics.md`.
- Plugin lifecycle hooks (start, stop, compaction recovery) provided by the official Claude Code plugin.

## Source structure

```
forge/
├── action.yml                    # GitHub Action entrypoint (preset-aware)
├── audit/run.sh                  # Hard-gate harness test (temp folder + acceptance checks)
├── installer/                    # Sync logic (bash + node) — incl. resolve-preset, merge-settings, lint-md
├── agents/claude/                # 13 agent .md sources (orchestrator archived as reference stub; team-leader removed in v3 cleanup; bugfix-pr from audit-v2)
├── skills/                       # 13 forge:* + community
├── rules/                        # agent-common, orchestrator-dispatch (≤80 lines)
├── schemas/                      # memory-topics, task-format, tasks-json, validator-scorecard
├── scripts/                      # sdd-preflight, sdd-state-reaper, sdd-pre-implement, sdd-scope-check, sdd-cascade-cap, sdd-trace-hook, sdd-suggest-allowlist
├── templates/                    # CLAUDE.md, AGENTS.md, openspec/, settings/, repo-audit, prd-{greenfield,brownfield}, backlog
├── agent_docs/                   # offloaded long-form docs (this dir) — incl. dispatch-{rules,gates,escalation,mcp-fallback,waves}
├── profiles/                     # frontend, backend-api, brownfield, high-risk
├── local-packs/                  # developer-local MCP recipes (Layer 4)
└── docs/                         # HARNESS-GUIDE, MIGRATION-v2, UPGRADE-v2, SDD-DEV-SUITE, GOVERNANCE, TESTING
```
