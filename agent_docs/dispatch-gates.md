# Dispatch Gates — Detail

Mechanical gates referenced by `rules/orchestrator-dispatch.md`. These fail closed: if the gate cannot be confirmed, the orchestrator stops with a diagnostic.

## Branch gate (B1) — per-change-folder

**Rule:** one branch per `openspec/changes/<change-name>/`. Branch must be `feat/<change-name>` (kebab-case match).

**Bundle override:** if the user passes `--multi-spec-branch <bundle-name>` at plan approval, the gate accepts `feat/<bundle-name>` and the orchestrator writes Engram topic `gate/multi-spec-branch/<bundle-name>` with the list of bundled change names for audit.

**Mechanism:**
- `scripts/sdd-pre-implement.sh <change-name> [<bundle-name>]` exits 1 unless current branch matches.
- Hook `PreToolUse(Write|Edit)` invokes the script before any implementation write.
- Orchestrator dispatches `Agent(github-ops, action=create_branch)` immediately after plan approval (📋) so the branch exists before the impl wave begins.

**Acceptance:**
- Implementation cannot start on `main`, `develop`, or wrongly-named branch.
- `--multi-spec-branch <bundle>` saves bundle membership; multiple changes can land on one branch.
- Default = single change folder per branch.

## Lint scope guard (B3) — no codebase-wide rewrites

**Rule:** lint/format only files modified in the current task. Use `git diff --name-only HEAD` to scope. If linter doesn't support per-file scoping, skip and report instead.

**Mechanism:**
- Block in `forge:implement` skill: "Scope guard — never run repo-wide lint."
- `scripts/sdd-scope-check.sh <change-name>` compares changed files against the task scope window. If `delta_files > 2 × expected_files`, exits 1 with a diagnostic listing the unscoped paths.
- Hook: `PreToolUse(Bash)` for any command containing `lint`, `format`, `prettier --write`, `eslint --fix`, etc., calls `sdd-scope-check.sh` first.

**Acceptance:**
- Single lint error in 1 file → only that file is touched in the resulting commit.
- Repo-wide `eslint --fix` is blocked at the hook layer.

## Pre-PR pre-flight (B5) — bugfix-pr auto-promote

**Rule:** before `github-ops` opens a PR, run `bugfix-pr` in `mode=pre-flight`. If the local Codacy report on the diff has any `severity: critical`, BLOCK PR creation until those issues are fixed.

**Mechanism:**
- `github-ops` step 4.5 (between `push` and `gh pr create`):
  ```
  Agent(bugfix-pr, mode=pre-flight, change=<change-name>)
  ```
- bugfix-pr runs Codacy locally on `git diff`, classifies findings, writes `pr/<change>/preflight-block` if any critical, exits with `block: true`.
- If `block: true`, github-ops aborts the PR creation and reports back to the orchestrator. Orchestrator dispatches the appropriate domain agent (FE/BE/DB) to fix, then retries `github-ops`.

**Acceptance:**
- Inject a Codacy critical issue → PR creation is blocked with a clear diagnostic.
- Resolve the issue → PR opens normally.

## Verification gate format (C4)

`Verification gate:` field in tasks must be one of:

| Type | Example |
|---|---|
| `cmd:<bash>` | `cmd:npm test src/users` |
| `playwright:<spec>` | `playwright:tests/e2e/login.spec.ts` |
| `agent-browser:<steps>` | `agent-browser:nav /login; click @e1; fill @e2 admin; click @e3; expect /dashboard` |
| `opsx:verify <change>` | `opsx:verify add-auth-flow` |
| `manual:<checklist>` | `manual: 1) Open /tickets 2) Create one 3) Verify in list` |

Free text rejected at planner write-time. Validator parses the gate type and executes accordingly. See `schemas/task-format.md`.
