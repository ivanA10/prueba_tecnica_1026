---
name: forge:change-brief
version: 1.0.0
description: >
  Mandatory pre-implementation questionnaire — 7 fields validated against
  schema.json. Blocks opsx:propose / forge:propose until the brief is
  complete and valid. Without this, the planner invents assumptions
  instead of grounding the plan in real constraints + existing code.
triggers: ["change-brief", "pre-plan", "before propose", "what why where"]
layer: 2
wraps: ""
phase: pre-planning
applies-to: planner, orchestrator
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:change-brief — 7-criteria pre-implementation gate

Before any change is proposed (`opsx:propose` / `forge:propose`), the agent must complete this brief and validate it against `schema.json`. The brief is the single source of grounding for downstream planning, implementation, and post-validation (W5).

If the brief is incomplete, **stop and request the missing pieces** — do NOT continue into proposal. A planner with no brief invents assumptions.

## The 7 fields

| # | Field | What it answers | Hard requirements |
|---|---|---|---|
| 1 | `what` | What concrete change? | string, 10–280 chars, no generic verbs only |
| 2 | `why` | Why now + classification | object with `reason` (≥10 chars) and `tag` ∈ {bug, feature, refactor, perf, security, compliance} |
| 3 | `where` | Paths + module touched | object with `paths` (array ≥1) and `module` (string) |
| 4 | `existing` | What already exists | `explored: true` AND `findings` array (each finding needs `claim` + `evidence` with prefix `file:` / `engram:` / `url:`) |
| 5 | `contracts` | What MUST NOT change | object with `stable_list` array (can be empty — explicitly) |
| 6 | `proof` | How it'll be verified | `test_types` (array, ≥1 of {unit, integration, e2e, contract, manual}) + `test_files` array |
| 7 | `release_revert` | Release + rollback plan | `strategy` ∈ {direct, feature-flag, migration, blue-green, canary} + `rollback` (≥10 chars) |

The full schema is in `schema.json`. Two worked examples live in `examples/`.

## Procedure

1. Collect the 7 fields from the user, the conversation context, or a quick `forge:explore` pass.
2. Build the brief as a YAML or JSON block matching `schema.json`.
3. **Validate.** Run the brief through `schema.json`. Any failure → list the failing fields with diagnostic messages and **stop**.
4. Persist the brief to Engram with `mem_save type=brief topic_key=brief/<short-slug>`. This becomes the grounding artifact for `forge:propose` (W5).
5. Emit a `human_summary` block (W13 contract):
   ```
   **En simple:** Vamos a cambiar <what>. La razón es <why.reason>. Tocamos <where.module>. Si algo falla, <release_revert.rollback>.
   ```
6. Hand off to `forge:propose` with the validated brief.

## Failure modes

- `existing.explored: false` → reject; require an `forge:explore` pass first.
- `existing.findings[*].evidence` missing the `file:` / `engram:` / `url:` prefix → reject (no hand-waved findings allowed).
- `contracts.stable_list` not present → reject (the agent must explicitly say "no stable contracts" by sending `stable_list: []`).
- `proof.test_types` empty → reject.

## Output shape

```yaml
what: "<short imperative>"
why:
  reason: "<the real reason>"
  tag: feature
where:
  paths: [src/...]
  module: <module>
existing:
  explored: true
  findings:
    - claim: "<thing observed>"
      evidence: "file:src/path.ts:42"
contracts:
  stable_list: []
proof:
  test_types: [unit, e2e]
  test_files: [src/__tests__/foo.test.ts]
release_revert:
  strategy: feature-flag
  rollback: "Toggle flag 'X.enabled' off."
```

## See also

- `schema.json` — strict JSON-Schema definition
- `examples/feature.yaml`, `examples/bugfix.yaml` — worked examples
- `skills/forge-propose/validators.json` — W5 picks up the brief for V3 contract validation

<!-- forge:skill:forge-change-brief:3.0.0 -->
