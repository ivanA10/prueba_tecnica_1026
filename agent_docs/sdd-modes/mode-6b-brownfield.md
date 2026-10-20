# /sdd Mode 6b — Bootstrap change-request (brownfield)

> Read this file (explicit `Read` call) when the user selects Mode 6b — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

Existing repo, NEW change-request flow. Brownfield with `<!-- forge:section:project-stack -->` already present (or about to be confirmed by `forge:explore`).

## Skill invoked

`forge:kickstart` (brownfield branch) — see `skills/forge-kickstart/SKILL.md`.

## Input

- Change-request document at `templates/prd-brownfield.md` (or equivalent)

## Pre-step (brownfield-specific)

`forge:explore` must seed `topic_key=project/memory` first — the planner reads it to ground decisions in existing patterns.

## Flow

```
you → forge:explore (if project/memory stale or absent)
   → forge:kickstart (brownfield branch)
   → per-wave Mode 2 fan-out
   → archive + engram sync at the end
```

## Approval gates

- 📋 plan approval — per wave
- ❓ clarification — when blocking
- ✅ MANUAL TEST — per wave

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need architecture_decision` for the kickstart pass
- `--topic-prefix project/memory` + `spec/<change>` + `<domain>/<feature>`

The `project/memory` seed from `forge:explore` is the primary context — pass it as the lead briefing card.

## Post-archive

Same as Mode 6: `engram sync` → commit chunk → `/compact`.

## Examples

```
USER: /sdd 6b (change-request attached) → existing Next.js app
forge:explore (refreshes project/memory) → forge:kickstart → wave plan → per-wave Mode 2 flow
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 6b flow (brownfield bootstrap):

- **pre-bootstrap** (before `forge:explore` runs): bootstrap loads change-request + repo audit signals from scratch — keeping a stale session alive only costs cache.
- **post-`forge:explore`** (after `topic_key=project/memory` is seeded/refreshed): the explore wave's file scan trail does not need to stay in context — the lead briefing card delivers the project/memory observation to the planner instead.
- **post-archive** (per wave): same as Mode 2 — change folder + Engram chunk committed.

Never compact mid-wave or before the ✅ manual-test gate. Each Mode 6b wave internally follows Mode 2 — apply Mode 2's triggers inside each wave. See `agent_docs/context-hygiene.md`.
