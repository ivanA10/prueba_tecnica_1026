---
name: forge:github-ops
version: 1.0.0
description: >
  Branch + commit + PR hygiene wrapped into the four B2 commit checkpoints
  (plan / impl / test / archive). Used by the github-ops agent. Enforces
  the B1 branch gate (one branch per change folder, --multi-spec-branch
  for bundles), scopes git add to the change folder + domain paths, and
  runs the B5 pre-flight bugfix-pr check before opening a PR. Mode 1
  (simple) collapses to two checkpoints (impl + test).
triggers: ["github-ops", "commit-phase", "open-pr", "create-branch"]
layer: 2
wraps: github-ops agent
phase: any
applies-to: github-ops
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:github-ops

## One-shot example

```
ORCHESTRATOR: Agent(github-ops, action=create_branch, change=add-auth-flow)
  → bash scripts/sdd-pre-implement.sh add-auth-flow   (B1 OK on feat/add-auth-flow)
  → git checkout -b feat/add-auth-flow && git push -u origin feat/add-auth-flow
  → mem_save pr/add-auth-flow {branch, base}

Later, after planner approval:
ORCHESTRATOR: Agent(github-ops, commit_phase=plan, change=add-auth-flow)
  → git add openspec/changes/add-auth-flow/ (scoped)
  → git commit -m "plan(add-auth-flow): JWT sliding sessions [ref: add-auth-flow]"

After all impl + tester waves:
ORCHESTRATOR: Agent(github-ops, commit_phase=impl)
  → git add <frontend_paths> <backend_paths> openspec/changes/add-auth-flow/
  → git commit -m "feat(auth): add JWT sliding session expiry [ref: add-auth-flow]"

After validator PASS:
ORCHESTRATOR: Agent(github-ops, commit_phase=test)
  → git add <test_paths> .engram/state/verify-add-auth-flow.json .engram/state/tasks-add-auth-flow.json
  → git commit -m "test(add-auth-flow): validator pass [ref: add-auth-flow]"

After opsx:archive + engram sync:
ORCHESTRATOR: Agent(github-ops, commit_phase=archive)
  → git add openspec/specs/ openspec/changes/add-auth-flow/ .engram/
  → git commit -m "chore(archive): add-auth-flow"

Final result: git log --oneline feat/add-auth-flow shows exactly 4 commits.
```

## When to use

Invoked by the github-ops agent for any branch / commit / PR action. The orchestrator never calls git or gh directly.

## Action types

| Action | Inputs | Side effect |
|---|---|---|
| `create_branch` | `<change-name>` or `--bundle <bundle>` | Creates `feat/<change-name>` or `feat/<bundle>`, pushes, saves Engram `pr/<change>` |
| `commit_phase=plan` | `<change-name>` | Scoped `git add openspec/changes/<change>/`; commits `plan(<change>): <summary>` |
| `commit_phase=impl` | `<change-name>` | Scoped `git add` to domain paths + change folder; commits `feat(<scope>): <change>` |
| `commit_phase=test` | `<change-name>` | Scoped `git add` to test paths + verify sidecar; commits `test(<change>): validator pass` |
| `commit_phase=archive` | `<change-name>` | Scoped `git add openspec/specs/ + .engram/`; commits `chore(archive): <change>` |
| `pre_flight_check` | `<change-name>` | Dispatches `Agent(bugfix-pr, mode=pre-flight, change=<change>)`; aborts on critical |
| `open_pr` | `<change-name>` | Pushes branch (if not already), opens PR, captures URL + CI to Engram |

## Step 0 — Branch gate (B1)

For any non-`create_branch` action, FIRST run:

```bash
bash scripts/sdd-pre-implement.sh <change-name> [--bundle <bundle>]
```

If exit ≠ 0, refuse the action and report to orchestrator: "Branch gate FAIL — current branch must be `feat/<change>` (or `feat/<bundle>` if bundle mode). Dispatch `create_branch` first."

## Step 1 — Resolve scoped paths

Read the project-stack `Domain Map` from AGENTS.md. The B2 commit phases use deterministic path lists:

| Phase | Paths added |
|---|---|
| `plan` | `openspec/changes/<change>/` (only) |
| `impl` | `<frontend_paths>` + `<backend_paths>` + `<database_paths>` + `openspec/changes/<change>/` (only with diffs) |
| `test` | `<test_frontend_paths>` + `<test_backend_paths>` + `.engram/state/verify-<change>.json` |
| `archive` | `openspec/specs/` + `openspec/changes/<change>/` + `.engram/` |

NEVER use `git add -A`, `git add .`, or any unscoped pattern. If a diff exists outside the resolved paths, abort and report the offending file list to the orchestrator.

## Step 2 — Compose commit message

| Phase | Format | Example |
|---|---|---|
| `plan` | `plan(<change>): <one-line summary> [ref: <change-name>]` | `plan(add-auth-flow): JWT sliding sessions [ref: add-auth-flow]` |
| `impl` | `feat(<scope>): <description> [ref: <change-name>]` | `feat(auth): add JWT sliding session expiry [ref: add-auth-flow]` |
| `test` | `test(<change>): validator pass [ref: <change-name>]` | `test(add-auth-flow): validator pass [ref: add-auth-flow]` |
| `archive` | `chore(archive): <change-name>` | `chore(archive): add-auth-flow` |

Mode 1 simple uses only `impl` and `test` phases — no `plan` (no proposal/design exists) and no `archive` (handled inline).

## Step 3 — Pre-flight check (B5)

For `open_pr` action:

1. Run `Agent(bugfix-pr, mode=pre-flight, change=<change-name>)`.
2. Read its response: if `block: true`, write `pr/<change>/preflight-block` to Engram with the critical findings, abort, and report to orchestrator.
3. Otherwise proceed to `gh pr create`.

## Step 4 — Open PR

Standard body: Summary · Test plan checklist · `Spec:` link · `Verify:` Engram topic_key. Title matches the `feat(...)` commit format.

## Acceptance

- After a Mode 2 cycle, `git log --oneline feat/<change>` shows exactly 4 commits (plan, feat, test, chore-archive).
- Mode 1 simple shows exactly 2 commits (feat, test).
- Pre-flight Codacy critical aborts PR creation; resolution unblocks normally.

<!-- forge:skill:forge-github-ops:3.0.0 -->
