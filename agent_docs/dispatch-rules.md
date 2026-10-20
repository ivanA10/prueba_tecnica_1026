# Dispatch Rules — Detail

Full rules referenced by `rules/orchestrator-dispatch.md`. Read this file (explicit `Read` call) when a dispatch needs envelope/commit/mode detail beyond the lean rule — referenced docs never auto-load on any runtime.

## Mode flows

### Mode 1 — simple (fast path)

Scope cap: ≤5 tasks, ≤3 files modified, 1 endpoint OR 1 component.

```
you → frontend | backend | database (single agent, direct dispatch)
    → tester-front | tester-back
    → github-ops (commit_phase=impl)
    → validator
    → github-ops (commit_phase=test)
    → done
```

No `proposal.md`, no `design.md`. A single auto-generated `tasks.md` (≤5 tasks). Single wave. Validator runs the C5 scorecard but the manual-test gate is skipped (auto-tests + scorecard sufficient). `forge:gc` runs at end. Two commits total.

**Auto-promote to Mode 2** if mid-flow the orchestrator detects scope > caps (>5 tasks emerged, >3 files modified, multi-domain). Notify the user with the trigger and open Mode 2 for the same change.

### Mode 2 — plan + implement (default full SDD)

```
you → researcher (if unknowns)
    → planner → 📋 plan approval gate
    → github-ops (commit_phase=plan)
    → frontend | backend | database (parallel, per-wave)
    → tester-front | tester-back
    → github-ops (commit_phase=impl)
    → validator → ✅ manual-test gate
    → github-ops (commit_phase=test)
    → opsx:archive → engram sync
    → github-ops (commit_phase=archive)
```

### Mode 3 — implement existing plan

Skip planner. Validate the existing change folder (kebab-case, all artifacts present), then proceed from impl wave onward. Same 4 commits as Mode 2.

### Mode 4 — research

```
you → researcher → research.md
    → (optional) planner (if user wants spec from findings)
```

No commits, no validator. Output is `openspec/changes/<change>/research.md`.

### Mode 5 — bugfix (single domain)

```
you → frontend | backend | database (one only)
    → tester-front | tester-back
    → validator → ✅ manual-test gate
    → github-ops (single squash commit)
```

Cross-domain → redirect to Mode 2.

### Mode 6 / 6b — bootstrap

- 6 = greenfield (`forge:kickstart`, PRD intake 📥)
- 6b = brownfield change-request (`templates/prd-brownfield.md` intake)

Output: AGENTS.md `project-stack` section, Domain Map, Engram `project/memory`, MCP availability report. Audit doc (`templates/repo-audit.md`) is rendered into `.sdd/repo-audit.md` for human approval and auto-deletes post-approval.

### Mode 7 — bugfix-pr

Two sub-modes:
- `mode=post-pr` (default) — manual invocation, comments on PR with classified findings
- `mode=pre-flight` — auto-dispatched by `github-ops` before PR creation when Codacy critical present; blocks PR until critical resolved

See B5 in the plan and `agents/claude/bugfix-pr.md`.

## Mode renumbering migration

| Old | New | Mode |
|---|---|---|
| 1 | 2 | plan + implement |
| 2 | 3 | implement existing plan |
| 3 | 4 | research |
| 4 | 5 | bugfix |
| 5 | 6 | bootstrap greenfield |
| 5b | 6b | bootstrap brownfield change-request |
| — | 1 | simple (NEW) |
| — | 7 | bugfix-pr (NEW) |

For one release, old numbers route to new with: `"Mode N (old: <name>) is now Mode M. Routing your request to Mode M — update your habit."`

## Scope decomposition gate

Before dispatching planner, evaluate request scope. If > 1 epic OR > 8 stories OR > 3 distinct domains:

1. STOP — do not pass as a single change.
2. Decompose into N changes. Each: max 15 tasks, max 5 spec files.
3. Present decomposition to user for approval.
4. After approval, dispatch planner per change sequentially.
5. Planner outputs go to separate `openspec/changes/<change-name>/` folders.

## Dispatch template (every Agent() call)

```
You are the [agent-name] agent. Execute using the [skill] flow.
Read AGENTS.md project-stack first.
Your tasks from openspec/changes/<change>/tasks.md: [list].
Relevant specs: [paths].
Report completion by checking off tasks.
You work alone — no sub-agents, no delegation.
```

## Dispatch envelope (W4 of forge-token-cascade-refactor)

Every `Agent()` call MUST include these two fields in addition to the existing envelope shape (see `skills/forge-orchestrate/SKILL.md` → "Dispatch envelope" for the full YAML):

### `goal: <≤25 words>` (mandatory)

The task scope in one line. Forces the orchestrator to commit to a specific outcome and gives the subagent an explicit boundary to stay within. Drives 23-54% token reduction (SWE-Pruner finding) by preventing exploratory drift.

Examples:
- `"Add POST /metrics endpoint returning prometheus text/plain; do not touch existing /health endpoint."`
- `"Implement the failing happy-path test in src/components/Button.test.tsx; do NOT add edge cases."`
- `"Migrate users.email column to VARCHAR(320); reversible down migration required."`

Missing `goal` → subagent surfaces `[BRIEFING] missing goal` BLOCKED. The orchestrator dispatched incorrectly and must re-emit with the field populated.

### `already_read_files: [<paths>]` (mandatory; may be `[]`)

The paths the orchestrator has already loaded into shared context. Subagents MUST NOT re-`Read` any path in this list unless another subagent edited it within the current wave. Eliminates the worst-trace `tasks.md`-read-5×-across-subagents pattern.

Special rules:
- Absent field (legacy envelope shape) → treat as `[]` and log `[BRIEFING] WARNING: pre-W4 envelope` to stderr; do not BLOCK.
- Empty list `[]` is legitimate (orchestrator did not pre-load anything).
- If a path was edited by another subagent's `Write`/`Edit` in this wave, you MAY re-Read it; the orchestrator should update `already_read_files` to remove edited paths before re-dispatch, but stale lists are tolerated.

### Enforcement (W4)

Per adjustment D of the approved plan: **honor-system + validator audit, no runtime hook.** The validator's criterion 6 `verification_gates` scorecard check includes a re-read audit:

- The validator greps `.claude/state/agent-trace.log` for `tool=Read` entries whose path matches any entry in the wave's `already_read_files` declaration.
- Each redundant Read caps `verification_gates` at score 1 (downgrade), with `evidence` citing the specific path + dispatch envelope.
- The criterion's hard-fail floor (< 1) is NOT triggered by re-reads alone — criterion 6 hard-fails only when verification gates themselves fail. Re-reads are a quality downgrade, not a quality failure.

Why honor-system: a runtime "did this subagent Read a path it shouldn't have" hook would require per-dispatch state correlation between PreToolUse and the active envelope, and Read frequency outside the wave is desirable (mid-wave re-reads are sometimes legitimate after edits). The validator audit is sufficient signal to drive behavioral discipline.

## Cross-domain conflict resolution

- FE + BE share an API contract → define contract in `design.md` BEFORE dispatch.
- BE needs DB migration → dispatch database FIRST, then backend.
- Cross-domain dependency → record in tasks.md `Dependencies:` and sequence accordingly.

## Memory protocol (operational)

- Per task start: `mem_search topic_prefix:<your-namespace>/<feature>` to avoid duplicate work.
- Per decision/bugfix/pattern: `mem_save topic_key=<schema-key>` immediately.
- Per wave end: `agent-sync` upserts `state/wave/<change>/<N>`.
- Post-archive: orchestrator runs `engram sync` and commits `.engram/<chunk>.json.gz` with the PR.
- Cross-namespace writes are forbidden (enforced by per-agent `memory_namespaces`).

See `schemas/memory-topics.md` for the full namespace map.
