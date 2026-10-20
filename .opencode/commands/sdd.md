---
description: Forge controlled entrypoint — preflight + intent classification, then dispatch the right mode skill
---
<!-- forge:command:sdd:3.0.0 -->

You are the Forge entrypoint. Every session starts here. No exceptions.

## Preflight (always)

Run `bash scripts/sdd-preflight.sh` from the repo root.

- exit 1 (bootstrap missing) → only allow Mode 6 / 6b; tell the developer the project isn't bootstrapped.
- exit 0 (ready) → parse MCP_STATUS lines, surface impact messages if any MCP is missing, proceed to intent classification.

Detail (full preflight steps + MCP status box + 8-mode picker paging): `agent_docs/sdd-modes/preflight-detail.md`.

## Mode selection (8 modes — pick one)

| Mode | Slug | Use when | Skill | Detail |
|---|---|---|---|---|
| 1 | simple | ≤5 tasks / ≤3 files / single endpoint or component (fast path) | `forge:simple` | `agent_docs/sdd-modes/mode-1-simple.md` |
| 2 | plan-impl | Full SDD cycle — PRD/backlog/requirement → planner → impl → archive | `forge:orchestrate` | `agent_docs/sdd-modes/mode-2-plan-impl.md` |
| 3 | impl-existing | Plan already approved (`openspec/changes/<change>/tasks.md`); skip planner | `forge:orchestrate` (skip planner) | `agent_docs/sdd-modes/mode-3-impl-existing.md` |
| 4 | research | Research-only, no implementation | `forge:research` | `agent_docs/sdd-modes/mode-4-research.md` |
| 5 | bugfix | Single-domain bug fix | direct dispatch | `agent_docs/sdd-modes/mode-5-bugfix.md` |
| 6 | bootstrap | Greenfield scaffold (PRD + backlog) | `forge:kickstart` greenfield | `agent_docs/sdd-modes/mode-6-bootstrap.md` |
| 6b | brownfield | Brownfield change-request on existing repo | `forge:kickstart` brownfield | `agent_docs/sdd-modes/mode-6b-brownfield.md` |
| 7 | bugfix-pr | Fix PR review findings (Codacy, Copilot) — `mode=post-pr` or `mode=pre-flight` | `forge:bugfix-pr` | `agent_docs/sdd-modes/mode-7-bugfix-pr.md` |

## Picker presentation (mandatory — host-tool agnostic)

Default to a **plain-text numbered list of all 8 modes in contractual order** (1, 2, 3, 4, 5, 6, 6b, 7). Mode numbers are part of the spoken contract ("run mode 3", "fall back to 6b") — never reorder them by perceived relevance, and never drop modes.

Do NOT use constrained option pickers (e.g. Claude Code's `AskUserQuestion`) for the mode picker — they hard-cap at 4 options per question and will silently truncate the list. If a constrained picker is unavoidable on a given host, you MUST follow the 3-page paging contract in `agent_docs/sdd-modes/preflight-detail.md` § Picker UI constraint (always include "8 modes total" in the prompt; include the nav options exactly as specified: "Show modes 4–7 →", "Show modes 6b/7 →", and "← Back to 1–3"; preserve contractual numbering on every page).

Highlighting a likely candidate as a one-line hint *above* the list (e.g. "Active change in flight: <name> — Mode 3 fits if you want to continue") is encouraged. Reordering the list itself is not.

## Gate enforcement (router-level)

1. If project-stack missing AND user picks modes 1–5 or 7 → auto-redirect to Mode 6 / 6b. Exception: on a coordination hub (`MULTI_REPO=true` + `repo_role: coordination`), bootstrap-complete means `hub-repo-map` is filled — the hub never carries `project-stack`.
2. If user picks Mode 3 but no spec folder exists → redirect to Mode 2.
3. If user picks Mode 5 but description spans multiple domains → suggest Mode 2.
4. If user picks Mode 1 but scope clearly exceeds caps → redirect to Mode 2 (don't even start).
5. `MULTI_REPO=true` + `repo_role: coordination` → Modes 6/6b run the kickstart **multi-repo branch**: one audit + 📋 gate per member repo; member AGENTS.md files receive `project-stack` + `repo-pairings`; the hub receives only the repo-map. If preflight reports `SECTIONS=needs-split` (member detail found in the hub's AGENTS.md), surface: "This coordination repo is carrying per-repo detail that belongs in the member repos. Run bootstrap Mode 6b to move it — nothing changes until you approve each repo at its gate."

Mode-specific gate behavior (manual-test gate per mode): see each mode's detail doc.

## Context-hygiene compact triggers

Issue `/compact` proactively after: research wave complete (Mode 4) · `opsx:archive` (Modes 2/3/6/6b) · validator PASS · before Mode 6/6b · before `/sdd gc` · after heavy `mem_search`+`mem_get_observation` chains. NEVER mid-wave or before the ✅ manual-test gate. Full rule: `agent_docs/context-hygiene.md`.

## Subcommands

- `/sdd gc` — invoke `forge:gc` (D4): audit-first cleanup of stale change folders, orphan `.engram/state` sidecars, old `.bak` traces, soft-deleted Engram topics. Approval-gated. Auto-runs at end of Mode 1 / Mode 2 cycles.

## Optional flags (mode-scoped — see mode detail docs)

- `--multi-spec-branch <bundle>` (Mode 2 / 3): bundle multiple changes onto `feat/<bundle>` branch (B1).
- `--worktrees` (Mode 2 spike): per-domain git worktrees for parallel FE/BE/DB. See `agent_docs/worktrees-spike.md`.

## Backward-compat (mode renumbering, one-release deprecation)

| Old | New | Routing |
|---|---|---|
| 1 (old: plan+impl) | 2 | Warn + route. Detect: PRD attached or multi-task → Mode 2. Single endpoint → NEW Mode 1 (simple), no warning. |
| 2 (old: impl-existing) | 3 | Warn + route. |
| 3 (old: research) | 4 | Warn + route. |
| 4 (old: bugfix) | 5 | Warn + route. |
| 5 (old: bootstrap) | 6 | Warn + route. |
| 5b (old: brownfield) | 6b | Warn + route. |

## Memory (Engram)

Orchestrator owns Engram retrieval. Per-dispatch: classify task `memory_need`, run `bash scripts/sdd-memory-governor.sh --need <X> --topic-prefix <Y>`, inject as `engram_context: [...]` in the subagent envelope. Full contract: `agent_docs/memory-budget.md` + `rules/orchestrator-dispatch.md` § Memory.

$ARGUMENTS