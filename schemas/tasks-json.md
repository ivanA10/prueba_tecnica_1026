# Tasks JSON Sidecar Schema (`.engram/state/tasks-<change>.json`)

> Hybrid tracking (C2 LOCKED). `tasks.md` remains the OpenSpec-compatible primary contract — `opsx:apply` and `opsx:verify` read MD checkboxes. The JSON sidecar mirrors task status for **machine-fast filtering by sub-agents**. Humans never edit the JSON.

## Location

`.engram/state/tasks-<change-name>.json` — checked in alongside the change folder; commits roll forward with each `commit_phase` checkpoint.

## Ownership

- **Read**: any agent (frontend, backend, database, validator, orchestrator).
- **Write**: ONLY `agent-sync` (or `forge:simple` for Mode 1 single-agent flow). Sub-agents that mutate task state in MD (via `opsx:apply`) trigger `agent-sync` to regenerate the JSON.

## Schema

```json
{
  "schema_version": "1.0.0",
  "change": "<change-name>",
  "generated_at": "<ISO-8601 UTC>",
  "source_md_sha": "<sha256 of tasks.md content>",
  "mode": "1|2|3|4|5|6|6b|7",
  "tasks": [
    {
      "id": "1.1",
      "title": "Add /health endpoint",
      "owner": "backend",
      "wave": 1,
      "spec": "openspec/changes/<change>/specs/health-check.md",
      "wave_slice": "n/a",
      "stories": ["US-001-01"],
      "dependencies": [],
      "definition_of_done": "GET /health returns 200 with {status: 'ok', uptime: <seconds>}",
      "verification_gate": {
        "type": "cmd",
        "value": "npm test src/routes/health.test.ts"
      },
      "mockup_ref": "n/a",
      "status": "pending|in_progress|done|blocked|skipped",
      "attempts": 0,
      "last_failure_reason": null,
      "contracts": [
        { "topic_key": "contract/get-health", "published_by": "backend" }
      ],
      "files_modified": []
    }
  ]
}
```

## Field semantics

| Field | Notes |
|---|---|
| `schema_version` | Bumped when this schema changes. Sub-agents reject unknown majors. |
| `source_md_sha` | Used by `agent-sync` to detect drift between MD and JSON. On mismatch → regenerate JSON from MD. |
| `mode` | Used by validator to apply mode-specific scoring (Mode 1 collapses gates; Mode 7 has no validator at all). |
| `tasks[i].verification_gate` | One of the C4-locked types: `cmd` / `playwright` / `agent-browser` / `opsx-verify` / `manual`. Free text is rejected at planner write-time. |
| `tasks[i].status` | `pending` (not yet dispatched), `in_progress` (current dispatch), `done` (MD checkbox is `[x]`), `blocked` (escalated), `skipped` (Mode 1 auto-promote, etc.). |
| `tasks[i].attempts` | Mirrors the B4 cycle counter for the (change, owner) pair so agents can read prior failure context fast. |
| `contracts` | Cross-domain contract topics published by this task — used by waiting agents (e.g., FE waits for BE `contract/<endpoint>`). |
| `files_modified` | Best-effort list of files touched by this task. Used by the C5 scorecard's spec-adherence check and B3's scope guard. |

## Rules

1. **Single source of truth for status (write-side) is `tasks.md`.** JSON status reflects MD. Never let the JSON drive a `[ ] → [x]` flip.
2. **JSON regenerates from MD on demand.** If `tasks-<change>.json` is missing, `agent-sync` rebuilds it from MD on its next dispatch. Hash mismatch (computed sha vs. stored `source_md_sha`) → rebuild.
3. **Agents read JSON for fast filtering.** Use cases: "give me all `pending`, `owner=frontend`, `wave=2`" without re-parsing MD.
4. **Validator reads JSON for the C5 scorecard.** Each criterion's evidence references task `id`s.
5. **Commits include the JSON sidecar.** It travels with the change folder. The B2 `commit_phase=test` includes it (via `git add .engram/state/verify-<change>.json` AND `.engram/state/tasks-<change>.json`).
6. **Soft-deleted on archive.** After `opsx:archive`, `agent-sync` flags the JSON for archive cleanup; do not hard-delete (audit trail).

## Acceptance

- After every wave, `tasks-<change>.json` and `tasks.md` agree on every checkbox.
- Deleting the JSON regenerates it from MD on the next `agent-sync` run.
- `opsx:apply` / `opsx:verify` contract is unchanged (MD remains canonical for OpenSpec).
