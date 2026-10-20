---
name: forge:verify
version: 3.0.0
description: >
  Runs the validator agent in an isolated read-only context to produce a
  /18 quality scorecard, manual test checklist for the ✅ gate, and
  pre-archive verdict. Use this skill whenever the user says "verify",
  "validate", "review the change", "validar", "revisar antes de mergear",
  or whenever forge:implement reports completion of all wave tasks.
  Saves a verify/<change> Engram entry with PASS/FAIL and remediation
  notes if needed. Do NOT use during implementation (premature), do NOT
  use to fix issues (return to forge:implement), and do NOT skip when
  preparing to archive a change.
triggers: ["verify", "verificar", "review", "revisar", "check", "validar"]
layer: 2
wraps: opsx:verify
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:verify

Verify that implementation matches spec intent. Wraps OpenSpec's `opsx:verify` with an isolated reviewer sub-agent that was NOT involved in implementation.

## One-shot example (Mode 2)

```
ORCHESTRATOR: Agent(validator, change=add-auth-flow)

forge:verify (validator agent)
  ├─ load proposal.md, design.md, tasks.md, .engram/state/tasks-add-auth-flow.json
  ├─ read agent_docs/validator-calibration.md (few-shot anchors)
  ├─ run project-stack `Lint` and `Test` commands (npx vitest run, eslint --no-fix)
  ├─ parse each task's Verification gate (C4-locked types) and execute:
  │     - cmd: npm test src/auth/jwt.test.ts            → pass
  │     - playwright: tests/e2e/login.spec.ts            → pass
  │     - manual: 1) sign out 2) reset password ...      → render to checklist
  ├─ score 6 criteria with evidence per criterion
  ├─ write .engram/state/verify-add-auth-flow.json:
  │     {
  │       "scorecard": {
  │         "functional_completeness":{"score":3, "hard_fail_threshold":1, ...},
  │         ...
  │         "verification_gates":     {"score":3, ...}
  │       },
  │       "total": 16, "verdict": "PASS",
  │       "manual_test_checklist": ["1) ...", "2) ..."]
  │     }
  ├─ mem_save topic_key=verify/add-auth-flow (mirror)
  └─ emit human readout + ✅ MANUAL TEST GATE (Mode 2/3/5; skipped on Mode 1)

If any criterion < hard-fail threshold → verdict=FAIL even at total ≥ 12. Manual gate is BLOCKED until resolved.
```

## Flow

1. **Load specs** — `proposal.md`, `design.md`, `tasks.md` for the current change, plus `handoff.md` if present.
2. **Load research and prior context** — `openspec/changes/<current>/research.md`, `mem_search topic_prefix:research/` for the topic, `mem_search topic_prefix:state/wave/<change>` to confirm wave completion.
3. **Dispatch isolated reviewer** — a fresh reviewer context with NO implementation carry-over:
   - reads specs independently
   - uses `handoff.md` first when present to understand approved scope boundaries, closed decisions, and verification expectations
   - reviews the implementation code
   - runs project-stack `Lint / format` and `Test` commands
   - checks against the three verification dimensions below
   - if the runtime lacks true sub-agents, use a logically isolated verification pass and state that explicitly
4. **Run opsx:verify** (expanded profile only — see profile note below).
5. **Combine reports** — merge reviewer findings with opsx:verify output into a /18 scorecard.
6. **Persist** — `mem_save topic_key=verify/<change-name>` with scorecard, verdict (PASS / WARN / FAIL), and remediation notes.
7. **Surface issues + ✅ gate** — present to user with severity (BLOCKER / WARNING / SUGGESTION) and the manual-test checklist.

## Six C5 criteria (each 0–3, total /18, with hard-fail thresholds)

See `schemas/validator-scorecard.md` for the full schema and `agent_docs/validator-calibration.md` for few-shot anchors.

| Criterion | Hard-fail < |
|---|---|
| Functional completeness | 1 |
| Spec adherence | 1 |
| Code quality | 1 |
| Test coverage | 2 |
| NFR compliance | 1 |
| Verification gates (parses C4-locked types) | 1 |

Verdict logic:
- `total < 12` → FAIL
- ANY criterion below its hard-fail threshold → FAIL (even if total ≥ 12)
- `12 ≤ total ≤ 14` AND all thresholds met → WARN
- `total ≥ 15` AND all thresholds met → PASS

Output: `.engram/state/verify-<change>.json` with full per-criterion evidence + `mem_save topic_key=verify/<change-name>` mirroring the same JSON.

## Why isolated?

The reviewer must be a separate agent/context from the implementer to avoid confirmation bias. An agent that wrote the code will naturally think it's correct.

## When to use

- After `forge:implement` completes all tasks.
- Before `opsx:archive` — always verify first.
- When resuming work and need to check current state.

**Profile note:** `opsx:verify` is available in the **expanded profile** only
(`workflows` list in `openspec/config.yaml` must include `verify`).
For repos on the default profile, run the three verification dimensions as a logically isolated
review pass without invoking `opsx:verify` directly, and note that explicitly in the output.

## Next step

If verification passes, proceed to `opsx:archive`. If issues found, return to `forge:implement` for fixes.

After `opsx:archive` completes, the orchestrator MUST run `engram sync` to export the change's new memories to `.engram/` so they can be committed with the PR. Without this, research, contracts, and decisions stay in the local DB only and teammates can't pick them up. See `.claude/rules/orchestrator-dispatch.md` → "Memory Sync".

Verification emits a **post-verify checkpoint**: pass/fail status, blockers, follow-up path, and whether the approved scope stayed intact.

## Manual test handoff (mode-aware)

| Mode | Manual gate? |
|---|---|
| 2 / 3 / 5 | ✅ REQUIRED — never skip |
| 1 (simple) | SKIPPED — auto-tests + scorecard sufficient (manual checklist still logged in JSON) |
| 4 (research) / 7 (bugfix-pr) | N/A — validator does not run |
| 6 / 6b (bootstrap) | only if implementation is in the same change folder |

For Modes 2 / 3 / 5 PASS:
- Use the ✅ gate from `schemas/approval-gates.md`. Checklist must be specific (≥3 items).
- AC from `tasks.md` that require manual verification, concrete instructions, areas not covered by auto-tests.
- ANY hard-fail criterion → manual gate is BLOCKED until resolved.

<!-- forge:skill:forge-verify:3.0.0 -->
