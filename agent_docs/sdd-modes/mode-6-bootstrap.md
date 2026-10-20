# /sdd Mode 6 — Bootstrap project (greenfield)

> Read this file (explicit `Read` call) when the user selects Mode 6 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

Fresh project. No `<!-- forge:section:project-stack -->` exists in AGENTS.md yet. Agents do not know your stack.

## Skill invoked

`forge:kickstart` (greenfield branch) — see `skills/forge-kickstart/SKILL.md`.

## Greenfield input

- PRD at `templates/prd-greenfield.md` (or equivalent)
- Backlog at `templates/backlog.md` (or `templates/backlog.csv`)

## Flow

```
you → 📥 PRD/backlog intake gate → forge:kickstart → wave plan
   → planner generates per-wave specs (Mode 2 fan-out internally)
   → impl + test + validator + ✅ manual test (per wave)
   → engram sync at the end
```

## Output

- `<!-- forge:section:project-stack:N.N.N -->` block in AGENTS.md
- Domain Map (frontend_paths, backend_paths, database_paths, test_*_paths, config_paths)
- Engram observation `topic_key=project/memory`
- MCP status report

## Approval gates

- 📥 PRD/backlog intake — confirm scope before any planning
- 📋 plan approval — per wave
- ❓ clarification — when blocking
- ✅ MANUAL TEST — per wave (post-validator)

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need architecture_decision` for the kickstart pass (this is design-time)
- `--topic-prefix project/memory` + `spec/<change>`

## Post-archive

After each wave's `opsx:archive`: `engram sync` → commit chunk → `/compact`. See `agent_docs/context-hygiene.md`.

## Examples

```
USER: /sdd 6 (PRD attached)
📥 → forge:kickstart → wave plan (3 waves) → per-wave Mode 2 flow → project/memory persisted
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 6 flow (greenfield bootstrap):

- **pre-bootstrap** (before 📥 PRD/backlog intake): bootstrap loads PRD + backlog from scratch — keeping a stale session alive only costs cache.
- **post-Domain-Map-generation** (after `<!-- forge:section:project-stack -->` is written to AGENTS.md): the Domain Map + project-stack block are now durable on disk and in Engram (`topic_key=project/memory`).
- **post-archive** (per wave): same as Mode 2 — change folder + Engram chunk committed.

Never compact mid-wave or before the ✅ manual-test gate. Each Mode 6 wave internally follows Mode 2 — apply Mode 2's triggers inside each wave. See `agent_docs/context-hygiene.md`.
