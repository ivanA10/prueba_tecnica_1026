# Task format — opsx-compatible + forge-enriched

OpenSpec's `opsx:apply` toggles `- [ ] N.N` checkboxes. `opsx:verify` reads completion from those lines. The forge orchestration layer reads indented sub-bullets for wave dispatch, profile assignment, and dependency analysis.

**Never replace the opsx checkbox line. Add forge metadata as indented sub-bullets beneath it.**

## Required fields per task

```markdown
- [ ] N.N Task title here
  - **Change:** <change-name>
  - **Spec:** `openspec/changes/<change-name>/specs/<capability>.md`
  - **Spec wave slice:** <`## Wave N — [scope]` section name, or `n/a`>
  - **Stories:** <US-XXX-YY, ...>
  - **Owner profile:** <frontend | backend | database | fullstack>
  - **Dependencies:** <N.N, N.M | none>
  - **Definition of done:** <what must be true>
  - **Verification gate:** <one of the 5 machine-checkable types — see below>
  - **mockup_ref:** <Figma node URL, file path, or `n/a`>
```

## Verification gate types (C4 — machine-checkable, free text rejected)

The `Verification gate` field MUST start with one of these prefixes. The planner skill validates this at write time. The validator parses the prefix and executes accordingly.

| Type | Format | Example |
|---|---|---|
| `cmd:` | `cmd:<bash command that exits 0 on pass>` | `cmd:npm test src/users` |
| `playwright:` | `playwright:<spec path or test id>` | `playwright:tests/e2e/login.spec.ts` |
| `agent-browser:` | `agent-browser:<step-list separated by ;>` | `agent-browser:nav /login; click @e1; fill @e2 admin; click @e3; expect /dashboard` |
| `opsx:verify` | `opsx:verify <change-name>` | `opsx:verify add-auth-flow` |
| `manual:` | `manual:<numbered checklist>` | `manual: 1) Open /tickets 2) Create one 3) Verify in list` |

**Free text is rejected.** Examples that fail planner validation:

- ❌ `Verification gate: works correctly` (free text)
- ❌ `Verification gate: tests pass` (no command)
- ❌ `Verification gate: E2E test` (no spec path)

**Examples that pass:**

- ✅ `Verification gate: cmd:pnpm test src/auth/login.test.ts`
- ✅ `Verification gate: playwright:tests/e2e/auth/login.spec.ts`
- ✅ `Verification gate: agent-browser:nav /login; fill @e1 user@x.com; fill @e2 secret; click @e3; expect /dashboard`
- ✅ `Verification gate: opsx:verify add-auth-flow`
- ✅ `Verification gate: manual: 1) Sign out 2) Click "Forgot password" 3) Receive email 4) Reset and sign in`

## Validation behavior

`schemas/task-format.md` is the source of truth.

- **Planner**: at task-write time, parse the `Verification gate:` field. Reject any task whose value does not start with one of the 5 prefixes. When `MULTI_REPO=true`, additionally reject any task missing the `- **Repo:** <repo-key>` sub-bullet (same severity as free-text gates).
- **Validator**: parse the prefix, dispatch the appropriate verifier. **Multi-repo: first resolve the task's `Repo:` key → `cd` into that repo's path from `openspec/config.yaml` (see `agent_docs/dispatch-waves.md` § Multi-repo gate execution) — a gate run from the hub cwd is invalid even if it passes.** Then:
  - `cmd:` → run as bash, capture exit code + last 2KB of stdout/stderr.
  - `playwright:` → invoke `npx playwright test <path>`.
  - `agent-browser:` → run via the forge:browse skill (D1).
  - `opsx:verify` → call `opsx verify <change>` (runs from the hub — specs live there).
  - `manual:` → render checklist into the ✅ manual-test gate message.
- **Mode 1 (simple)**: `manual:` gates are auto-converted to a brief comment on the test commit; no manual-test handoff is presented.

## Other rules

- `Owner profile` determines which implementer receives the task.
- `mockup_ref` is required on all frontend tasks.
- For multi-repo: `- **Repo:** <repo-key>` is **mandatory on every task** (planner rejects without it). The key names both the implementer's cwd and the gate executor's cwd.
- `Spec wave slice` is mandatory when a spec spans multiple waves.
- Tasks that cannot satisfy these fields must be split or clarified before proceeding.
