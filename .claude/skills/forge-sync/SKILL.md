---
name: forge:sync
version: 1.0.0
description: >
  State synchronization wrapper for the agent-sync agent. Maintains the
  hybrid task tracking model (C2): tasks.md remains the OpenSpec contract
  primary; .engram/state/tasks-<change>.json is the machine-readable
  sidecar mirror. Also upserts state/wave/<change>/<N> and writes
  handoff/<change>/<from>-to-<to> per wave.
triggers: ["agent-sync", "wave-state", "tasks-sync", "task-sidecar"]
layer: 2
wraps: agent-sync agent
phase: post-wave
applies-to: agent-sync
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:sync

## One-shot example

```
ORCHESTRATOR (end of Wave 1): Agent(agent-sync, change=add-auth-flow, wave=1)

agent-sync (via forge:sync)
  ├─ read openspec/changes/add-auth-flow/tasks.md
  ├─ compute sha256 of tasks.md content → 8f3a...
  ├─ build JSON per schemas/tasks-json.md:
  │    {
  │      "schema_version": "1.0.0",
  │      "change": "add-auth-flow",
  │      "source_md_sha": "8f3a...",
  │      "mode": "2",
  │      "tasks": [
  │        {"id":"1.1", "owner":"backend", "wave":1, "status":"done", ...},
  │        {"id":"1.2", "owner":"backend", "wave":1, "status":"done", ...},
  │        {"id":"2.1", "owner":"frontend", "wave":2, "status":"pending", ...}
  │      ]
  │    }
  ├─ write .engram/state/tasks-add-auth-flow.json
  ├─ mem_save state/wave/add-auth-flow/1 {tasks_done, blockers, next_wave_ready: true}
  └─ mem_save handoff/add-auth-flow/backend-to-frontend (if contract published)
```

## When to use

Invoked by the orchestrator at the end of every wave (Modes 2, 3, 6) and at the end of Mode 1 (simple). Also invoked on session resume to reconcile state.

## Step 1 — Sync tasks.md → JSON sidecar

1. Read `openspec/changes/<change>/tasks.md`.
2. Parse checkboxes + forge sub-bullets (`Owner profile`, `Wave`, `Spec`, `Verification gate`, etc.).
3. Build the JSON object per `schemas/tasks-json.md`.
4. Compute `sha256` of `tasks.md` content; store as `source_md_sha`.
5. Write `.engram/state/tasks-<change>.json`.

## Step 2 — Upsert wave state

```
mem_save topic_key=state/wave/<change>/<N>  value={tasks_done: [...], blockers: [...], next_wave_ready: bool, json_sidecar_path: ".engram/state/tasks-<change>.json"}
```

This is an upsert — same `topic_key` increments `revision_count`.

## Step 3 — Write handoffs (per inter-agent handoff)

```
mem_save topic_key=handoff/<change>/<from>-to-<to>  value={from, to, payload, timestamp}
```

## Step 4 — Validate JSON ↔ MD agreement

After write, re-parse the JSON and verify every task's status flag matches the MD checkbox. On mismatch, rebuild and report.

## Acceptance

- After every wave, JSON and MD agree.
- Deleting the JSON regenerates from MD on the next dispatch.
- `opsx:apply` / `opsx:verify` contract is unbroken (MD remains canonical).

<!-- forge:skill:forge-sync:3.0.0 -->
