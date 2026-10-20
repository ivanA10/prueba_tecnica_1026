# Worktrees evaluation spike (D3)

> Status: **Spike — not adopted as default. Claude Code's built-in `EnterWorktree` tool is denied org-wide** (see "Platform-tool deny" below). This doc records the question, the hypothesis, the benchmark plan, and the decision after the first controlled run.

## Platform-tool deny — `EnterWorktree`

`templates/settings/permissions.json` adds `"deny": ["EnterWorktree"]` so Claude Code's auto-isolation worktree feature is OFF for every target repo synced from this distribution. Rationale:

- **Upstream context-duplication is unfixed.** [`anthropics/claude-code#3232`](https://github.com/anthropics/claude-code/issues/3232) — `CLAUDE.md` is loaded from BOTH parent and worktree, doubling per-agent context. Closed "not planned"; will not be fixed.
- **Memory cost is non-linear.** Each Claude process is a separate Node process; with worktrees, each also carries its own working tree (potential `node_modules` clone, file watchers, language servers). Documented practical ceiling per [Claude Code worktree docs](https://code.claude.com/docs/en/worktrees) is 6–10 active worktrees per developer; reports of 128 GB RAM consumption indicate the ceiling is real.
- **The Mode 2 `--worktrees` flag is unaffected.** That flag triggers shell-level `git worktree add` for the orchestrator's domain split (FE/BE/DB) and never invokes the platform `EnterWorktree` tool. The opt-in spike below remains usable.

To re-enable the platform feature on a single repo for benchmarking, remove the deny entry from that repo's `.claude/settings.json` directly. To re-enable for the org, drop the entry from `templates/settings/permissions.json` and re-sync.

## Question

Do `git worktree`-per-domain (FE/BE/DB) Mode 2 cycles improve wall-time and quality vs the single-tree default?

## Hypotheses

1. **Wall-time improves**: parallel FE+BE work avoids `git stash` dance and lockfile contention; agents can run `npm install` / build / test in parallel.
2. **Quality is preserved**: per-worktree isolation does not increase merge-conflict bug rate vs. single-tree branches.
3. **Setup overhead < parallel savings**: the cost of `git worktree add ../<change>-fe …` + dup `node_modules` + dup `.env` is offset by eliminating wait-for-lock time.

## Risks

- Hidden state divergence: `node_modules`, `.env`, generated files, IDE indexes drift between worktrees → silent inconsistency.
- Engram cross-worktree state: `.engram/` lives in the main worktree only; sub-agents in side worktrees need cross-project search to share state. The existing `scripts/engram-cross-project.sh` already supports this.
- Merge surface: 3 branches per change × N changes per week creates a denser merge graph. Some teams treat this as feature; others as a debt.

## Benchmark plan

Same change ("add notification preferences", multi-domain: FE settings panel + BE preferences API + DB column), run twice on equivalent baselines:

### Run A — baseline (single tree)

```bash
/sdd 2 add-notification-preferences
# normal Mode 2 cycle, 4 commits
```

### Run B — worktrees per domain

```bash
/sdd 2 add-notification-preferences --worktrees
# orchestrator dispatches:
#   git worktree add ../add-notification-preferences-fe feat/add-notification-preferences-fe
#   git worktree add ../add-notification-preferences-be feat/add-notification-preferences-be
#   git worktree add ../add-notification-preferences-db feat/add-notification-preferences-db
# agent-sync handles cross-worktree state via Engram cross-project search
# github-ops merges all three side branches into feat/add-notification-preferences before opening the PR
```

## Metrics captured (D2 perf report)

For each run:
- Total wall time
- Tool I/O bucket (Read/Write/Bash)
- MCP overhead bucket
- Model generation bucket
- Human-gate wait bucket
- Final scorecard verdict + total

Plus repo-state metrics:
- Total disk used (worktrees inflate)
- `node_modules` size duplication
- Merge conflicts encountered
- Bugs surfaced post-merge in CI

## Decision criteria

| Outcome | Decision |
|---|---|
| B beats A by ≥ 25% wall-time AND scorecard ≥ A AND no merge conflicts | **Adopt** as default for cross-domain Mode 2 cycles. Single-domain stays single-tree. |
| B beats A by 10–25% wall-time, no quality regression, manageable merges | **Conditional** — opt-in via `--worktrees` flag (already wired). Document the trade-off. |
| B is within ±10% of A, OR quality regression, OR merge cost noticeable | **Reject as default.** Keep `--worktrees` flag for advanced users. |

## Result (placeholder — fill after first benchmark)

| Metric | Run A (baseline) | Run B (worktrees) | Δ |
|---|---|---|---|
| Wall time | TBD | TBD | TBD |
| Tool I/O | TBD | TBD | TBD |
| MCP overhead | TBD | TBD | TBD |
| Scorecard total | TBD | TBD | TBD |
| Merge conflicts | TBD | TBD | TBD |
| Disk used | TBD | TBD | TBD |

**Decision** (after first run): TBD — until then `--worktrees` is opt-in, not default.

## Mode 1 (simple) note

Worktrees are NOT used in Mode 1 simple — by definition single-domain, ≤3 files, 2 commits. The overhead vs. payoff math doesn't favor worktrees for that scope.
