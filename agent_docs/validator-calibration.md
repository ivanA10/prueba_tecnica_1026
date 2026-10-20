# Validator Calibration — Few-shot anchors per criterion

> Anthropic Mar 2026 finding: subjective grading is stable when each criterion has 3–5 calibrated examples. Score every change against these examples — don't grade in a vacuum.

## How to use this doc

Before assigning a score, find the closest calibration example for the criterion and adjust ±1 if your evidence differs in scope, severity, or completeness.

If you cannot find a close example, **score conservatively** (one band lower than your gut) and add a note explaining why.

## 1. Functional completeness

| Score | Example | Why |
|---|---|---|
| 0 | "add-payment-checkout" — `tasks.md` shows 8/10 done, but `POST /charge` returns 500 because the Stripe webhook handler is stubbed. | Happy path is broken; AC unmet. |
| 1 | "add-search-bar" — search input wired, debounced, hits API. Empty-state UI is not styled and the "no results" copy says "TODO". | Happy path works; UI states incomplete. |
| 2 | "harden-auth-session-expiry" — sliding session implemented, both happy and stale-token paths tested. Missing: explicit log line on token refresh. | All AC met; minor polish gap. |
| 3 | "introduce-rate-limiting" — token bucket, headers, retry-after, 429 responses, log lines, edge case for clock-skew, all matching design.md. | Design.md parity, edge cases handled. |

## 2. Spec adherence

| Score | Example | Why |
|---|---|---|
| 0 | design.md specifies `/api/v2/users` returning `{id, email, displayName}`, but implementation returns `{id, email, name, avatar}` with no rationale. | Material divergence from contract. |
| 1 | design.md specifies a Redis cache for sessions; impl uses an in-memory Map with no comment explaining the swap. | One undocumented deviation. |
| 2 | Impl matches design.md; one shape difference (`createdAt` is ISO string vs Date) documented in design.md as "platform constraint". | Documented deviations. |
| 3 | 1:1 with design.md; reading either tells you what the other contains. | Faithful contract. |

## 3. Code quality

| Score | Example | Why |
|---|---|---|
| 0 | Lint fails with 12 errors; 3 `// TODO: implement properly` strings; 2 functions named `func1`, `helper`. | Lint + placeholders + naming. |
| 1 | Lint passes; one `// TODO: revisit after launch` is acceptable; one commented-out block from a prior refactor remains. | Clean enough but residue. |
| 2 | Lint passes; no placeholders; naming is consistent with neighboring files; no commented-out code. | Match neighbors. |
| 3 | Idiomatic for this codebase — uses the project's own helpers / patterns / error types — feels native. | Looks like the team wrote it. |

## 4. Test coverage (proportional to scope)

| Score | Example | Why |
|---|---|---|
| 0 | New endpoint has no tests, OR tests fail when run. | Cannot ship — hard-fail at <2. |
| 1 | Mode 2 task with only a happy-path test (proportional band is 2–4). | Below proportional band. **FAIL even if total ≥12.** |
| 2 | Mode 1 simple `/health` endpoint: happy + null-input edge — 2 tests, both pass. | At the proportional band for Mode 1. |
| 2 | Mode 2 task: happy + 4xx error + permission edge case (3 tests, all pass). | At the proportional band. |
| 3 | Mode 2 multi-file task: happy + error + boundary + integration + 1 regression test for a prior bug on this surface (5 tests). | At the proportional band + regression coverage. |
| **Over-test penalty** | Mode 1 `/health` endpoint with **9 tests** including 3 snapshot tests of the JSON shape, 2 "defensive" type-mismatch tests, perf benchmarks. | Score capped at **2** with `WARN: over-tested — agent did not stop at proportional cap`. The agent failed to stop when the spec was satisfied. |
| **Hard-ceiling breach** | Mode 2 change with 5 tasks generating **34 tests** total — happy + 2 errors + 1 edge case per task (proportional band would be 10–20). Includes 4 snapshot tests with no semantic assertion and 3 "defensive" type-mismatch tests. | Score capped at **1** → `test_coverage` hard-fail (<2) → **verdict FAIL** regardless of total. `evidence`: `[TEST-CAP] change exceeded 30-test ceiling — drop snapshots and defensive cases or declare ## Testing strategy in design.md`. |
| **Egregious failure mode (motivator)** | Real observed regression: Mode 2 change ballooning to **124 tests across 18 files** — bulk-generated snapshots, defensive null/undefined checks already enforced by TypeScript, cross-file integration tests not in the spec. | Cited as the failure case the hard ceilings exist to prevent. Score capped at **1** + `[TEST-CAP] change exceeded 30-test ceiling (124) AND per-file 8-test ceiling on multiple files`. Industry context (Beck "unique contribution"; LLM token-tax studies) — bulk tests inflate token cost 5–10× without raising task success. |

## 5. NFR compliance

| Score | Example | Why |
|---|---|---|
| 0 | Endpoint logs the user's plaintext password into the request log. | Security violation, hard-fail. |
| 1 | a11y missing on the new modal (no focus trap, no role attribute), but no other NFR issues. | Material a11y gap. |
| 2 | Auth tightened, perf neutral, a11y baseline met (Lighthouse > 90 on the changed page). | Meets NFR. |
| 3 | Auth tightened with rotated keys, perf improved by 12% on the changed endpoint with benchmark, a11y 100. | Headroom demonstrated. |

## 6. Verification gates

| Score | Example | Why |
|---|---|---|
| 0 | One `cmd:` gate fails (npm test exits non-zero) or one gate's value is free text. | Can't verify. |
| 1 | All non-manual gates pass; manual checklist is "test the feature" without specifics. | Manual gate is too vague. |
| 2 | All non-manual gates pass; manual checklists list specific steps with expected outcomes. | Operator can follow. |
| 3 | All gates pass including manual; validator probed `agent-browser:` paths itself and confirmed user flows. | Self-verifying where possible. |

## 7. Cascade discipline (added W3 of forge-token-cascade-refactor)

| Score | Example | Why |
|---|---|---|
| 0 | "add-user-flow" — trace shows the backend subagent ran `pnpm install` mid-wave after a test failed (banned pattern triggered), then escalated to 5+ rounds of `ln -s ./node_modules/...` and `pnpm test` (no filter). `.claude/state/cascade-depth.json.banned_triggered=true`. | Hard-fail. Exact anti-pattern this criterion exists to prevent (52.6M-token reference trace). |
| 0 | "harden-rate-limit" — single backend slice: typecheck failed → re-run with `--watch` flag (depth=1) → still failed → ran full-monorepo `pnpm test` (depth=2, exceeds cap). `cascade-depth.json.depth=2`. | Depth cap exceeded; FAIL even though no banned pattern fired. |
| 1 | "add-search-bar" — frontend wave: vitest run failed on one filter case → agent fixed the predicate → re-ran SAME filter scope → PASS. `depth=1` momentarily, reset by next pass. No banned patterns. | One remediation attempt used cleanly; within budget. |
| 2 | "introduce-rate-limiting" — backend + tester-back waves: all validation steps passed first attempt. `cascade-depth.json` never incremented. Some `pnpm --filter @scope/api test src/__tests__/rate-limit.test.ts` invocations (scoped). | Clean run; depth stayed 0. |
| 3 | "fix-typo-in-button-label" — Mode 5 bugfix: single `pnpm --filter @scope/web test src/__tests__/button-label.test.tsx` invocation, passed. No tsc, no eslint, no full-suite. Trace log shows 1 validation Bash call total. | Best-case: zero unnecessary validation surface area. |
| **Worst-trace reference (calibration anchor — score 0)** | `019e6697-5d07-7225-963f-fe75054fc4fb` "Backend Wave 0 create-user-flow": 446 runs in one turn, 9.6M tokens in one subagent. Pattern: failing test → `pnpm install` (banned) → `readlink` (banned) → `ln -s` (banned) → `pnpm test` (banned full-monorepo) → `prettier --check` after `--write` (banned). | Cited as the failure case the policy exists to prevent. Score 0 regardless of all other criteria. |

## Stability rule

If two consecutive scorecards on the same change with the same outputs differ by > 1 on any criterion, the validator must explain the difference in the scorecard `evidence` field. This forces a re-grounded interpretation rather than vibes-based variance.
