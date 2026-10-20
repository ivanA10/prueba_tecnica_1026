---
name: forge:adr
version: 1.0.0
description: >
  Promotes an architectural decision to a pinned Tier 0 ADR. Writes
  docs/adrs/ADR-NNN-<slug>.md AND a pinned Engram observation so the
  decision survives session decay and is always loaded in context.
  Use when a decision has lasting blast radius (auth, data model,
  vendor choice, infra topology).
triggers: ["adr", "architecture decision", "pin decision", "promote to tier 0"]
layer: 2
wraps: ""
phase: cross-cutting
applies-to: orchestrator, planner, validator
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:adr — Promote a decision to Tier 0

Use this skill when the orchestrator (or planner) is about to record a decision whose blast radius extends past the current wave: framework choice, datastore choice, auth model, public contract shape, infra topology. Tier 0 means "always loaded in context, never decays, versioned in git."

## When NOT to use

- Mid-implementation tactical choices (`useEffect` vs. event listener) — those are Tier 2 patterns at best.
- Decisions that are still being explored — wait until consensus.
- Bugfixes — those go to Tier 2 via `mem_save type=bugfix`.

## Required fields

| Field | Validation | Notes |
|---|---|---|
| `title` | non-empty, ≤80 chars | Imperative phrasing: "Use Postgres + Drizzle for primary store" |
| `context` | ≥50 chars | What forced the decision (constraints, trade-offs) |
| `decision` | ≥30 chars | The concrete choice |
| `consequences` | ≥30 chars | What this locks in / forecloses |
| `alternatives_considered` | optional list | Improves reviewability |
| `status` | enum: `proposed \| accepted \| superseded` | Default `accepted` after human gate |

If any required field is missing or below threshold, **stop and request the missing pieces** before writing.

## Procedure

1. **Resolve next ADR number.** List `docs/adrs/ADR-*.md` and pick the next monotonic integer (zero-padded to 3 digits).
2. **Validate fields.** Apply the table above. If invalid, request the gaps and abort.
3. **Slugify title.** Lowercase, alphanumerics + dashes, ≤40 chars.
4. **Write file** `docs/adrs/ADR-NNN-<slug>.md` with frontmatter:
   ```yaml
   ---
   id: ADR-NNN
   title: <title>
   status: accepted
   date: <YYYY-MM-DD>
   tier: 0
   tags: [adr, tier-0]
   ---
   ## Context
   <context>

   ## Decision
   <decision>

   ## Consequences
   <consequences>

   ## Alternatives considered
   <alternatives or "none">
   ```
5. **Persist to Engram** with:
   ```
   mem_save({
     type: "adr",
     pinned: true,
     topic_key: "adr/NNN",
     title: "<title>",
     content: "<short summary — ≤500 chars referencing the file>",
     tags: ["adr", "tier-0"],
   })
   ```
6. **Confirm** with `human_summary` block (W13 contract):
   ```
   **En simple:** Acabamos de fijar la decisión <title> como ADR-NNN. Esto significa <plain-language consequence>.
   ```

## Reporting

After write, emit a one-paragraph confirmation including:
- ADR number
- file path
- Engram `topic_key`
- one-line human-readable consequence

## Failure modes

- ADR numbering collision → re-scan and retry once
- Engram unreachable → write the file, emit `[MEMORY] WARNING` and continue (does not block the gate)
- File already exists → abort, request the user pick `supersedes` or `update`

<!-- forge:skill:forge-adr:3.0.0 -->
