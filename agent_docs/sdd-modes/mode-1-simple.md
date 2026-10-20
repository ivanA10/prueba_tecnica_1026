# /sdd Mode 1 — Simple

> Read this file (explicit `Read` call) when the user selects Mode 1 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

Fast path for small work:

- ≤5 tasks
- ≤3 files modified
- 1 endpoint OR 1 component
- 1 owner profile

If any cap is exceeded, redirect to Mode 2 (don't even start).

## Skill invoked

`forge:simple` — see `skills/forge-simple/SKILL.md`.

## Skips

- planner (no proposal.md / design.md generation)
- ✅ manual-test gate (auto-tests + C5 scorecard sufficient)

## Flow

```
you → owner agent → tester → github-ops(impl) → validator → github-ops(test) → done
```

## Auto-promote

If scope grows mid-flow (e.g., multi-domain, file count exceeds cap), orchestrator promotes to Mode 2 with a notification — the change folder is upgraded with proposal.md/design.md before continuing.

## Approval gates

- ❓ clarification — only when blocking
- ✅ MANUAL TEST — **skipped** (auto-tests + C5 sufficient)

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need similar_issue` for the owner-agent dispatch (look for recent fixes in this domain/feature)
- `--topic-prefix <owner>/<feature>` (e.g., `backend/auth` or `frontend/settings-page`)

## Commit checkpoints

Two phases only: `impl` + `test` (no `plan` / `archive`).

## Examples

```
USER: /sdd 1 "Add /healthz endpoint with 200 OK"
forge:simple → backend → tester-back → github-ops(impl) → validator → github-ops(test) → done
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 1 flow:

- **post-validator-PASS + C5 scorecard on disk**: auto-tests passed, scorecard is in `.engram/state/verify-<change>.json` — per-criterion evidence chain can be flushed.
- **before `forge:gc` auto-runs**: gc audit doesn't need prior session content.

Never compact mid-wave or before the C5 scorecard lands. See `agent_docs/context-hygiene.md` for the shared rationale (global `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75` is the reactive fallback; these are proactive).
