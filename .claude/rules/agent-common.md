# Agent common protocol

> Shared protocol referenced by every sub-agent (`agents/claude/*.md`).
> Installed at `.claude/rules/agent-common.md` in target repos.

## Sub-agent isolation

You are running as a sub-agent. You do NOT have access to the Agent tool.
Do not delegate. Execute assigned tasks directly. If a task is outside your domain,
mark BLOCKED and return to orchestrator.

## Bootstrap gate (mandatory first action — loading-contract layer 2)

Read `./AGENTS.md` — the one in your **current working directory**. In
multi-repo work you are dispatched with cwd = the repo you operate in; that
repo's instruction files are the only ones that load (sibling repos,
including the coordination hub, are invisible on every runtime). Look for
`<!-- forge:section:project-stack -->`:

- If MISSING and your envelope has a `repo:` field (member-repo dispatch):
  return `BLOCKED [CONTEXT] missing: project-stack` and stop — the hub must
  bootstrap this member (Mode 6b), not you.
- If MISSING otherwise (single-repo session): report `[BOOTSTRAP] no
  project-stack — request agent-prep` and stop. (Exception: agent-prep itself.)
- If PRESENT: parse the `Domain Map` to resolve your domain paths. Never use hardcoded
  defaults silently — if your `<role>_paths` is empty, emit `[DOMAIN] WARNING` and
  ask orchestrator to re-run agent-prep.

Your envelope NEVER inlines instruction-file content. If it appears to (long
AGENTS.md quotes in the prompt), flag it in your report — that's a dispatch
bug. Hard restrictions in the envelope are authoritative even if you cannot
see this rules file (Codex subagents may not inherit the AGENTS.md chain).

## Engram protocol (mandatory)

- BEFORE task: `mem_search` with topic_prefix relevant to your work.
- DURING task: save discoveries via `mem_save` with `topic_key` per
  `schemas/memory-topics.md` (installed copy at `.claude/rules/memory-topics.md`
  or root `schemas/memory-topics.md`). Never write outside your namespace —
  see your agent frontmatter `memory_namespaces:` field.
- AFTER task: if you completed a wave-level milestone, ensure agent-sync
  has updated `state/wave/<change>/<N>`.
- IF Engram unreachable: continue work, emit `[MEMORY] WARNING — operating without
  persistence`. Do NOT block. Single exception: if `.engram/` directory or
  `engram.db` exists in repo → BLOCK and surface install instructions
  (see `agent_docs/engram-install.md`).

## Memory retrieval ladder (mandatory)

See `agent_docs/memory-budget.md` for the full contract. Operational summary:

- **L1 default**: `mem_search` with `limit≤3`, preview snippets only.
- **L2 escalation**: `mem_timeline observation_id=<id>` only when chronological neighborhood matters.
- **L3 last resort**: `mem_get_observation id=<id>` only when exact untruncated body is required AND L1 confidence is high. Must be summarized into a card before passing across waves.
- **`mem_context`**: forbidden by default. Allowed only in post-compaction, explicit user recall, or session resume.

Per-turn budget per agent: `max 2 search`, `max 1 full-fetch (L3)`, `max 1200 mem-tokens injected`. Enforced by `scripts/sdd-memory-budget.sh` hook.

If you receive memory cards in your dispatch briefing (`engram_context: [...]`), do NOT call `mem_search` on start. Search only if you discover a new domain need not covered by the cards.

## Briefing-first protocol

Read your own body for an `## Engram access tier:` section to determine your access level:

- **`save-only`** (W4): you only have `mem_save`. The orchestrator passes context via `engram_context: [...]` in your dispatch briefing. Use those cards. If context is insufficient, return BLOCKED with `[CONTEXT] missing: <topic_prefix>` rather than attempting to search.
- **`search-capable`** (W5): you have full Engram access. Still check `engram_context: [...]` first. Only search when a NEW domain emerges not covered by cards.

`mem_context` is forbidden for all subagents in all cases — only the orchestrator may invoke it after compaction.

### Mandatory envelope fields (W4 of forge-token-cascade-refactor)

Every dispatch envelope MUST carry two fields (in addition to `engram_context`, `task`, `files`, etc.):

- **`goal: <≤25 words>`** — your task scope in one line. Stay within it; surface scope drift to the orchestrator instead of expanding silently. Missing `goal` = the orchestrator dispatched incorrectly; surface BLOCKED with `[BRIEFING] missing goal`.
- **`already_read_files: [<paths>]`** — files the orchestrator already loaded into shared context. **Do NOT re-Read these** unless another subagent edited them this wave. May be empty `[]`; absence of the field = orchestrator pre-W4 contract (treat as `[]` and log a warning).

Enforcement is honor-system + validator audit (per adjustment D, no runtime hook). The validator scorecard's criterion 6 `verification_gates` includes a re-read check: trace-log grep for `Read` calls on paths declared in `already_read_files` of the dispatch envelope. Repeat reads cap the criterion at 1.

Full schema: `agent_docs/dispatch-rules.md` → "Dispatch envelope (W4)".

## Topic_key namespace per agent

See `schemas/memory-topics.md`. Your allowed namespaces are listed in your agent
frontmatter under `memory_namespaces:`. Cross-namespace writes are forbidden.

## BLOCKED classes (canonical list)

Return `BLOCKED [<class>] <detail>` — one line, then stop. The orchestrator
routes on the class:

| Class | Meaning | Typical detail |
|---|---|---|
| `[BOOTSTRAP]` | no project-stack in single-repo session | `no project-stack — request agent-prep` |
| `[CONTEXT]` | briefing cards insufficient, or member repo not bootstrapped | `missing: <topic_prefix>` / `missing: project-stack` |
| `[CONTRACT]` | contract topic never appeared within the `wave_policy` poll budget | `missing: contract/<endpoint-slug>` |
| `[BRIEFING]` | envelope missing a mandatory field | `missing goal` |
| `[DOMAIN]` | WARNING — `<role>_paths` empty in Domain Map | re-run agent-prep |
| `[MEMORY]` | WARNING — Engram unreachable, continuing | operating without persistence |
| `[CASCADE-STOP]` | one validation failure, depth cap reached | `<failing-step> — <root-cause>` |

## Reporting

Announce skill invocations and report task completion to orchestrator.
Format: `[<agent>] <action> — status: <ok|blocked|warning> — files: <list>`.

## Ambiguity

Use the ❓ gate from `schemas/approval-gates.md`. Ask only genuinely blocking
questions. One question per response.

## Coordination

- Escalate blockers to orchestrator immediately.
- Mark tasks `[x]` in `tasks.md` as you complete them.
- Work only within your assigned domain. Do not modify files outside it.

## Test proportionality (cross-cutting)

When you write tests:

1. Read the task scope from `tasks.md`.
2. Apply the proportionality cap from `skills/forge-implement/SKILL.md` → "Test proportionality":
   - Mode 1 / single endpoint: 1–2 tests (happy + 1 critical edge).
   - Single-domain task: 2–4 tests (happy + error + edge).
   - Multi-file task: 3–6 tests.
   - Bugfix: 1 regression test + happy retest.
3. **Stop when the verification gate passes and the cap is met.** Do not "round out" the suite, do not add defensive tests for impossible inputs, do not snapshot output that has no semantic meaning.
4. If a security/compliance domain genuinely needs more, the planner must declare the budget in `design.md` under `## Testing strategy`. Absent that declaration, the cap rules.

### Hard ceilings (STOP markers — non-negotiable without `## Testing strategy`)

Crossing one of these ceilings is a signal that EITHER the agent over-tested a single task (redundant cases, snapshots, defensive tests) OR the change was scoped too large for the default budget and should be split. It is **not** automatically the same as ignoring the per-task cap — many small tasks each within 2–4 tests can still exceed the per-change ceiling. Either way: STOP, report, and do not write more tests until the cause is addressed (trim low-value cases or split scope).

| Boundary | Hard ceiling | Action when crossed |
|---|---|---|
| Per task | **6 tests** | STOP. Report `[TEST-CAP] task <id> exceeded 6 tests`. Re-read the per-task row above and trim. |
| Per file | **8 tests** | STOP. Report `[TEST-CAP] file <path> exceeded 8 tests`. Likely indicates snapshot/redundancy creep — drop low-value cases. |
| Per change folder (cumulative across tasks) | **30 tests** | STOP. Report `[TEST-CAP] change <name> exceeded 30 tests` and request scope split. A change generating 100+ tests is a planner-side scoping failure, not a tester signal. |

Industry rationale (recorded for calibration, not negotiation):
- Kent Beck: "Each test should make a unique contribution; otherwise it's wasted, confusing execution time." Redundant tests reduce signal and inflate maintenance.
- Martin Fowler / test pyramid: many fast unit tests, fewer integration, very few E2E — but each one earns its place. Bulk = noise.
- LLM-specific (DEVOPSdigest "token-tax" 2026; arXiv 2602.07900): agent-induced test generation often increases token cost 5–10× without improving task success; suppressing redundant tests yields large cost cuts with small quality drop. Over-testing is a known LLM agent failure mode.

The validator's C5 scorecard penalizes over-testing as `WARN: over-tested` in the test_coverage `evidence` field. Crossing a hard ceiling caps the test_coverage criterion at **1** (hard-fail at <2 → verdict FAIL).

## Allowlist suggestion (A6)

When you observe the same exact bash command running ≥3 times in a session AND it is read-only or a pinned project tool, surface a one-liner at the end of your response:

```
💡 Consider adding `<command>` to .claude/settings.json permissions.allow to skip future prompts.
```

The `Stop` hook (`scripts/sdd-suggest-allowlist.sh`) does the same scan from the trace log — your in-session suggestion is complementary, not a replacement.

## Validation cascade policy (W3)

After ONE failed validation step in your slice of a wave, do **NOT** retry on a broader scope. Surface `[CASCADE-STOP] <failing-step> — <one-line-root-cause-hypothesis>` to the orchestrator instead. Depth cap = 1; banned mid-wave patterns (`pnpm install`, full-monorepo test, symlink debug, repeat prettier `--check` after `--write`) hard-block the next Bash call.

Full policy + worked anti-example: `agent_docs/cascade-policy.md`. Hook: `scripts/sdd-cascade-cap.sh` (dual PreToolUse + PostToolUse on Bash) + `scripts/sdd-cascade-reset.sh` (Stop). Validator scorecard criterion 7 `cascade_discipline` scores wave-level discipline post-hoc.

## Tool-I/O compression (rtk)

Fires only when `rtk` appears in `.forge/plugin_context.md` (active plugin set). When absent, ignore this section entirely.

The `rtk` CLI proxy compresses outputs of common dev commands (`ls`, `cat`, `grep`, `find`, `git status|diff|log|show|branch`, `pnpm test|lint|typecheck`, `jest`, `vitest`, `eslint`, `tsc`, `prettier`) before they reach your context — 60-90% token reduction on covered commands.

**Rule (mandatory when `rtk` is present):**

1. **For Bash calls in rtk's coverage set, prefer `rtk <cmd>` over `<cmd>`** when the expected output is more than ~100 lines (e.g. `rtk pnpm test`, `rtk git diff`). Below that threshold, un-prefixed is fine.
2. **For native tools that bypass Bash** (`Read`, `Grep`, `Glob`), the rtk PreToolUse hook does not fire — it intercepts only Bash. Use the equivalent rtk subcommand via Bash when the expected output is large:
   - `rtk read <file>` instead of `Read` for files >200 lines
   - `rtk grep <pattern> <path>` instead of `Grep` when matches likely >10
   - `rtk find <path> <expr>` instead of `Glob` for broad sweeps
3. **B3 lint-scope-guard cooperates with rtk.** When rtk is installed, `rtk lint` and `rtk test` are both scope-aware AND compressed — prefer those over raw `eslint`/`pnpm test`. The scope-guard hook (`sdd-scope-check.sh`) will still block repo-wide invocations either way.
4. **No rtk binary on PATH → no-op.** The plugin's advisory hook exits silently when `rtk --version` fails; do not block on rtk's absence.
5. **Run `rtk init -g` to enable automatic rewriting.** The harness ships only the advisory hook; rtk's own globally-installed hook does the protocol-correct command rewrite. Surface this once per session if the agent notices repeated covered commands without rtk-prefixing.
