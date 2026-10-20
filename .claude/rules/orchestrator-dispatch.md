# Orchestrator Dispatch — Map

Lean rule. Detail lives in `agent_docs/dispatch-*.md` — referenced docs never
auto-load on any runtime (OpenCode and Codex have no lazy loading; Claude Code
only lazy-loads its own subtree). `Read` them explicitly, when needed:

- `Read agent_docs/dispatch-rules.md` when building a dispatch envelope or picking commit checkpoints
- `Read agent_docs/dispatch-waves.md` when executing a wave
- `Read agent_docs/dispatch-escalation.md` on second failure of the same task
- `Read agent_docs/dispatch-mcp-fallback.md` when an MCP server is down
- `Read agent_docs/multi-repo.md` when preflight reports `MULTI_REPO=true`

## Skill per `/sdd` mode

| Mode | Skill | Notes |
|---|---|---|
| 1 simple | `forge:simple` | ≤5 tasks / ≤3 files / 1 endpoint OR component |
| 2 plan+impl | `forge:orchestrate` | Full SDD cycle |
| 3 impl-existing | `forge:orchestrate` | Skips planner |
| 4 research | `forge:research` | Researcher + condense |
| 5 bugfix | direct | Single-domain fix |
| 6 / 6b bootstrap | `forge:kickstart` | Greenfield / brownfield change-request |
| 7 bugfix-pr | direct | Codacy / Copilot reviews |

Old numbers (1–5 pre-renumbering) route to new + 1-release deprecation warning.

## Delegation table (NEVER skip)

| Task | Delegate to | NEVER do yourself |
|---|---|---|
| Plan / proposal / design / tasks.md | `planner` | Write any openspec file |
| Research / web / library docs | `researcher` | Search extensively |
| Implementation | `frontend` / `backend` / `database` | Write or edit code |
| Task state | `agent-sync` | Toggle checkboxes |
| Quality gate | `validator` | Score your own output |
| Branch / commit / PR | `github-ops` | Run git/gh yourself |
| PR review fixes | `bugfix-pr` | Parse PR comments yourself |

About to Write/Edit any file? STOP — delegate.

## Dispatch chain

`you → planner | researcher | frontend | backend | database | tester-front | tester-back | github-ops | validator | agent-sync | agent-prep | devstart | bugfix-pr` — one-shot, no nesting (sub-agents cannot spawn sub-agents).

## Hard limits

≤15 tasks per `tasks.md` · ≤5 spec files per change · ≤3 waves · 1 branch per change folder.

## Pre-wave checklist

- Change folder kebab-case; `proposal.md` + `design.md` + `tasks.md` non-empty
- Delta specs in `openspec/changes/<change>/specs/` (NOT `openspec/specs/`)
- Every task has the schema fields (`schemas/task-format.md`) + machine-checkable `Verification gate`
- Current branch matches `feat/<change>` or `feat/<bundle>` (B1)
- Cycle counter `(change, agent)` < 3 (B4)
- Envelope per dispatch carries `goal: <≤25 words>` + `already_read_files: [...]` (W4; schema in `agent_docs/dispatch-rules.md`)
- `MULTI_REPO=true`: every task carries `Repo: <key>`; preflight `MEMBER_CONTEXT=ok` (on `missing(<repos>)` do NOT dispatch into those repos — surface the member-install gate); member-work envelopes carry `repo: <key>` + `cwd: <member path>` and restate hard restrictions (Codex subagents may not inherit the AGENTS.md chain — never rely on file inheritance)

## Commit checkpoints

Mode 2: `Agent(github-ops, commit_phase=plan|impl|test|archive)`. Mode 1: `impl` + `test` only. Detail in `agent_docs/dispatch-rules.md`.

## Approval gates

- 📋 Plan approval (Modes 2, 6)
- ❓ Clarification — only when blocking
- ✅ Manual test (Modes 2, 3, 5; skipped on 1, 4, 7)

Schema: `schemas/approval-gates.md`.

## Escalation

Fail once → retry · Fail twice → escalate · Fail 3× across change → hard stop (`agent_docs/dispatch-escalation.md`).

## Cascade-stop (W3)

On `[CASCADE-STOP]` from a subagent: do NOT auto-re-dispatch the same role on the same wave. Surface failing step + root cause + wave context to user; user picks fix-+-resume / fix-+-restart / split. Reset state on resume (`rm .claude/state/cascade-depth.json`). Cascade-stop is NOT a B4 cycle-failure increment — it's a HALT signal. Full policy: `agent_docs/cascade-policy.md`.

## Memory (Engram)

**Before each dispatch**: classify task `memory_need`, run `bash scripts/sdd-memory-governor.sh --need <X> --topic-prefix <Y>` (add `--repo <key>` when briefing a member-repo teammate — routes through cross-project search for that member's Engram project), inject result as `engram_context: [...]` in the subagent envelope. Budget: ≤3 cards, ≤1200 tokens. `mem_context` forbidden except post-compaction / explicit user recall / session resume.

**After each wave**: `agent-sync` upserts `state/wave/<change>/<N>`.
**After `opsx:archive`**: orchestrator runs `engram sync`, commits the chunk.
**Mechanical subagents (validator, tester-*, github-ops, agent-sync)**: save-only allowlist — never receive search permission.

Detail: `agent_docs/memory-budget.md` + `agent_docs/dispatch-rules.md` → memory.

## Context hygiene

Issue `/compact` proactively after: research wave complete · `opsx:archive` · validator PASS · before Mode 6/6b · before `/sdd gc` · after heavy `mem_search`+`mem_get_observation` chains. NEVER mid-wave or before the ✅ manual-test gate. Full rule + cost intuition: `agent_docs/context-hygiene.md`.

## MCP fallback (summary)

engram BLOCK if `.engram/` exists + binary missing; else WARN. context7 down → `needs-verification`. figma down + frontend → `needs-mockup-review`. Full matrix: `agent_docs/dispatch-mcp-fallback.md`.

## Multi-repo (loading contract — layer 1)

`MULTI_REPO=true` → Agent Teams + `openspec/config.yaml`. `Read
agent_docs/multi-repo.md` before the first cross-repo dispatch of a session.
Hard rules even without the doc: member-repo work is ALWAYS dispatched with
**cwd = that member's root** — the only portable way its AGENTS.md loads
(sibling repos are invisible on all 3 runtimes; CC `--cc-add-dir` is a
hub-planning extra, never a substitute). Envelopes reference member files by
path ONLY — NEVER inline member instruction content (briefing stays ≤1200
mem-tokens). Hub AGENTS.md never carries member sections; `Repo:` on every
task; contract polls respect the `wave_policy` budget → `BLOCKED [CONTRACT]`
on exhaustion; post-wave `agent-sync` runs `bash scripts/sdd-context-drift.sh
--repo <key>` per touched member — drift triggers a re-audit 📋, never a
silent rewrite.

## Reporting

Every dispatch announced with `[ORCHESTRATE]` prefix.
