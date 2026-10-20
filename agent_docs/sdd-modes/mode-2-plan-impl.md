# /sdd Mode 2 — Plan and implement (full SDD)

> Read this file (explicit `Read` call) when the user selects Mode 2 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

Full SDD cycle for any non-trivial change: multi-task, multi-domain, or anything exceeding Mode 1's caps.

## Input

- PRD, backlog item, or direct requirement description

## Skill invoked

`forge:orchestrate` — see `skills/forge-orchestrate/SKILL.md`.

## Flow

```
you → researcher (if unknowns)
   → planner
   → 📋 plan approval
   → 4 commit checkpoints (plan | impl | test | archive)
   → validator (C5 scorecard)
   → ✅ manual test
   → archive (opsx:archive + engram sync)
```

## Approval gates

- 📋 plan approval — mandatory after planner generates proposal.md/design.md/tasks.md
- ❓ clarification — when blocking ambiguity surfaces
- ✅ MANUAL TEST — **never skipped** after validator PASS

## Commit checkpoints (4 phases)

`Agent(github-ops, commit_phase=plan|impl|test|archive)`. Detail in `agent_docs/dispatch-rules.md`.

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

| Sub-agent target | `--need` | `--topic-prefix` |
|---|---|---|
| planner | `architecture_decision` | `spec/<change>` + `<domain>/<feature>` |
| researcher | `similar_issue` | `research/` |
| implementation agents (frontend/backend/database) | `recent_session` | `state/wave/<change>` + `handoff/<change>` |
| validator | `recent_session` | `verify/` + `spec/<change>` |

## Optional flags

- `--multi-spec-branch <bundle>`: bundle multiple changes onto `feat/<bundle>` branch (B1).
- `--worktrees`: spike — create per-domain git worktrees for parallel FE/BE/DB execution. Not default. See `agent_docs/worktrees-spike.md`.

## Post-archive

After `opsx:archive` completes:
1. Run `engram sync` to export new memories to `.engram/<chunk>.json.gz`.
2. Commit the chunk via `github-ops commit_phase=archive`.
3. Issue `/compact` before the next dispatch (NEVER mid-wave or before ✅ manual-test gate). See `agent_docs/context-hygiene.md`.

## Examples

```
USER: /sdd 2 "Add notification preferences end-to-end"
forge:orchestrate → planner → 📋 → wave 1 (db + backend + frontend) → wave 2 (FE wiring) → tester-* → github-ops(impl) → validator → ✅ → archive
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 2 flow:

- **research-wave-end** (if researcher ran): `research.md` is on disk; the multi-hop trail does not need to stay in context.
- **post-📋 plan-approval**: `proposal.md`/`design.md`/`tasks.md` are on disk; planner thinking can be flushed before impl waves start.
- **post-impl-wave-N transition** (when wave N+1 touches a disjoint file set; `agent-sync` upserts the wave state to Engram): wave N's reads are sunk cost.
- **post-validator-PASS**: scorecard persisted to `.engram/state/verify-<change>.json`; per-criterion evidence chain can be flushed.
- **post-archive** (after `opsx:archive` + `engram sync`): change folder + chunk are committed; bodies don't need to stay loaded.

Never compact mid-wave or before the ✅ manual-test gate (validator evidence must remain legible to the human reviewer). See `agent_docs/context-hygiene.md` for the shared rationale (global `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75` is the reactive fallback; these are proactive).
