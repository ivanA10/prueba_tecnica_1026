# Memory Budget — Engram retrieval discipline

> Read this file (explicit `Read` call) when applying the memory retrieval ladder or classifying `memory_need` for a dispatch — referenced from `rules/agent-common.md` and `rules/orchestrator-dispatch.md`; it never auto-loads.
> Source of truth for per-turn Engram limits.

## Retrieval ladder (mandatory)

| Layer | Tool | When | Cost |
|---|---|---|---|
| L1 | `mem_search` with `limit≤3`, snippets only | Default for any contextual lookup | ~100 tokens/result |
| L2 | `mem_timeline observation_id=<id>` | When neighbors of a specific observation matter | ~300-600 tokens |
| L3 | `mem_get_observation id=<id>` | Only when exact untruncated body required AND L1 confidence ≥ high | 500-2000+ tokens |

**Rule.** Never jump to L3 without first reading L1 results. L3 fetched bodies must be summarized into a memory card if the subagent needs to carry the info downstream; the raw L3 response should not be passed verbatim across waves.

## Per-turn budget (orchestrator-enforced)

| Limit | Value | Enforced by |
|---|---|---|
| `max_search_calls` | 2 | `scripts/sdd-memory-budget.sh` PreToolUse hook |
| `max_full_fetches` (L3) | 1 | hook |
| `max_memory_tokens_injected` | 1200 | governor (W3) |
| `max_save_calls_per_turn` | 2 | hook (warn only — saves are durable) |
| `allow_mem_context` | false by default | overridden only on `post_compact` or explicit user recall |

## Memory needs classification

Before any Engram call, classify the task:

| memory_need | Triggers | Recommended action |
|---|---|---|
| `none` | trivial edit, format-only, single-regex fix, dependency version lookup | Skip Engram entirely |
| `recent_session` | "what did we decide", "continue with", "where did we leave off" | L1 search on `session/` and `state/wave/` |
| `similar_issue` | recurring bug, "we had this before" | L1 search on relevant domain namespace |
| `architecture_decision` | new feature, design review, ADR-worthy | L1 search on `spec/` and `<domain>/<feature>/decision` |
| `continuation` | session resume after compaction | `mem_context` allowed (only path that allows it) |
| `explicit_user_recall` | "remember when", "what do you know about" | L1 search broad |

## Save discipline (deltas only)

Save ONLY:
- decision (architecture, ADR, design alternative discarded)
- bugfix (with root cause + fix description)
- pattern (recurring approach worth reusing)
- preference (user/team convention)
- constraint (NFR, compliance, integration boundary)
- session_summary (orchestrator only, at PreCompact + SessionEnd)

Never save:
- raw transcripts
- obvious step-by-step (e.g., "edited 3 files")
- duplicate observations (use `topic_key` upsert)
- tool noise (raw command output)

## `mem_context` policy

`mem_context` is the heaviest tool — it returns session-relevant context potentially across all namespaces. Default = forbidden. Allowed ONLY in:

1. **Post-compaction recovery** — orchestrator's first action after `/compact` if `session/<change>` topic exists.
2. **Explicit user recall** — user message contains "recordar todo", "all context", "full memory" or equivalent.
3. **Session resume** — first dispatch of a wave on a session where `state/wave/<change>/<N>` exists for prior N.

Outside these three cases, use `mem_search` with explicit topic_prefix.

## Subagent retrieval rule

Subagents must NOT call `mem_search` on session start unless their body declares `Engram access tier: search-capable` (see W5). The orchestrator passes memory cards in the dispatch briefing (see `forge:orchestrate` § Context budgeting). Subagents may search ONLY if they discover a new domain need not covered by the briefing.

Mechanical subagents (validator, tester-front, tester-back, github-ops, agent-sync) are **save-only** — their MCP allowlist excludes `mem_search` entirely.

## See also

- `schemas/memory-topics.md` — namespace contract
- `rules/agent-common.md` — Engram protocol (operational)
- `rules/orchestrator-dispatch.md` § Memory — orchestrator-owned retrieval
- `skills/forge-orchestrate/SKILL.md` § Context budgeting — briefing cards
