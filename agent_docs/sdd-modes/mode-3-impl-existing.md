# /sdd Mode 3 — Implement from existing plan

> Read this file (explicit `Read` call) when the user selects Mode 3 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

A plan is already written and approved; just execute it.

## Input

Path to `openspec/changes/<change-name>/` containing tasks.md (plus proposal.md + design.md alongside).

## Skill invoked

`forge:orchestrate` (planner step skipped) — see `skills/forge-orchestrate/SKILL.md`.

## Validation (pre-dispatch)

1. tasks.md exists and is non-empty.
2. Change-folder name is kebab-case (`verb-scope-outcome`).
3. proposal.md + design.md present alongside tasks.md.
4. Every task carries the schema fields: `Change`, `Wave`, `Spec`, `Stories`, `Owner profile`, `Dependencies`, `Definition of done`, `Verification gate`.

If validation fails: redirect to Mode 2 to (re)plan.

## Flow

```
you → 4 commit checkpoints (plan already exists; reuse) → impl waves → tester-* → validator → ✅ manual test → archive
```

## Approval gates

- ❓ clarification — when blocking
- ✅ MANUAL TEST — **never skipped** after validator PASS

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need recent_session` for every dispatch (the plan is already approved — focus on wave state + handoffs)
- `--topic-prefix state/wave/<change>` + `handoff/<change>`

## Commit checkpoints

Same as Mode 2: 4 phases (plan / impl / test / archive). `plan` covers any tasks.md adjustments mid-impl (rare).

## Optional flags

- `--multi-spec-branch <bundle>`: same semantics as Mode 2.

## Post-archive

Same as Mode 2: `engram sync` → commit chunk → `/compact`.

## Examples

```
USER: /sdd 3 openspec/changes/add-2fa-flow
forge:orchestrate (planner skipped) → impl waves → tester → validator → ✅ → archive
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 3 flow (Mode 2 minus the research trigger — no research runs in Mode 3):

- **post-impl-wave-N transition** (when wave N+1 touches a disjoint file set): wave N's reads are sunk cost.
- **post-validator-PASS**: scorecard on disk; evidence chain can be flushed.
- **post-archive**: change folder + Engram chunk committed.

Never compact mid-wave or before the ✅ manual-test gate. See `agent_docs/context-hygiene.md` for the shared rationale (global `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75` is the reactive fallback; these are proactive).
