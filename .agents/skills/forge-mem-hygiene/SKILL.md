---
name: forge:mem-hygiene
version: 1.0.0
description: >
  Manual Engram cleanup job. Runs semantic dedup, decay pruning, and
  consolidation; emits a before/after report per tier. Use on demand
  when the graph is getting noisy or before a long planning session.
triggers: ["mem-hygiene", "engram cleanup", "dedup memory", "prune memory"]
layer: 2
wraps: ""
phase: cross-cutting
applies-to: orchestrator
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:mem-hygiene — Engram dedup + decay job

Run this manually when:
- The graph is reporting >5K observations and search noise is rising.
- Before a long planning session that depends on clean recall.
- Weekly cadence in active projects (set a reminder; not auto-scheduled by v3).

In a coordination hub, add `--scope all` to each `engram` call so the job touches the shared scope too.

## Procedure

1. **Stats baseline.** `engram stats --json` and save as `before`.
2. **Semantic dedup.** `engram conflicts scan --semantic --apply` — collapses near-duplicates within Tier 2 / Tier 3.
3. **Tier 2 decay.** `engram prune --decay-days <decay_days_tier2> --tier 2` — reads `decay_days_tier2` from `.forge/config.json` (default 30).
4. **Tier 3 decay.** `engram prune --decay-days <decay_days_tier3> --tier 3` (default 60).
5. **Stats after.** `engram stats --json` and save as `after`.
6. **Report.** Emit a tabular summary:
   | Tier | Before | After | Δ |
   |---|---|---|---|
   | 0 (pinned) | … | … | should be 0 |
   | 1 (active) | … | … | … |
   | 2 (durable) | … | … | … |
   | 3 (sessions) | … | … | … |

Include a `human_summary` block (W13 contract):
```
**En simple:** Limpié la memoria del proyecto. Quedaron <N> recuerdos en total, <M> menos que antes. Los ADRs y constantes pinned siguen intactos.
```

## Safety

- This skill does NOT touch Tier 0 (pinned). If `before.tier_0 ≠ after.tier_0`, fail loudly.
- If `engram` CLI is unavailable, fail with the install pointer (`agent_docs/engram-install.md`). Do not silently skip.
- Always emit the before/after numbers — opaque success messages cause drift.

## See also

- `docs/ENGRAM-POLICY.md` — tier policy + decay rationale
- `scripts/engram-cross-project.sh` — shared-scope query helper

<!-- forge:skill:forge-mem-hygiene:3.0.0 -->
