# Validation cascade policy (W3 of forge-token-cascade-refactor)

> Read this file (explicit `Read` call) when an agent or the orchestrator hits a `[CASCADE-CAP]` or `[CASCADE-STOP]` signal — it never auto-loads. Linked from `rules/agent-common.md`, `rules/orchestrator-dispatch.md`, and 6 agent bodies (`frontend`, `backend`, `database`, `tester-front`, `tester-back`, `validator`).

## Why this exists

Production trace evidence from the user's LangSmith project showed one trace — `019e6697-5d07-7225-963f-fe75054fc4fb` ("Backend Wave 0 create-user-flow") — ran for **53 minutes**, consumed **52.6M tokens** across the trace tree, with **446 runs** in a single Claude Code Turn. Inside it: 33 full-monorepo test invocations, 15 prettier re-runs on the same paths, 6 typecheck-on-whole-package calls, 7 mid-wave `pnpm install` attempts (driven by a missing AWS SDK symlink), and 5+ rounds of symlink debug (`readlink`, `ln -s`, `find … -name <module>`).

That trace is the explicit anti-pattern this policy prevents.

## State machine

```
on Bash PreToolUse:
    if cmd is an ESCAPE command (reset script / rm|cat of cascade-depth.json):
        allow (rc=0)     — escape hatch; the cap must never block its own reset
    read .claude/state/cascade-depth.json
    if banned_triggered:
        HARD-BLOCK (rc=2) — surface to orchestrator
    if depth > 1:
        BLOCK (rc=2)     — depth cap exceeded
    allow (rc=0)

on Bash PostToolUse:
    if cmd matches BANNED pattern:
        set banned_triggered = true (sticky for this wave)
        emit advisory stderr; NEXT call is hard-blocked by PreToolUse
    if cmd matches VALIDATION-STEP pattern:
        infer outcome from tool_response.output + exit_code
        FAIL → depth += 1     (advisory; the just-finished cmd already ran)
        PASS → depth = 0      (success clears prior failures)

on Stop:
    reset state file (cascade-depth.json removed)
```

## Banned mid-wave patterns (immediate hard-block on first occurrence)

These are never legitimate mid-wave agent work. Triggering one of these sets the sticky `banned_triggered` flag, which causes the NEXT Bash call to be hard-blocked with `[CASCADE-CAP] HARD-BLOCK` (PreToolUse rc=2). No depth-1 grace; no remediation attempts.

**Matching is verb-anchored, not substring.** Before any pattern runs, quoted spans in the command are blanked (delimiters kept, contents dropped), so text *inside* a `grep`/`rg`/`echo` argument — e.g. the validator grepping this very rule list for `"pnpm install"` — never trips a matcher. Package-install is recognised only at a **command position** (first token of a segment, after a leading `sudo` / `python -m` / env-assignment), so `<pm> install` appearing as an argument or flag value does not fire. `--dry-run` (and `--dryrun` / `--dry_run`) is a non-mutating preview and is explicitly excluded — it is not an install.

| Banned pattern | Regex (approx) | Why it's banned | Allowed alternative |
|---|---|---|---|
| Package install mid-wave | `<pm> (install\|i\|add\|…)` at a **command position** (not `--dry-run`) | Install issues are user-side, not agent-side. Observed 7× in the worst trace consuming ~12min. | Report `[CASCADE-STOP] missing module <name> — please install` to orchestrator. |
| Symlink debug | `(ln\s+-s\|readlink).*node_modules` | Symlink hunting is environment-debug, not coding work. | Surface to orchestrator with the failing import + path. |
| `node_modules` find | `find.+-name.*node_modules` | Same — environment debug. | Surface to orchestrator. |
| Full-monorepo test | `(pnpm\|npm\|yarn\|bun)\s+(run\s+)?test\s*$` | Scope explosion — observed 17× in the worst trace. | `pnpm --filter @scope/<pkg> test src/__tests__/<specific>.test.ts` on files in the change folder only. |
| Prettier re-check after write | `prettier --check` after `prettier --write` on same paths | Pointless re-validation. Observed 3× in the worst trace. | One `prettier --write` pass on changed files, then proceed. |

## Validation-step patterns (depth tracking, cap = 1)

These ARE legitimate validation steps. They count toward `depth` only when they FAIL (success resets depth to 0).

- `pnpm test`, `pnpm --filter ... test`, `jest`, `vitest`, `npx jest`, `npx vitest`, `npx playwright test`
- `pnpm typecheck`, `pnpm --filter ... typecheck`, `tsc`, `npx tsc`
- `pnpm lint`, `pnpm --filter ... lint`, `eslint`, `npx eslint`
- `prettier --check`, `prettier --write`, `pnpm prettier:*`

Outcome inference is **exit-code only** — no stdout substring scanning:
- structured `exit_code != 0` → FAIL.
- else, the textual `Exit code: N` line Claude Code appends to **failed** output → FAIL if `N != 0`.
- else (no exit code anywhere) → **PASS, depth reset**. Claude Code appends `Exit code:` only on failure, so its absence means the command exited 0.

This deliberately does NOT scan stdout for `error`/`failed`/`✗` markers. That heuristic miscounted *passing* verify gates whose output benignly mentions those words (e.g. `lint PASS — 0 errors; 12 warnings`, `build` logs) as failures, bumping `depth` on green runs. The classification is best-effort; false negatives leak past the cap and rely on the agent body rule + validator scorecard criterion 7 to catch them. A false *positive* that blocks legitimate verification is the costlier mistake, so the cap leans toward PASS when no exit code is present.

## Cap = 1 — what the agent must do

After ONE failed validation step:
1. The hook writes `depth=1` to state.
2. Agent receives stderr feedback: `[CASCADE-CAP] validation step FAILED (depth=1, remediation allowed)`.
3. Agent gets ONE narrowly-scoped remediation attempt (same files, same gate, no scope expansion — e.g., re-run the SAME failing test after fixing the obvious issue).
4. If that attempt also FAILS: `depth=2`, PostToolUse emits a stronger warning. **The very next Bash call is hard-blocked by PreToolUse.**
5. Agent must surface `[CASCADE-STOP] <failing-step> — <one-line-root-cause-hypothesis>` to the orchestrator. The orchestrator (not the agent) decides whether to dispatch a remediation, escalate to the user, or HALT the wave.

## Worked anti-example (from the worst trace)

> Backend Wave 0 — `create-user-flow` change folder, in the live trace.

```
1.  Bash: pnpm --filter @scope/api test         → FAIL (importing @aws-sdk/client-s3 from a path that resolves wrong)
2.  Bash: pnpm install                          ← BANNED. Should have surfaced [CASCADE-STOP].
3.  Bash: pnpm --filter @scope/api test          → FAIL (same)
4.  Bash: readlink node_modules/.pnpm/@aws-sdk... ← BANNED.
5.  Bash: ln -s ../../@aws-sdk-real node_modules/.pnpm/...  ← BANNED.
6.  Bash: pnpm test                              ← BANNED (full-monorepo).
7.  Bash: prettier --write src/                  → SUCCESS
8.  Bash: prettier --check src/                  ← BANNED (re-check after write).
... (446 runs in this turn, 9.6M tokens in one backend subagent alone)
```

With this policy in place:
- Step 2 → BANNED HARD-BLOCK. Agent surfaces `[CASCADE-STOP] missing module @aws-sdk/client-s3 in node_modules` to orchestrator.
- Orchestrator halts the wave, surfaces to user: "missing module — please run pnpm install at repo root, then resume."
- Total cost for the wave: < 1M tokens, < 15min wall.

## Reset triggers

- **Stop event** (turn / session end): `sdd-cascade-reset.sh` deletes the state file.
- **In-turn recovery (escape hatch)**: even with the cap tripped, the PreToolUse hook always allows the reset script, an `rm` of `cascade-depth.json`, and a `cat` of it. The orchestrator can therefore clear the cap and resume within the same turn — it is not forced to wait for the Stop event. (Without this, the cap blocked its own reset — chicken-and-egg deadlock.)
- **Wave boundary**: orchestrator may pre-emptively `rm .claude/state/cascade-depth.json` before dispatching the next wave (allowed by the escape hatch above). `FORGE_WAVE_NUMBER` env-var auto-reset is reserved for future wiring.
- **First successful validation step on a fresh wave**: depth = 0 (no explicit reset needed — pass clears prior fails).

## 3-layer enforcement

1. **CC (Claude Code)**: `scripts/sdd-cascade-cap.sh` dual-event hook (PreToolUse + PostToolUse on Bash) + `scripts/sdd-cascade-reset.sh` on Stop. Registered in `.claude/settings.json` / `.codex/hooks.json`.
2. **OC (OpenCode)**: hook layer not wired in OpenCode templates today; the agent body section (`## Validation cascade policy` in `frontend`, `backend`, `database`, `tester-front`, `tester-back`, `validator`) carries the contract.
3. **Validator scorecard**: criterion 7 `cascade_discipline` (hard-fail < 1; PASS ≥ 17/21 after the criterion was added in W3). The validator reads `.claude/state/cascade-depth.json` + the trace log post-wave and scores discipline.

## Orchestrator handling of `[CASCADE-STOP]`

See `rules/orchestrator-dispatch.md` → "Cascade-stop handling". Summary:
- Orchestrator does **NOT** re-dispatch the same role on the same wave automatically after `[CASCADE-STOP]`.
- It surfaces to the user with the failing step + root-cause hypothesis + the subagent's report.
- User chooses: fix manually + resume, fix manually + restart wave, or split the change.
