# Validator Scorecard v2 (C5)

> Anthropic Mar 2026: subjective grading is tractable when criteria are concrete + calibrated + weighted with hard-fail thresholds. We adapt that pattern for SDD's software-quality context.

## Display

**Total: /21** — seven criteria × three points each. (Was /18 before W3 of `feat/forge-token-cascade-refactor`, which added criterion 7 `cascade_discipline`.)

## Verdict logic

```
verdict = FAIL  if total < 14
       OR FAIL  if any criterion is below its hard-fail threshold
       OR WARN  if total in [14, 16] AND all criteria meet threshold
       OR PASS  if total >= 17 AND all criteria meet threshold
```

A `19/21` total with `code-quality = 0` is still a **FAIL** (hard-fail). Bands are proportionally shifted from the pre-W3 (/18) version: PASS≥17 (was ≥15), WARN[14,16] (was [12,14]), FAIL<14 (was <12).

## Criteria (each 0–3, total /18)

### 1. Functional completeness (hard-fail < 1)

> All `tasks.md` AC met; no half-built features; happy-path user flows demonstrably work.

| Score | Anchor |
|---|---|
| 0 | One or more AC unmet; happy path broken; tasks marked `[x]` but feature not deliverable. |
| 1 | All happy-path AC met. Edge cases or error states not yet wired. |
| 2 | All AC met including major edge cases. Minor polish gaps. |
| 3 | All AC met, edge cases and error states covered, parity with design.md. |

Evidence required: list of AC IDs with pass/fail per task.

### 2. Spec adherence (hard-fail < 1)

> Implementation matches `design.md` and the delta specs. NO scope drift.

| Score | Anchor |
|---|---|
| 0 | Implementation diverges materially from design.md (different shape, different contracts, missing pieces). |
| 1 | Mostly aligned; one or two undocumented deviations the validator can spot. |
| 2 | Aligned with design.md; deviations documented in `design.md` or in-line comments. |
| 3 | 1:1 alignment with design.md; spec is a faithful contract of the code. |

Evidence required: list of files modified vs files declared in tasks.md `Owner profile` paths; flag any out-of-scope writes.

### 3. Code quality (hard-fail < 1)

> Conventions followed (project-stack `Lint / format`); no placeholders / `TODO:`/ stubs that pretend to work; no dead code introduced.

| Score | Anchor |
|---|---|
| 0 | Lint fails; placeholders left in (`// TODO`, `throw new Error('not implemented')`); copy-paste duplication. |
| 1 | Lint passes; some placeholders or commented-out code remains. |
| 2 | Lint passes; no placeholders; conventions match. |
| 3 | Lint passes; idiomatic for the project; reads like the existing codebase wrote it. |

Evidence required: lint output, scan for `TODO`/`FIXME`/`not implemented` strings, comparison to existing module style.

### 4. Test coverage (hard-fail < 2) — proportional to scope

> Automated tests pass and cover what the scope demands — **not more**. The bar is hard-fail at 2 because shipping without proportional coverage is shipping with a hole; but **over-testing is also a fail signal** (it indicates the agent didn't stop when the spec was satisfied, which blocks downstream work).

Use the proportionality table from `skills/forge-implement/SKILL.md` → "Test proportionality" as the calibration baseline:

| Scope | Expected test count | Critical coverage |
|---|---|---|
| Mode 1 simple | 1–2 | happy + 1 critical edge |
| Mode 2/3 single task | 2–4 | happy + most-likely error + edge |
| Mode 2/3 multi-file task | 3–6 | + integration |
| Mode 5 bugfix | 1 regression + retest | reproduces the bug |

| Score | Anchor (calibrated to proportionality) |
|---|---|
| 0 | Tests fail OR no tests for new code. **FAIL.** |
| 1 | Tests pass but coverage is below the proportional band (e.g., Mode 2 task with only a happy-path test). |
| 2 | Tests pass and cover the proportional band — happy + critical edge / error paths per the table. |
| 3 | Tests pass at the proportional band AND regression tests exist for prior bugs in the same surface. **Going beyond the band without justification is NOT a 3** — it's a 2 with a `WARN: over-tested` note. |

Evidence required:
- Test runner output (pass/fail counts).
- Per-task `Verification gate:` execution result.
- Test-count check against the proportionality band — if the count exceeds the upper bound by more than 50%, flag `WARN: over-tested — agent did not stop at proportional cap` and recommend trimming. This is not a hard-fail but is logged in `evidence`.

### 5. NFR compliance (hard-fail < 1)

> Non-functional requirements per project-stack: performance, security, a11y (frontend profile), data retention (backend / DB profile).

| Score | Anchor |
|---|---|
| 0 | NFR clearly violated (security gap, perf regression, a11y blocker). |
| 1 | NFR mostly met; minor degradation noted. |
| 2 | NFR met. |
| 3 | NFR met with measurements / benchmarks demonstrating headroom. |

Evidence required: secret scan, perf delta if available, a11y audit (frontend), Codacy NFR-class issues.

### 6. Verification gates (hard-fail < 1)

> All `Verification gate:` items in tasks.md execute and pass per their C4 type.

| Score | Anchor |
|---|---|
| 0 | At least one gate fails or cannot be parsed. |
| 1 | All gates pass; some are `manual:` and not yet executed. |
| 2 | All non-manual gates pass; manual gates have specific checklists. |
| 3 | All gates pass including manual; manual checklists were validated by the validator's own probe (where possible). |

Evidence required: per-task gate-execution log with exit codes / playwright traces / agent-browser snapshots.

### 7. Cascade discipline (hard-fail < 1)

> Wave-level discipline: did the implementation/test cycle stay within the cascade depth cap (=1) and avoid banned mid-wave patterns? Penalises the worst-trace anti-pattern (50min / 52.6M tokens / cascade depth 5+ via `pnpm install` / symlink debug / full-monorepo test / prettier loops).

Added in W3 of `feat/forge-token-cascade-refactor`. Full policy: `agent_docs/cascade-policy.md`. Hook enforcement: `scripts/sdd-cascade-cap.sh`. Companion agent body section: `## Validation cascade policy` in `frontend`, `backend`, `database`, `tester-front`, `tester-back`, `validator`.

| Score | Anchor |
|---|---|
| 0 | Wave triggered a banned mid-wave pattern (`pnpm install` / symlink debug / full-monorepo test / repeat prettier `--check` after `--write`) OR cascade depth exceeded 1 in any sub-agent's slice. **FAIL.** |
| 1 | Cascade depth ≤ 1 and no banned patterns. One failed validation step + ONE remediation attempt is the budget. |
| 2 | Cascade depth = 0 (no failed validation steps required remediation). Wave proceeded clean on first attempt. |
| 3 | Cascade depth = 0 AND no full-suite test/typecheck runs at all — every validation step was correctly scoped to the change folder's files. |

Evidence required:
- `.claude/state/cascade-depth.json` — final `depth` value + `banned_triggered` flag (read at validator run-time; absent file = no cascade activity = score ≥ 2).
- `.claude/state/agent-trace.log` grep for `pnpm install`, `pnpm test` (without `--filter`), `ln -s …node_modules…`, repeat prettier patterns within the wave window.
- If a banned pattern fired: cite the specific Bash command + timestamp from the trace log.

## Output JSON shape (`.engram/state/verify-<change>.json`)

```json
{
  "schema_version": "2.0.0",
  "change": "<change-name>",
  "validator_run_id": "<uuid>",
  "ran_at": "<ISO-8601 UTC>",
  "mode": "1|2|3|5|6|6b",
  "scorecard": {
    "functional_completeness": { "score": 3, "hard_fail_threshold": 1, "evidence": "..." },
    "spec_adherence":          { "score": 2, "hard_fail_threshold": 1, "evidence": "..." },
    "code_quality":            { "score": 3, "hard_fail_threshold": 1, "evidence": "..." },
    "test_coverage":           { "score": 3, "hard_fail_threshold": 2, "evidence": "..." },
    "nfr_compliance":          { "score": 2, "hard_fail_threshold": 1, "evidence": "..." },
    "verification_gates":      { "score": 3, "hard_fail_threshold": 1, "evidence": "..." },
    "cascade_discipline":      { "score": 2, "hard_fail_threshold": 1, "evidence": "..." }
  },
  "total": 18,
  "verdict": "PASS|WARN|FAIL",
  "manual_test_checklist": [
    "1) Open /tickets and create one — verify it appears in list",
    "2) ...",
    "3) ..."
  ],
  "blockers": []
}
```

## Calibration

See `agent_docs/validator-calibration.md` — 3–5 example scorecards per criterion drawn from past changes. Without calibration the same change can score 14/18 one day and 17/18 another. The validator MUST consult the calibration doc before scoring.

## Mode-specific behavior

- **Mode 1 (simple)**: scorecard runs identically; manual-test gate is skipped (auto-tests + scorecard sufficient). `manual_test_checklist` is logged but not presented as a 📋 gate.
- **Mode 2 / 3 / 5**: scorecard + ✅ manual-test gate.
- **Mode 4 (research)**: validator does not run (no implementation).
- **Mode 6 / 6b (bootstrap)**: validator runs only if there is implementation in the same change folder; otherwise skipped.
- **Mode 7 (bugfix-pr)**: validator does not run (PR review surface output, not a change).

## Acceptance

- After Mode 2 cycle, `.engram/state/verify-<change>.json` contains the full **7-criterion** scorecard with per-criterion `evidence`.
- A 19/21 with `code_quality.score = 0` triggers FAIL even though total ≥ 14.
- A wave that triggered `pnpm install` mid-flight scores `cascade_discipline.score = 0` → FAIL regardless of other criteria.
- Two cycles on the same change with the same outputs produce the same score (calibration gives stability).
- Mode 1 simple skips the manual-test gate but still writes the JSON.
