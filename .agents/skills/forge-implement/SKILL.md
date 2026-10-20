---
name: forge:implement
version: 2.1.0
description: >
  Executes an approved tasks.md with TDD, sub-agent isolation per domain,
  wave-based parallel dispatch, and Engram handoff persistence. Use this
  skill whenever the user says "implement", "build", "code this", "implementar",
  "construir", or after the planner has emitted the 📋 plan-approval gate and
  the user has approved. Requires project-stack section in AGENTS.md
  (bootstrap gate). Do NOT use without an approved plan, do NOT use to write
  code outside the scope of an active change folder, and do NOT use for
  research or planning (use forge:research or forge:propose).
triggers: ["implement", "implementar", "build", "construir", "apply", "code this"]
layer: 2
wraps: opsx:apply
mcp_dependencies: [engram, context7]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:implement

Build step by step following the spec's `tasks.md`. Wraps OpenSpec's `opsx:apply` with a strategy-first execution model:

1. **Prefer sub-agents when partitioning provides useful isolation**
2. **Then select the best available tooling for the runtime and task type**
3. **Fallback to inline or logically isolated execution when true sub-agents or MCPs are unavailable**

## One-shot example (per-domain dispatch in Wave 1)

```
ORCHESTRATOR: Agent(backend, change=add-auth-flow, tasks=[1.1, 1.2], wave=1)

forge:implement (backend agent)
  ├─ pre-flight: kebab-case ✓, proposal/design/tasks present ✓, all Verification gates C4-locked ✓
  ├─ read tasks.md tasks 1.1 + 1.2 + relevant spec section
  ├─ context7:get-library-docs jsonwebtoken 9.0.2  (only if used)
  ├─ TDD task 1.1:
  │     - write src/auth/jwt.test.ts (1 happy + 1 critical edge — proportional)
  │     - npx vitest run src/auth/jwt.test.ts  → red
  │     - implement src/auth/jwt.ts            → green
  │     - mark [x] task 1.1 in tasks.md
  ├─ TDD task 1.2: same pattern
  ├─ mem_save topic_key=backend/auth-jwt/decision (sliding-session approach)
  ├─ mem_save topic_key=contract/post-login (cross-domain handoff)
  └─ report: "[backend] tasks 1.1, 1.2 — status: ok — files: src/auth/jwt.ts, jwt.test.ts, middleware.ts"
```

## Flow

1. **Pre-flight: verify change folder is complete**
   Before loading anything, run all of the following checks. If any fail, surface the issue to the user and stop — do not proceed to implementation against an incomplete or unnamed change.

   - [ ] Change folder name is kebab-case (`verb-scope-outcome`) — if numeric (e.g. `1`, `2`), stop and warn: "Change folder names must be descriptive (e.g. `bootstrap-client-portal-mvp`), not numeric. Rename the folder and update commit references before proceeding."
   - [ ] `openspec/changes/<change-name>/proposal.md` exists and is non-empty
   - [ ] `openspec/changes/<change-name>/design.md` exists and is non-empty
   - [ ] `openspec/changes/<change-name>/tasks.md` exists and is non-empty
   - [ ] Every task in `tasks.md` carries: `Change`, `Wave`, `Spec`, `Stories`, `Owner profile`, `Dependencies`, `Definition of done`, `Verification gate`

   If `design.md` is missing, offer to create it from the information in `proposal.md` before proceeding rather than skipping the check.

2. **Load approved planning context** — read `openspec/changes/<change-name>/tasks.md` and, if present, `openspec/changes/<change-name>/handoff.md`
3. **Check execution readiness**
   - `mem_search topic_key:project/memory` — if missing in a brownfield repo, offer a minimal initialization before implementation continues.
   - `mem_search topic_key:gate/plan-approved/<change-name>` — confirm the 📋 gate audit is present.
   - If no true sub-agents are available in the runtime, switch explicitly to logical isolation mode and announce that behavior.
4. **Analyze dependencies** — identify which tasks are independent vs sequential
5. **For each task**:
   - **Choose execution strategy first** — if the task can be isolated usefully, dispatch a sub-agent; otherwise keep it inline
   - **Context budget** — gather only the specs, design sections, and source files relevant to this task
   - **Fetch docs** — `context7:get-library-docs` for any library the task touches when available; otherwise rely on canonical repo docs and explicitly note the fallback
   - **Execute with TDD** — tests first, then implementation
   - **Mark complete** — check off task in `tasks.md`
   - **Persist memory** — domain agent saves `mem_save topic_key=<role>/<feature>/<decision|pattern|bugfix>` for noteworthy choices
6. **Sequential tasks** — wait for blocking tasks to complete before dispatching dependent ones
7. **Wave handoff** — at the end of each wave, `agent-sync` (called inline) upserts `state/wave/<change-name>/<N>` and writes any inter-agent `handoff/<change>/<from>-to-<to>` envelopes. The next wave reads those upserts on dispatch.
8. **Pre-verify checkpoint** — summarize completed tasks, remaining risk, modified areas, and recommended verification focus
9. **Wrap up** — run `opsx:apply` to record completion in OpenSpec

## Execution Strategy

Use this priority order:

1. **True sub-agent isolation** — preferred when the runtime supports separate agents/threads and the task benefits from partitioning
2. **Logical isolation** — use a fresh role/task prompt and a narrow context envelope when the runtime lacks true sub-agents
3. **Inline execution** — use only when the task is too small or too coupled to benefit from separation

The standard principle is: **sub-agents are an execution strategy, not a vendor-specific feature.**

## Tooling Profiles

Once the execution strategy is chosen, activate the best tooling the runtime can actually support.

### Frontend Implementation
- **Preferred tools when available**
  - `figma` MCP for design context (only when `frontend_paths` is non-empty)
  - Playwright **CLI** (`npx playwright test`) when project-stack `Test runner` is Playwright
  - `context7` for framework/library docs
- **Fallback when unavailable**
  - implement components directly using project conventions
  - use the project's existing UI/unit/integration tests (per project-stack `Test runner`)
  - if Playwright is not detected, do not assume it — use the detected runner

### General Implementation
- **Preferred tools when available**
  - `context7` for library docs
  - native editor/file operations
- **Fallback when unavailable**
  - keep the same TDD and context-budgeting discipline
  - source patterns from existing code rather than guessing

Community skills (`magic`, `morphllm`) are optional Layer 4 extensions installed via `local-packs/`. They are not required for `forge:implement` to run.

### Profile Detection
Detect automatically based on task content:
- Task mentions UI, component, page, layout, CSS, DOM → **Frontend profile**
- Everything else → **General profile**

## Sub-Agent Protocol

Each isolated task execution receives:
- The specific task description from `tasks.md`
- `handoff.md` when present, as the compact bridge from approved planning to implementation
- Relevant spec sections (not the entire spec)
- Only the source files it needs to modify
- Best-available docs/tooling access for that runtime
- Instructions to follow TDD

If `handoff.md` exists, treat it as the execution summary, while `proposal.md`, `design.md`, and `tasks.md` remain the source of truth.

Each isolated task execution does **not** receive:
- Other tasks' context
- Full project history
- Unrelated specs or design docs

## Execution Checkpoints

Use visible checkpoints to protect continuity and reduce context drift:

1. **Planning-approved checkpoint** — approved spec + implementation path confirmed
2. **Task checkpoint** — after each critical or risky task, record what changed and what remains
3. **Pre-verify checkpoint** — before handing off to `forge:verify`, summarize completed scope, known risks, and required checks
4. **Post-verify checkpoint** — after verification, record pass/fail state and next required action

For longer changes, recommend a local commit at meaningful milestones, but do not make commits mandatory for every task.

## Test proportionality (LOCKED — agents must not over-test)

Tests are TDD-required, but **size them to scope**. Agents tend to drift into exhaustive test suites for trivial features and never finish. Use the table below as the cap; if you exceed it, justify in the scorecard `evidence` or split the task.

| Task scope | Tests cap | Required coverage |
|---|---|---|
| Mode 1 simple — single endpoint OR component | **1–2 tests** | 1 happy path + 1 critical edge case (auth fail / null input / 4xx). Skip non-critical edge cases. |
| Mode 2/3 — single task, single domain | **2–4 tests** | Happy + 1–2 most-likely error paths + 1 edge case. |
| Mode 2/3 — single task spanning files (e.g., contract + impl + handler) | **3–6 tests** | Happy + error path + boundary + cross-component integration. |
| Mode 5 bugfix | **1 regression test** + happy path retest | Reproduce the bug first (red), then the fix (green). One regression is enough — the bug is the spec. |
| Cross-domain wave (multiple tasks, multi-file) | proportional sum (cap each task per row above) | Don't add an integration test unless the task explicitly says so. |

**Defaults the agent should NOT add unless explicitly required**:
- "Defensive" tests for impossible inputs (TypeScript already rejected them).
- Test suites covering library behavior (the library is already tested upstream).
- Snapshot tests that just lock current output without semantic value.
- Performance tests for non-perf-sensitive code.
- E2E flows for changes that don't cross the network.

**Exit condition**: when the verification gate (`Verification gate:` field) passes and the cap above is met, **stop writing tests**. Do not search for additional edge cases. Do not "round out" the suite. Move to the next task or report completion.

If the spec genuinely demands more tests (e.g., a security-critical auth flow), the planner must declare the test budget in `design.md` under a `## Testing strategy` heading; absent that, the hard ceilings below override any earlier proportionality or scorecard-based guidance.

### Hard ceilings (STOP markers)

**Precedence**: hard ceilings override the per-task proportionality table above and any scorecard- or justification-based guidance. Even if the proportionality table allows 6 tests for a multi-file task, the per-file ceiling (8) and per-change ceiling (30) still apply, and a scorecard `evidence` justification is **not** sufficient to cross them. Only an explicit `## Testing strategy` budget in `design.md` declared by the planner can lift these limits — a tester or implementer agent cannot self-authorize the exceedance.

These are non-negotiable absent that explicit `## Testing strategy` budget:

| Boundary | Hard ceiling | On breach |
|---|---|---|
| Per task | **6 tests** | STOP, emit `[TEST-CAP] task <id> exceeded 6 tests`, trim before continuing. |
| Per file | **8 tests** | STOP, emit `[TEST-CAP] file <path> exceeded 8 tests`, drop redundant/snapshot cases. |
| Per change folder | **30 tests cumulative** | STOP, emit `[TEST-CAP] change <name> exceeded 30 tests`, request scope split — a 100+ test change is a planner-side scoping failure, not a tester signal. |

Crossing any ceiling caps the validator C5 `test_coverage` score at **1** (hard-fail at <2 → verdict FAIL). Industry rationale (Beck "unique contribution"; LLM agent token-tax studies, DEVOPSdigest 2026 + arXiv 2602.07900): bulk-generated tests inflate token cost 5–10× without raising task success.

## Scope guard (B3) — never run codebase-wide lint/format

When fixing a lint or format error:

1. Lint/format ONLY files modified in the current task. Resolve via:
   ```bash
   git diff --name-only HEAD | xargs <linter>
   ```
2. If the linter does not support per-file scoping, **skip and report** instead — do not run on the whole repo.
3. The pre-tool hook `scripts/sdd-scope-check.sh` blocks unscoped `--fix` invocations with delta > 16 files. If you receive a `[SCOPE-GUARD] BLOCK`, narrow the command and retry.
4. Never use `npm run lint -- --fix`, `eslint --fix .`, `prettier --write .`, or any pattern that targets the whole repo unless every file in the diff is in your owner-domain paths.

## Escalation

If a task fails twice:
1. Collect error context from both attempts
2. Surface to the user with a summary of what was tried
3. Do not retry a third time automatically. Cycle counter (B4) hard-stops at 3 across the change.

## Agent isolation reminder

You are running as a sub-agent dispatched by the orchestrator. You do NOT have access to the Agent tool.
Do not attempt to delegate work to other agents. Execute all tasks assigned to you directly.
If you encounter a task outside your domain, mark it as BLOCKED with a clear note and report back.

## When to Use

- After `forge:propose` has been approved
- When `tasks.md` exists and is ready for implementation
- When execution is mostly sequential or the DAG does not justify full orchestration
- Prefer `forge:orchestrate` for complex multi-task or multi-wave changes

## Next Step

After all tasks are complete, proceed to `forge:verify`.

<!-- forge:skill:forge-implement:3.0.0 -->
