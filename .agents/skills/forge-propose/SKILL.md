---
name: forge:propose
version: 3.0.0
description: >
  Creates the proposal.md, design.md, and tasks.md for an approved research
  topic, validating topic_keys against schemas/memory-topics.md and emitting
  the 📋 plan-approval gate. Use this skill whenever the user says "plan this",
  "create the spec", "propose", "draft the design", "armar el plan", or after
  forge:research completes and the user is ready to commit to building.
  Always wraps opsx:new + opsx:ff and validates that every task has a domain
  tag and acceptance criteria. Do NOT use without prior exploration or
  research, do NOT use to modify already-approved specs (return to research),
  and do NOT use during implementation (use forge:implement).
triggers: ["propose", "proponer", "spec", "new feature", "nueva feature", "plan this", "armar el plan"]
layer: 2
wraps: opsx:propose, opsx:new, opsx:ff, opsx:continue
mcp_dependencies: [engram, context7]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:propose

Human-facing proposal workflow. The recommended interface for people is `forge:propose`.

- **Recommended human entrypoint:** `forge:propose`
- **Default profile engine:** `opsx:propose` (one-step — all four artifacts at once)
- **Expanded profile engine:** `opsx:new` → `opsx:ff` → `opsx:continue` (step-through)
- **Direct `opsx:*` usage:** allowed as an expert exception, not the standard team-facing path

Create a spec scaffold with enriched validation and a clear handoff into implementation.

## One-shot example

```
USER (after research): /sdd 2 "Plan the JWT sliding-session expiry change based on research/auth-pkce-vs-cookie"

forge:propose (planner agent)
  ├─ read openspec/config.yaml → workflow: opsx:propose (default profile)
  ├─ mem_search topic_prefix:research/auth (hit) + project/memory
  ├─ context7:get-library-docs jsonwebtoken@9.0.2 (validate API used in design)
  ├─ derive change name "harden-auth-session-expiry" → 📋 (user ✅)
  ├─ opsx:propose harden-auth-session-expiry
  │     → openspec/changes/harden-auth-session-expiry/{proposal.md, design.md, tasks.md, specs/auth.md}
  ├─ enrich tasks.md with forge sub-bullets per schemas/task-format.md
  ├─ automated plan validation:
  │     - 6 tasks (≤15) ✓
  │     - 1 spec file (≤5) ✓
  │     - all Verification gate fields use C4 prefixes ✓
  │     - bash scripts/validate-topic-key.sh "spec/harden-auth-session-expiry" ✓
  ├─ mem_save topic_key=spec/harden-auth-session-expiry (rationale + alternatives)
  └─ emit 📋 PLAN APPROVAL GATE → on user ✅: mem_save gate/plan-approved/<change>
```

## Flow

### Pre-check (mandatory)

Before generating ANY artifact:
1. Verify `openspec/config.yaml` exists. If not, run `openspec init` first.
2. Read `openspec/config.yaml` to determine the active profile.
3. You MUST use the opsx engine commands below — do NOT write proposal.md, design.md, tasks.md, or spec files directly. The opsx commands generate the correct file structure and frontmatter.
4. After opsx generates files, enrich with forge metadata only (indented sub-bullets on tasks).
5. Validate all generated spec frontmatter against `schemas/spec-frontmatter.md`.

### Enforcement rule

If `opsx:propose` (or `opsx:new` + `opsx:ff` + `opsx:continue`) is not available in the current environment:
- Check if openspec CLI is installed (`which opsx` or `npx opsx --version`)
- If not installed, tell the user: "OpenSpec CLI is not installed. Run `openspec init` in this repo first."
- DO NOT fabricate the file structure manually as a fallback
- Exception: if the user explicitly says "skip openspec CLI, write manually", then use the format from `schemas/spec-frontmatter.md` exactly — no improvisation

### Steps

1. **Confirm proposal path and OpenSpec profile** — use `forge:propose` as the standard entrypoint.
   Check `openspec/config.yaml` for the active profile, then invoke the correct underlying engine:

   - **Default profile** (`workflows` key absent or does not include `new`):
     ```
     opsx:propose
     ```
     Produces all four artifacts at once: `proposal.md`, `changes/<name>/specs/`, `design.md`, `tasks.md`.
     Delta specs land at `openspec/changes/<change-name>/specs/` — **not** in `openspec/specs/` directly.

   - **Expanded profile** (`workflows` includes `new`, `ff`, `continue`):
     ```
     opsx:new <change-name>   ← folder scaffold only, no artifacts
     opsx:ff                  ← produces proposal.md + changes/<name>/specs/ + design.md only
     opsx:continue            ← one additional required step that produces tasks.md
     ```
     `opsx:ff` does **not** produce `tasks.md`. The `opsx:continue` call after `opsx:ff` is mandatory.

   **Change name rules — enforced, not optional:**
   - Format: `verb-scope-outcome` in kebab-case
   - Must be derived from the feature or PRD scope, never assigned a number
   - Good: `introduce-payment-gateway`, `bootstrap-client-portal-mvp`, `harden-auth-session-expiry`, `add-notification-service`
   - Bad: `1`, `change-1`, `update`, `misc`, any pure number
   - If the caller provides a numeric name, reject it and ask for a descriptive one before proceeding
   - If you cannot derive a name from context, ask the user — do not default to a number
2. **Check prior exploration context** — if this is a brownfield repo and no `project/memory` Engram entry exists, offer a minimal initialization before proceeding:
   - "You skipped `forge:explore`. Do you want to initialize a minimal project memory now so proposal and implementation do not start from zero context?"
   - Minimal memory should capture project name, stack, key modules, and major constraints — saved via `mem_save topic_key=project/memory`.
   - Also `mem_search topic_prefix:research/` for related findings to fold into the proposal.
3. **Validate APIs** — for any external API or library referenced in the proposal:
   - `context7:resolve-library-id` to confirm the library exists
   - `context7:query-docs` to verify API signatures, parameters, and return types
4. **Sub-agent review** (when the runtime supports real sub-agents) — dispatch a spec-reviewer sub-agent to evaluate:
   - Completeness: all requirements covered?
   - Feasibility: can this be built with the proposed approach?
   - Coherence: does the design match project conventions?
   If the runtime does not support true sub-agents, run the same review as a logically isolated pass with a fresh prompt and explicit role separation.
5. **Present to user** — show proposal with reviewer feedback for approval
5.5. **Automated plan validation (V1-V6 — v3 contract)** — before presenting for approval, run the checks declared in `validators.json`. The full policy lives in that file; in summary:
   - **V1 scope-limits**: max_specs_per_change (5), max_tasks_per_change (15), max_specs_per_wave (3), max_tasks_per_wave (5), max_waves_per_change (3), max_files_modified (25), max_deps_depth (3).
   - **V2 files-exist**: every referenced path resolves on disk.
   - **V3 contracts-stable**: no spec touches an entry in `change-brief.contracts.stable_list` (W4).
   - **V4 required-tools-present**: plan declares `required_tools.per_agent` for every dispatched agent (W7 contract).
   - **V5 human-summary-present**: plan contains an `**En simple:**` block in es-MX (W13 contract).
   - **V6 specs-per-wave**: enforced subset of V1, called out separately because it is the most common split signal.
   Additionally, the legacy v2 checks still apply (domain tag, acceptance criteria, TDD pairing, topic_key validation via `scripts/validate-topic-key.sh`, C4 verification gate prefixes).
   - On any failure: render `templates/error-report.md` instead of the approval gate. DO NOT proceed.
   - Report passing check results alongside the plan for developer review.
6. **Close with a handoff decision** — explicitly decide:
   - `forge:implement` vs `forge:orchestrate`
   - whether `handoff.md` should be created before execution
   - whether a fresh session is recommended
7. **Save spec rationale** — `mem_save topic_key=spec/<change-name>` with the chosen approach, alternatives discarded, and pointers to related research topics.
8. **Emit 📋 plan-approval gate** — present plan to user. On user approval: `mem_save topic_key=gate/plan-approved/<change-name>` with timestamp and approver.

## Fast-Forward Mode (expanded profile only)

`opsx:ff` fast-forwards through the first three artifacts:
- `openspec/changes/<change-name>/proposal.md` — what and why
- `openspec/changes/<change-name>/specs/<capability>.md` — delta specifications (not main specs/)
- `openspec/changes/<change-name>/design.md` — architectural decisions

`opsx:ff` does **not** produce `tasks.md`. After `opsx:ff` completes, one additional call is required:
```
opsx:continue   ← produces tasks.md once design is locked
```

`opsx:propose` (default profile) produces all four artifacts including `tasks.md` in a single call.

The `forge:propose` layer adds API validation and execution-transition guidance before signaling ready.

## Output hard limits

These limits are enforced via `validators.json` (V1/V6). If exceeded, render `templates/error-report.md` and refuse to proceed to the approval gate:

- **Max 15 tasks** per tasks.md → split the change into multiple changes and report to orchestrator
- **Max 5 spec files** per change → split the change into multiple changes
- **Max 3 waves** per change → split into sequential changes
- **Max 5 tasks** per wave → split the wave
- **Max 3 specs per wave** (V6) → split the wave
- If exceeded: explicitly tell the orchestrator "This change exceeds hard limits. Split required." and propose the decomposition before writing any files.

### Pre-implementation brief (W4 contract)

Before any opsx:propose call, validate that a current change brief exists from `forge:change-brief` (W4). Read its 7 fields — `what`, `why`, `where`, `existing`, `contracts`, `proof`, `release_revert` — and feed them into the proposal as grounding. The `contracts.stable_list` field is the input to V3 below.

## When to Use

- Starting any new feature or change
- After `forge:explore` or `forge:research` has clarified the approach
- When converting informal requirements into structured specs
- When a human wants the canonical wrapper flow rather than raw `opsx:*` commands

## Handoff Guidance

After proposal approval, decide whether the change needs a compact implementation handoff artifact.

Use `templates/openspec/handoff.md` when the change is:
- high-risk
- brownfield with legacy integration points
- multi-wave or dependency-heavy
- cross-package or cross-repo
- likely to be implemented by parallel sub-agents

The handoff should stay compact and refer back to canonical files (`proposal.md`, `design.md`, `tasks.md`) instead of duplicating all context.

## Completion Convention

Every `forge:propose` run should end with:
1. **What is now ready** — approved or review-ready planning artifacts
2. **What decision the user must make next** — implement, orchestrate, or revise
3. **Suggested continuation prompt** — especially when a fresh session is preferred

### Suggested continuation prompts

**Straight implementation path**
> Start a fresh session and run `forge:implement` for `<change-name>`. Use `tasks.md` as the execution checklist. If `handoff.md` exists, treat it as the compact execution bridge.

**Parallel / DAG path**
> Start a fresh session and run `forge:orchestrate` for `<change-name>`. Build the task DAG from `tasks.md`, use `handoff.md` as the execution bridge if present, and checkpoint progress after each wave.

**If handoff should be created first**
> Before implementation, create `openspec/changes/<change-name>/handoff.md` from the template and keep it compact: scope, boundaries, closed decisions, canonical files, and verification expectations.

## Next Step

After proposal is approved:
- proceed to `forge:implement` for straightforward task-by-task execution
- proceed to `forge:orchestrate` for multi-task or parallel work
- create `handoff.md` first when the approved change needs a tighter bridge between planning and implementation
- prefer a fresh session when the approved context is large, cross-cutting, or wave-based

<!-- forge:skill:forge-propose:3.0.0 -->
