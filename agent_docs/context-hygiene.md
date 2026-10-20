# Context hygiene — when and why to `/compact`

> Read this file (explicit `Read` call) when deciding whether to issue `/compact`. Detail behind a single decision: when does the
> orchestrator (you, the main session) issue `/compact` instead of letting
> autocompact catch it?

## Why proactive compaction beats autocompact

`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (default `75` in `claude-settings.json`)
fires when context **fills up** — by then the most expensive cache reads have
already happened. Proactive `/compact` fires when context is full of **done
work**: a finished research wave, archived change, memory recall that won't be
referenced again. Same cache flush, fraction of the cost.

This matters most when:

- Engram MCP tool results dominate the session (each `mem_search` returns 5
  300-char previews; each `mem_get_observation` returns full content; both stay
  resident).
- A research / explore phase pulled tens of files that the implementation
  phase doesn't need verbatim.
- A wave finished and the next wave operates on a different file set.
- Subagent fan-out returned long structured outputs you've already digested.

## Triggers (orchestrator-owned)

The triggers below are the **global fallback set** — safe boundaries that apply
regardless of which `/sdd` mode is running. Each mode also has a **refined**
per-mode trigger list under `## Structured compaction triggers (W5)` in
`agent_docs/sdd-modes/mode-*.md`. When the per-mode list is more specific
(e.g. Mode 2's `post-impl-wave-N transition`), prefer it. When you're outside
a mode (manual dispatch, cross-mode work), use the table below.

Issue `/compact` immediately after these events, before the next dispatch:

| Trigger | Reason |
|---|---|
| Research wave complete (Mode 4 output, or pre-plan researcher in Mode 2) | research.md is on disk; the multi-hop trail does not need to stay in context |
| `opsx:archive` complete (Mode 2/3/6/6b) | The change folder + engram sync are committed; the proposal/design/tasks bodies don't need to stay loaded for whatever comes next |
| Validator emitted a PASS scorecard (Modes 2/3/5) | The scorecard is on disk in `.engram/state/verify-<change>.json`; the per-criterion evidence chains can be flushed |
| Before Mode 6 / 6b bootstrap | Bootstrap loads PRD + backlog from scratch — keeping a stale session alive only costs cache |
| Before `/sdd gc` | gc audit doesn't need prior session content |
| After a long `mem_search` + `mem_get_observation` chain that resolved a question | Observation bodies are the heaviest engram tool results |
| Wave N → Wave N+1 transition when the file sets don't overlap | Wave N's reads are sunk cost |

## Anti-triggers (do NOT compact)

- Mid-wave (you'd lose the wave's in-flight state)
- Before the ✅ manual-test gate (validator evidence needs to stay legible to the human reviewer)
- While a subagent is still active
- During planner / proposal / design generation (these reference research output)
- Immediately after compaction (re-warming cost > savings)

## Signals from the host

Most host tools surface a context-percent meter. As a rough heuristic:

- **< 50%**: don't compact — overhead exceeds savings.
- **50-75%**: compact only at a natural trigger above.
- **> 75%**: compact at the next safe point (between waves, before next dispatch). Autocompact will fire anyway at 75% per `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.

## After compaction

Per the memory protocol (`templates/AGENTS.md` → Session lifecycle):

1. Call `mem_session_summary` to checkpoint the session state.
2. Call `mem_context` to pull the latest project context back.
3. Resume the dispatch chain.

The Engram plugin's session-lifecycle hooks handle steps 1-2 automatically when the engram plugin is wired (`--plugins engram`). On a session without engram, do them manually.

## Cost intuition

A session that hits autocompact at 80% of a 200k context window is paying for
~160k tokens of warm cache reads on every subsequent turn until compaction. A
proactive `/compact` at the 50% mark after a finished research wave flushes
~100k tokens of "done" context for the price of one re-warm — net savings
scale with how many turns remain in the session.

The optimization is **not free**: each `/compact` costs one full cache rebuild
on the next turn. So compact when there's enough session ahead to amortize the
rebuild (≥ 5 more turns, rule of thumb). For one-shot fixes, skip it.
