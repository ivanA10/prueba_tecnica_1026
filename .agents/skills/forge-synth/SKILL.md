---
name: forge:synth
version: 1.0.0
description: >
  Reconciles raw outputs from multiple explore/researcher passes into
  evidence-backed findings, then promotes high-confidence discoveries
  to Engram (Tier 2). Dispatched by the orchestrator only when the
  wave has ≥2 explores OR raw tokens > 3000 — otherwise the raw
  output goes straight to the planner. NEVER plans, proposes, or
  implements. Returns strict JSON matching output-schema.json plus a
  human_summary block.
triggers: ["synth", "synthesize research", "reconcile explore"]
layer: 2
wraps: synthesizer agent
phase: pre-planning
applies-to: synthesizer, orchestrator
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:synth — synthesizer dispatch helper

The synthesizer agent (W6) consumes this skill on every invocation. The orchestrator decides WHETHER to dispatch synthesizer; the synthesizer itself uses this skill to drive its workflow.

## Dispatch decision (orchestrator side)

```
n_explores       = count of explore outputs in this wave
sum_raw_tokens   = total tokens across explore + researcher outputs

SYNTH_MIN_EXPLORES         = .forge/config.json → wave_policy.synth_min_explores       (default 2)
SYNTH_RAW_TOKEN_THRESHOLD  = .forge/config.json → wave_policy.synth_raw_token_threshold (default 3000)

if n_explores >= SYNTH_MIN_EXPLORES  OR  sum_raw_tokens > SYNTH_RAW_TOKEN_THRESHOLD:
    dispatch synthesizer
else:
    pass raw outputs directly to planner
```

## Synthesizer workflow (agent side)

1. **Read inputs.** Receive concatenated, source-tagged raw outputs.
2. **Reconcile.** Dedup identical/near-identical claims; flag contradictions; list unknowns.
3. **Evidence filter.** Drop findings whose `evidence` does not match `^(file:|engram:|url:).+`.
4. **Score confidence.** high / medium / low — heuristic:
   - `high` = evidence is file: with line OR url: from canonical source; ≥2 corroborating sources agree.
   - `medium` = file:/url: evidence with single source OR engram:id with timestamp <30d.
   - `low` = engram:id stale (>30d) or single weak url.
5. **Emit output** matching `output-schema.json` strictly.
6. **Promote to Engram.** For each `confidence: high` finding where evidence is file: or url: (NOT engram:), call:
   ```
   mem_save({
     type: "discovery",
     topic_key: "discovery/<slug>",
     title: "<claim head>",
     content: "<claim>",
     tags: ["tier-2", "synth"],
     evidence: "<finding.evidence>",
   })
   ```
   Set the corresponding finding's `promoted_to_engram: true`.
7. **Emit human_summary** (W13 contract) — es-MX, prefix `**En simple:**`.

## What NOT to do

- Do not propose or plan changes — that's the planner's job (W5 gate).
- Do not edit or write files outside Engram promotion.
- Do not fetch web (no live research — that's the researcher's job).
- Do not spawn sub-agents.

## See also

- `output-schema.json` — strict JSON-Schema for the structured output
- `agents/claude/synthesizer.md` — agent definition
- `docs/ENGRAM-POLICY.md` — Tier 2 ingestion rules
- `skills/forge-explore/SKILL.md` — upstream producer
- `skills/forge-research/SKILL.md` — upstream producer

<!-- forge:skill:forge-synth:3.0.0 -->
