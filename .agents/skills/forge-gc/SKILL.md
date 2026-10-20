---
name: forge:gc
version: 1.0.0
description: >
  Recurring garbage-collection skill for the SDD harness (D4, OpenAI
  pattern). Audit-first, approval-gated cleanup of dead change folders,
  stale handoffs > 30d, orphan .engram/state JSON sidecars for archived
  changes, unused community skills, and Engram memory hygiene (empty
  zero-observation sessions + surfacing contradicting observations for
  supersession review — never blind-deleted). Filesystem clutter in
  .claude/state/ (legacy `.bak`, retired perf logs) is handled automatically
  by the SessionStart reaper (scripts/sdd-state-reaper.sh), so it is no longer
  a forge:gc target. Triggered (a) at end of every Mode 2 cycle, (b) at end of
  every Mode 1 simple cycle, (c) optionally on a weekly schedule via
  .github/workflows/sdd-gc.yml.
triggers: ["gc", "garbage collection", "cleanup", "/sdd gc"]
layer: 2
wraps: filesystem audit + Engram soft-delete
phase: post-archive, recurring
applies-to: orchestrator
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:gc

## One-shot example

```
USER: /sdd gc

forge:gc (audit phase)
  ├─ scan openspec/changes/* → 3 stale (>30d, no active branch)
  ├─ scan .engram/state/{tasks,verify}-*.json → 2 orphans (changes archived)
  ├─ scan Engram sessions → 4 empty (0 observations)
  ├─ scan Engram for contradicting observations → 2 conflict pairs
  ├─ scan .claude/skills/community/ → 0 unused
  └─ emit audit report with counts (118 KB on disk + 6 Engram items)

USER (📋): ✅ Approved (selective) — 1, 2, 3

forge:gc (execute phase)
  ├─ mv openspec/changes/old-thing → openspec/archived/ (where archived)
  ├─ rm .engram/state/tasks-old-thing.json .engram/state/verify-spike-engram.json
  ├─ mem_delete 4 empty zero-observation sessions
  └─ report: removed 6 items; 2 conflict pairs surfaced for supersession review
```

Auto-runs at end of every Mode 1 / Mode 2 cycle in audit-only mode (no execute) so the next interactive run sees fewer candidates.

## Targets

| Target | What is "stale" | Action on approval |
|---|---|---|
| Change folders | `openspec/changes/<change>/` with no active branch (`feat/<change>` not in `git branch -a`), and no commits in 30 days | Move to `openspec/archived/<change>/` if archived; otherwise delete only with explicit user `--purge` |
| Handoffs | `templates/openspec/handoff.md`-derived files for changes that are archived AND > 30 days old | Delete |
| `.engram/state/` JSON sidecars | `tasks-<change>.json` and `verify-<change>.json` for changes already in `openspec/archived/` | Delete |
| Empty Engram sessions | Sessions with 0 observations (opened then closed with nothing saved) | `mem_delete` — safe, they carry no decision trail |
| Contradicting observations | Observation pairs Engram flags as `conflicts_with` / supersedable (same `topic_key`, divergent content) | **Surface for review only.** Resolve via `mem_judge` supersession so the trail survives — NEVER blind-delete |
| Unused community skills | Community skills in `.claude/skills/community/` that have no `mem_search` hits in 90 days | Move to `.claude/skills/community/.disabled/` (reversible) |
| Soft-deleted Engram topics | `state/wave/*` and `handoff/*` flagged by `agent-sync` post-archive | Confirm soft-delete in Engram (no hard delete) |

> `.claude/state/` filesystem clutter (legacy `*.bak`, retired `perf.log` / `last-perf-report.log` / `last-session-report.log`) is **not** a forge:gc target — the SessionStart reaper (`scripts/sdd-state-reaper.sh`) prunes it automatically at the start of every session and truncates the session trace so it stays bounded.

## Flow

1. **Audit** — read-only scan; produce a report listing every candidate with size, age, last reference.
2. **Present 📋 gate** — show the report; user approves or rejects per category.
3. **Execute** — apply the approved deletions. Report counts.
4. **Idempotent** — second run on the same state produces zero candidates.

## Audit report shape

```
═══════════════════════════════════════
  forge:gc — audit
═══════════════════════════════════════
1. Stale change folders          : 3
   - openspec/changes/old-thing      (last commit 47d ago)
   - openspec/changes/abandoned-poc  (last commit 60d ago)
   - openspec/changes/spike-engram   (no active branch, archived)

2. .engram/state JSON sidecars   : 2
   - .engram/state/tasks-old-thing.json
   - .engram/state/verify-spike-engram.json

3. Empty Engram sessions         : 4
   - inbest-sdd-cycle 2026-06-02 18:27 (0 observations)
   - ...

4. Contradicting observations    : 2   (surface only — resolve via mem_judge)
   - architecture/cascade-cap: "depth>1 blocks" vs "depth>2 blocks"
   - ...

5. Unused community skills       : 0

6. Soft-deleted Engram topics    : 14
   - state/wave/old-thing/* (3)
   - handoff/old-thing/* (4)
   - ...

Total reclaimable: ~118 KB on disk + 4 empty sessions (2 conflicts to review)

📋 Approve cleanup?
- ✅ Approved — execute all categories
- ✏️ Approved (selective): [comma list of category numbers]
- ❌ Reject
```

## Triggers

- **Auto** (default): orchestrator runs `forge:gc` at the end of every Mode 1 (simple) and Mode 2 cycle, after `engram sync`.
- **Manual**: `/sdd gc` invokes the skill standalone.
- **Scheduled** (optional): `.github/workflows/sdd-gc.yml` runs weekly. Sends the audit report to a designated reviewer instead of executing without human approval.

## Safety

- Never hard-delete `.engram/<chunk>.json.gz` archives — these are the source of truth for cross-session continuity.
- Never delete an active change folder (active = `feat/<change>` exists in any local or remote branch).
- Never delete a community skill without moving it to `.disabled/` first (reversible).

## Acceptance

- After 5 Mode 2 cycles, `/sdd gc` finds and (with approval) removes orphan artifacts.
- Idempotent on second run (zero candidates).
- Hard-deletion paths require an explicit `--purge` flag at execute time.

<!-- forge:skill:forge-gc:3.0.0 -->
