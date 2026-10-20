---
name: forge:simple
version: 1.0.0
description: >
  Fast-path skill for /sdd Mode 1. Delivers a single endpoint, a single
  frontend component change, or a small bug-adjacent feature without the
  full SDD plan + design + manual-test cycle. Hard-capped at ≤5 tasks,
  ≤3 files modified, 1 endpoint OR 1 component, and 1 owner profile.
  Skips planner, proposal.md, design.md, the manual-test gate, and the
  plan / archive commit checkpoints. Auto-promotes to Mode 2 when the
  orchestrator detects scope > caps mid-flow.
triggers: ["simple mode", "fast path", "small change", "single endpoint", "single component", "/sdd 1"]
layer: 2
wraps: opsx:apply (single task)
phase: implementation
applies-to: orchestrator, frontend, backend, database, validator, github-ops
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:simple

## Scope caps (hard limits — auto-promote on violation)

| Limit | Value |
|---|---|
| Tasks | ≤ 5 |
| Files modified | ≤ 3 |
| Endpoint(s) | 1 OR |
| Component(s) | 1 |
| Owner profile | 1 (single domain) |
| Waves | 1 |

If the orchestrator detects mid-flow that any cap is exceeded (e.g., the impl agent reports it needs to touch 5 files instead of 2), STOP and auto-promote to Mode 2 with a clear notification:

```
Scope-promote: Mode 1 (simple) cannot complete this change — `<reason>`. Promoting to Mode 2 (plan + implement) now. The orchestrator will dispatch the planner for proposal.md + design.md before continuing.
```

## Flow

```
you (orchestrator) → resolve target file(s) + owner domain
                  → write a minimal auto-generated tasks.md (≤5 tasks)
                  → Agent(<owner-profile>) → implement + tests inline
                  → Agent(tester-front | tester-back)
                  → Agent(github-ops, commit_phase=impl)
                  → Agent(validator) — runs the C5 scorecard
                  → Agent(github-ops, commit_phase=test)
                  → done
```

No `proposal.md`. No `design.md`. No 📋 plan-approval gate. No ✅ manual-test gate (auto-tests + scorecard hard-fails are sufficient).

## Auto-generated tasks.md format

```markdown
<!-- forge:section:simple-mode-tasks:1.0.0 -->
# tasks.md — `<change-name>` (Mode 1 — simple)

- [ ] 1.1 <task title>
  - **Change:** <change-name>
  - **Spec:** n/a
  - **Spec wave slice:** n/a
  - **Stories:** <ad-hoc-id or "none">
  - **Owner profile:** <single domain>
  - **Dependencies:** none
  - **Definition of done:** <one-line>
  - **Verification gate:** <C4-locked type>
<!-- /forge:section:simple-mode-tasks -->
```

Up to 5 such tasks. Use C4-locked verification-gate types (`cmd:`, `playwright:`, `agent-browser:`, `opsx:verify`, `manual:`).

## Test proportionality (Mode 1 cap)

**1–2 tests per task.** Happy path + 1 critical edge case (auth fail / null input / 4xx response). That's it.

Do NOT add:
- Defensive tests for type-mismatched inputs that TypeScript/Pydantic already rejects.
- Snapshot tests of the response shape.
- Performance benchmarks for non-perf-sensitive endpoints.
- Library-behavior tests (the library is already tested upstream).
- E2E flows for changes that don't cross the network.

Stop the moment the `Verification gate:` passes and the cap is met. The validator penalizes over-testing as `WARN: over-tested` in the C5 scorecard. See `skills/forge-implement/SKILL.md` → "Test proportionality" for the full table.

## Validator behavior in Mode 1

The validator runs the same C5 scorecard but:
- Skips the manual-test handoff (no ✅ gate).
- Hard-fail thresholds still apply — a `code-quality=0` still fails the change.
- Output JSON is written to `.engram/state/verify-<change>.json` for the test commit.

## Commits

Two commits total:
1. `feat(<scope>): <change> [ref: <change>]` — impl + tests scoped via the B2 mechanism.
2. `test(<change>): validator pass [ref: <change>]` — verify sidecar + tasks JSON sidecar.

No `plan(...)` or `chore(archive): ...` commits in Mode 1.

## Acceptance

- "Add a /health endpoint" via Mode 1 → ≤4 `Agent()` calls (impl + tester + github-ops + validator), 2 commits.
- "Add user authentication with email + OAuth" via Mode 1 → orchestrator detects scope > caps → auto-promotes to Mode 2 with a notification.
- Old Mode 1 (`/sdd 1` pre-renumbering, meaning "plan + implement") routes to new Mode 2 with a one-line deprecation warning.

<!-- forge:skill:forge-simple:3.0.0 -->
