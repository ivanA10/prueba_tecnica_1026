# Dispatch Escalation — Cycle Counter + Engram Feedback

Detail for `rules/orchestrator-dispatch.md` → escalation. Implements B4.

## Per-(change, agent) cycle counter

Every time the orchestrator dispatches `Agent(<role>, change=<change>)`, it first reads:

```
mem_search topic_key=coordination/<change>/cycle/<role>
```

The result is an integer (default `0`). If `>= 3`, the orchestrator refuses to dispatch and emits:

```
🛑 Cycle limit reached for <role> on <change>. See feedback at coordination/<change>/feedback/<role>.
```

After every `Agent()` failure (validator FAIL, agent reports an error, hook denies the result), the orchestrator runs:

```
mem_save topic_key=coordination/<change>/cycle/<role>  value=<count+1>  upsert=true
mem_save topic_key=coordination/<change>/feedback/<role>  value={attempt, error, last_files, suggested_fix}
```

The `feedback` topic is read by the next dispatch of the same `(change, role)` so the agent receives prior failure context in its briefing.

## Failure ladder

| Attempt | Action |
|---|---|
| 1 | Retry with adjusted context (more files, different approach). |
| 2 | Escalate to user with both attempts' errors batched into one message. |
| 3 | Hard stop. Surface the cycle key and feedback topic; do NOT retry automatically. |

## Spec drift detection

If the same `(change, role)` failure pattern (e.g., "tests reference a column that doesn't exist") repeats, treat as spec drift and return to `forge:propose` to update `design.md` before any further impl. This is a different escalation path from the cycle counter — drift indicates the plan is wrong, not the agent.

## Engram schema additions

Two new topics added to `schemas/memory-topics.md`:

| Namespace | Scope | Subscope | Owner | Purpose |
|---|---|---|---|---|
| `coordination` | `<change-name>` | `cycle/<role>` | orchestrator | Cycle counter integer |
| `coordination` | `<change-name>` | `feedback/<role>` | orchestrator | Last failure payload |
| `gate` | `multi-spec-branch` | `<bundle-name>` | orchestrator | B1 bundle audit |

## Acceptance

- 3rd retry triggers the hard-stop diagnostic above.
- Feedback topic is visible to the next dispatch of the same role on the same change.
- Across changes, a role's cycle counter is independent (no cross-change coupling).
