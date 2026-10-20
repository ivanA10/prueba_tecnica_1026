# Dispatch Waves — Detail

Per-wave dispatch protocol referenced from `rules/orchestrator-dispatch.md`.

## Multi-repo gate execution (AU-4 — execution cwd is part of the gate)

When `MULTI_REPO=true`, every task carries a `Repo: <key>` sub-bullet (planner
rejects tasks without it). Before executing ANY `cmd:` / `playwright:`
verification gate, the executor (validator or tester) MUST resolve the task's
`Repo:` key to its path from the hub's `openspec/config.yaml` and run the gate
**inside that repo**:

```bash
# Repo: api → resolve path, then run the gate there
REPO_PATH=$(awk '/^repos:/{f=1;next} f&&/^  api:/{flat=$2} f&&k&&/^    path:/{print $2;exit} f&&/^  api:[[:space:]]*$/{k=1} END{if(flat)print flat}' openspec/config.yaml)
( cd "$REPO_PATH" && pnpm test src/users )   # exit 0 = pass
```

A gate executed from the hub's cwd is INVALID even if it passes — wrong
dependency tree, wrong config. Tasks with `Repo:` pointing at the hub itself
(`Repo: hub`) run from the hub root. Member-repo gate dispatches still follow
the loading contract: executor cwd = member root.

## Wave N start

1. Read `tasks.md` — identify all tasks in `Wave N`.
2. Group by `Owner profile`: frontend, backend, database.
3. For each group with independent tasks, dispatch in parallel:
   - `Agent(frontend)` — "Implement tasks [list]. Read specs at [paths]. Follow `forge:implement` skill. Mark tasks complete in tasks.md."
   - `Agent(backend)` — same pattern
   - `Agent(database)` — same pattern
4. Wait for all Wave N agents to complete.
5. Verify: read tasks.md, confirm all Wave N tasks checked off.
6. On any failure → cycle counter logic (`agent_docs/dispatch-escalation.md`).

## Wave N+1 (testing)

7. Dispatch `Agent(tester-front)` and `Agent(tester-back)` in parallel.
8. Wait for completion.
9. Dispatch `Agent(github-ops, commit_phase=impl)` — atomic commit of impl + tests scoped to the change folder.

## Final wave (validation + archive)

10. Dispatch `Agent(validator)` — produces C5 scorecard, writes `verify/<change>` Engram topic.
11. Present ✅ MANUAL TEST GATE to the user with the scorecard human-readout.
12. After ✅ → `Agent(github-ops, commit_phase=test)`.
13. Run `opsx:archive`.
14. Run `engram sync` and `Agent(github-ops, commit_phase=archive)`.

## Mode 1 (simple) collapse

Single wave only. No planner, no proposal/design. Auto-generated `tasks.md` with ≤5 tasks. Two commits:
- `Agent(github-ops, commit_phase=impl)` after impl + tester pass.
- `Agent(github-ops, commit_phase=test)` after validator scorecard.

Manual-test gate is skipped in Mode 1 — auto-tests + scorecard hard-fails are sufficient.

## Cross-domain conflict resolution

- FE + BE share an API contract → contract defined in `design.md` BEFORE either agent dispatches.
- BE depends on a DB migration → dispatch database first, await completion, then dispatch backend.
- All cross-domain dependencies recorded in tasks.md `Dependencies:` sub-bullet.

## Parallel reads, serial writes (Ralph rule)

Read-heavy fan-out (codebase exploration, doc fetches) can be parallelized across multiple sub-agents. Write/test/build operations stay serial within a wave to prevent race conditions on shared resources (DB schema, generated files, lockfiles).
