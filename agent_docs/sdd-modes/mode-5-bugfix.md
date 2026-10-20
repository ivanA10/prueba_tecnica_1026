# /sdd Mode 5 — Adjust or bugfix (single-domain)

> Read this file (explicit `Read` call) when the user selects Mode 5 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

A focused bugfix or small adjustment limited to a single domain (frontend OR backend OR database).

## Input

- file reference (path or symbol)
- error description / repro

## Cross-domain rule

If the description spans multiple domains → **redirect to Mode 2** (full SDD). Mode 5 is single-domain only.

## Skill invoked

Direct dispatch (no orchestrator skill) — `you → single-domain agent`.

## Flow

```
you → single-domain agent (frontend | backend | database)
   → tester (front | back)
   → validator (C5 scorecard)
   → ✅ manual test
```

## Approval gates

- ❓ clarification — when repro is ambiguous
- ✅ MANUAL TEST — **never skipped** after validator PASS

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need similar_issue` (this exact bug or symptom may have been seen before)
- `--topic-prefix <domain>/<feature>/bugfix`

## Commit checkpoints

Two phases: `impl` + `test` (no `plan` / `archive` — there is no spec for a single-file bugfix).

## Test budget

Per `rules/agent-common.md` → Test proportionality: 1 regression test + happy retest. Hard cap: ≤6 tests for the task.

## Examples

```
USER: /sdd 5 "src/api/users.ts:42 — null pointer when role is undefined"
backend → tester-back → validator → ✅ → done
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 5 flow:

- **post-validator-PASS**: scorecard on disk; per-criterion evidence chain can be flushed.
- **post-single-commit** (after `github-ops` lands the impl+test commit): the fix is durable; bug exploration trail can be flushed.

Never compact mid-fix or before the ✅ manual-test gate. Mode 5 is typically short-lived — skip both triggers if there's no follow-up session ahead (`/compact` overhead ≥ savings for one-shot fixes; rule of thumb: skip if ≤5 turns remain). See `agent_docs/context-hygiene.md`.
