# /sdd Mode 4 — Analyze, explore, research and condense

> Read this file (explicit `Read` call) when the user selects Mode 4 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

You need information, not code: a codebase question, run-log triage, bug exploration, library evaluation, or any research topic.

## Input

- codebase question
- run logs
- bug description
- research topic

## Skill invoked

`forge:research` — see `skills/forge-research/SKILL.md`.

## Output

- `openspec/changes/<change-name>/research.md` (when tied to a change-name)
- Engram observations under `topic_key=research/<topic-slug>` (always)

## Flow

```
you → researcher → research.md + Engram persistence → report
```

## Approval gates

- ❓ clarification — when scope or topic is unclear
- ✅ MANUAL TEST — **none** (research output is the deliverable)

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need similar_issue` (look for prior research on the same topic — extend instead of duplicate)
- `--topic-prefix research/<topic-slug>`

## Post-research

Issue `/compact` after the research wave completes — research outputs are now in `research.md` + Engram. NEVER mid-wave. See `agent_docs/context-hygiene.md`.

## Examples

```
USER: /sdd 4 "Survey OAuth2 PKCE flow alternatives for SPAs in 2026"
forge:research → researcher → research.md with cited sources → Engram(research/oauth2-pkce-spa-2026) → report
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at this natural boundary in Mode 4 flow (research-only):

- **research-wave-end**: research output is on disk (`research.md`) and in Engram (`research/<topic-slug>`). The multi-hop trail of file reads / web fetches / `mem_get_observation` results does not need to stay in context.

Never compact mid-research. See `agent_docs/context-hygiene.md` for the shared rationale (global `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75` is the reactive fallback; this is proactive).
