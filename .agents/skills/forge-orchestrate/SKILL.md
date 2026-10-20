---
name: forge:orchestrate
version: 3.1.0
description: >
  Decomposes an approved tasks.md into dependency waves, dispatches sub-agents
  per wave with minimal context envelopes, and coordinates handoffs via Engram
  topic_key=handoff/<change>/<from>-to-<to>. Use this skill whenever the
  orchestrator is processing an approved tasks.md with three or more tasks,
  or whenever the user says "orchestrate", "dispatch", "coordinar agentes",
  "ejecutar en paralelo". Always invoked from the main session — sub-agents
  cannot spawn it. Do NOT use for trivial single-task changes (dispatch
  directly), do NOT use without an approved plan, and do NOT use as a
  substitute for forge:implement (it coordinates implement, it does not
  replace it).
triggers: ["orchestrate", "orquestar", "dispatch", "coordinar agentes", "ejecutar en paralelo", "run all"]
layer: 2
wraps: null
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:orchestrate

The meta-skill that coordinates the implementation phase. Reads `tasks.md`, builds the dependency DAG, and dispatches isolated task execution per wave with maximum practical parallelism.

## One-shot example (3-domain feature, 2 waves)

```
USER: /sdd 2 "Add notification preferences end-to-end"  (after planner approval)

forge:orchestrate (main session)
  ├─ read tasks.md → 9 tasks across 3 owners
  ├─ build DAG:
  │     Wave 1: 1.1 (db migration), 2.1 (backend prefs API), 3.1 (FE settings page scaffold)
  │     Wave 2: 1.2 (db backfill test), 2.2 (BE tests), 3.2 (FE wire to BE), 3.3 (FE tests)
  │     Dependencies: 2.1 needs 1.1; 3.2 needs 2.1; 3.3 needs 3.2
  │
  ├─ Wave 1 — parallel:
  │     Agent(database, tasks=[1.1])
  │     Agent(backend,  tasks=[2.1])
  │     Agent(frontend, tasks=[3.1])
  ├─ wait → all green → Agent(agent-sync) upserts state/wave/<change>/1
  │
  ├─ Wave 2 — parallel where allowed (3.2 sequential after 2.1; 3.3 after 3.2):
  │     Agent(database, tasks=[1.2])
  │     Agent(backend,  tasks=[2.2])
  │     Agent(frontend, tasks=[3.2])  → then [3.3]
  ├─ wait → Agent(agent-sync) upserts state/wave/<change>/2
  │
  ├─ Agent(tester-back) + Agent(tester-front) (parallel)
  ├─ Agent(github-ops, commit_phase=impl)
  ├─ Agent(validator) → C5 scorecard
  ├─ ✅ MANUAL TEST GATE
  └─ continue with test/archive commit checkpoints
```

## Flow

```
Read tasks.md + handoff.md
        │
Execution readiness check
(Engram session/gate, runtime, isolation mode)
        │
Build DAG from tasks.md Dependencies field
        │
Planning-approved checkpoint
        │
┌─────┼─────┐
│     │     │
A     B     C ← independent tasks: parallel isolated execution
│     │     │
done  done  │
      │     │
      D ← depends on B: waits, then dispatches
      │
Wave checkpoint + agent-sync upserts state/wave/<change>/<N>
      │
Pre-verify checkpoint
      │
forge:verify (isolated reviewer)
      │
Post-verify checkpoint
```

1. **Pre-flight: verify change folder is complete**
   - [ ] Change folder name is kebab-case (`verb-scope-outcome`); reject numeric names.
   - [ ] `proposal.md`, `design.md`, `tasks.md` exist and are non-empty.
   - [ ] Every task carries: `Change`, `Wave`, `Spec`, `Stories`, `Owner profile`, `Dependencies`, `Definition of done`, `Verification gate`.

2. **Parse approved execution inputs** — read `tasks.md` and `handoff.md` (if present).

3. **Check readiness via Engram**
   - `mem_search topic_key:gate/plan-approved/<change-name>` — confirm the 📋 gate is recorded.
   - `mem_search topic_prefix:state/wave/<change>` — restore prior progress on resume.
   - `mem_search topic_key:project/memory` — confirm brownfield bootstrap (offer minimal init if missing).
   - Determine whether the runtime supports true sub-agents or requires logical isolation.

4. **Build dependency DAG** from each task's `Dependencies` field. Tasks with no unmet dependencies form the next wave.

5. **Planning-approved checkpoint** — confirm scope, isolation mode, and wave plan.

6. **Dispatch wave 1** — all tasks with no unmet dependencies, in parallel. Each sub-agent receives the **minimal context envelope** (see below).

7. **Monitor completion** — as each isolated task finishes, mark `[x]` in `tasks.md` and evaluate the next wave.

8. **Wave checkpoint** — at end of every wave, dispatch `agent-sync` to:
   - Upsert `mem_save topic_key=state/wave/<change-name>/<N>` with task list, blockers, files modified.
   - Write inter-agent envelopes: `mem_save topic_key=handoff/<change>/<from-agent>-to-<to-agent>`.
   - Multi-repo: aggregate via `bash scripts/engram-cross-project.sh state/wave <repo1> <repo2>` and save `state/wave/<change>/aggregate`.

9. **Dispatch subsequent waves** — tasks whose dependencies are now satisfied.

10. **Pre-verify checkpoint** — summarize completed scope, touched areas, known risks, verification priorities.

11. **Final verification** — dispatch `forge:verify` as isolated review.

12. **Post-verify checkpoint** — record pass/fail outcome, remediation path if needed, and archive-readiness.

13. **Report** per the Reporting Protocol below.

## Reporting protocol

Every skill invocation and sub-agent dispatch MUST be reported explicitly. This is non-negotiable across all `forge:*` skills.

### On skill invocation
```
[forge:<skill>] Starting — <purpose>
  MCP tools: <list>
  Context: <files/specs loaded>
```

### On sub-agent dispatch
```
[SUB-AGENT] Dispatching "<agent-description>"
  Task: <task from tasks.md>
  Profile: <frontend | backend | database | …>
  Tools: <mcp + native>
  Isolation: <true-subagent | logical-isolation | inline>
  Files in context: <count>
```

### On sub-agent completion
```
[SUB-AGENT] Completed "<agent-description>"
  Status: <success | failed>
  Files modified: <list>
  Tests: <passed/failed count>
  Engram saves: <topic_keys touched>
```

### On wave completion
```
[ORCHESTRATE] Wave <N> complete
  Tasks done: <list>
  Next wave: <list>
  Progress: <N/M> (<%>)
  Engram state: state/wave/<change>/<N>
  Open risks: <list>
  Recommended commit: <yes/no + reason>
```

### On skill completion
```
[forge:<skill>] Complete
  Summary: <one-line result>
  Artifacts: <files created/modified>
  Next recommended: <next skill>
```

## Context budgeting (briefing cards pattern)

Each isolated task execution receives a **minimal context envelope**. The orchestrator MUST resolve memory cards ONCE per dispatch via the memory governor, not let each subagent search independently.

### Memory card resolution

Before dispatching a subagent for a task, the orchestrator runs:

```bash
bash scripts/sdd-memory-governor.sh \
  --need <classification> \
  --topic-prefix <relevant-prefix> \
  --limit 3 \
  --max-tokens 1200
```

Classifications:

| Task type | `--need` value | `--topic-prefix` |
|---|---|---|
| Plan a new feature | `architecture_decision` | `spec/<change>` + `<domain>/<feature>` |
| Implement from spec | `recent_session` | `state/wave/<change>` + `handoff/<change>` |
| Bugfix | `similar_issue` | `<domain>/<feature>/bugfix` |
| Frontend task with backend contract dependency | `recent_session` | `contract/` |
| Validator pass | `recent_session` | `verify/` + `spec/<change>` |
| Trivial / format-only | `none` | — (skip Engram entirely) |

### Dispatch envelope (W4 — `goal` + `already_read_files` mandatory)

```yaml
goal: "<≤25 words: scope of THIS dispatch in one line>"          # W4 mandatory
task: "specific task from tasks.md"
already_read_files:                                              # W4 mandatory (may be [])
  - "openspec/changes/<change>/tasks.md"
  - "openspec/changes/<change>/design.md"
handoff: "openspec/changes/<current>/handoff.md (if present)"
specs: ["only relevant spec sections"]
files: ["only files this task reads/modifies"]
mcp: ["context7", "engram", "figma (frontend only when frontend_paths set)"]
engram_context:
  - id: <obs_id>
    topic_key: <ns>/<scope>
    title: "<title>"
    preview: "<≤180 chars>"
  # 0-3 cards max, 1200 token ceiling
```

**W4 motivation**: SWE-Pruner research showed explicit `goal` cuts subagent token use 23-54% with higher success rate. Worst-trace evidence (`019e6697-5d07-7225-963f-fe75054fc4fb`) had `tasks.md` re-read 5× and `UsersListCard.tsx` re-read 4× across the trace tree — `already_read_files` eliminates those re-reads. Subagents that re-Read a path declared in `already_read_files` get scored down in `verification_gates` (criterion 6).

### Subagent contract

Subagents receiving `engram_context: [...]` MUST NOT call `mem_search` on start. They may save (`mem_save`) discoveries normally. Only if a NEW domain emerges (not covered by cards) may they search — and only within their declared `memory_namespaces`.

Mechanical subagents (validator, tester-*, github-ops, agent-sync) are save-only and never search regardless of cards (per W4 frontmatter change).

When present, `handoff.md` is the first execution bridge document — keeps global context compact without copying the planning record into every isolated execution.

## Multi-repo coordination

When `MULTI_REPO=true` (per `openspec/config.yaml`) — `Read agent_docs/multi-repo.md` before the first cross-repo dispatch:

- Refuse member dispatch unless preflight reported `MEMBER_CONTEXT=ok` for that repo. On `missing(<repos>)` surface: "The repo `<key>` doesn't have its Forge context yet, so agents working there would be blind. Install the harness in it and run bootstrap Mode 6b first — nothing is dispatched until then."
- Save the dispatch matrix: `mem_save topic_key=coordination/<change-name>` with `{ repo: [waves] }`.
- Dispatch one teammate per implementation repo (parallel), **cwd = that repo's root**; envelope carries `repo: <key>` + `cwd:` + briefing cards (resolve with `--repo <key>` on the governor) — never member instruction-file content, and always restating hard restrictions.
- Cross-repo dependencies: e.g., frontend waits on backend contract. Frontend teammate runs `bash scripts/engram-cross-project.sh contract/ <backend-repo>` and polls up to the `wave_policy` budget (`contract_poll_attempts` × `contract_poll_interval_s`, defaults 10 × 30s). On exhaustion the teammate returns `BLOCKED [CONTRACT] missing: contract/<endpoint-slug>` — route it through the cycle counter, never re-poll blindly.
- agent-sync (per repo) upserts `state/wave/<change>/<N>`. The coordination repo's agent-sync aggregates into `state/wave/<change>/aggregate` and runs `bash scripts/sdd-context-drift.sh --repo <key>` per touched member; on `CONTEXT_DRIFT=<key>` re-render that member's audit → 📋 re-gate → agent-prep refresh.

## Session resilience

Wave state lives in Engram as upserts under `state/wave/<change-name>/<N>`. On session resume:

1. `mem_search topic_prefix:state/wave/<change-name>` — pull all wave states.
2. Determine the latest wave with status `done`; resume from the next.
3. Report to user: "Resuming from Wave N — [status summary]".

### Post-compaction recall checklist (mandatory)

After any `/compact` (auto or manual), only the project-root CLAUDE.md is
re-injected — dispatch rules and the active mode doc are GONE from context.
Before the next dispatch:

1. `Read .claude/rules/orchestrator-dispatch.md` (or `rules/orchestrator-dispatch.md` in the install layout).
2. `Read` the active mode's detail doc (`agent_docs/sdd-modes/mode-<N>-*.md`).
3. `mem_context` (orchestrator-only, post-compaction is an allowed trigger) to recover session state.
4. Multi-repo: re-check the preflight `MEMBER_CONTEXT` line before dispatching into members.

## Escalation policy

- Task fails once → retry with adjusted context.
- Task fails twice → escalate to user with full error context from both attempts.
- Never retry a third time automatically.
- If repeated failure suggests spec drift, stop and return to `forge:propose` for revision.

## Agent dispatch constraint (Claude Code platform limit)

Sub-agents CANNOT spawn sub-agents. The Agent tool is only available to the main session (you).
All dispatch in this skill MUST be from you (main session) directly to implementation agents.

Dispatch chain: you (main session) → {planner, researcher, synthesizer, frontend, backend, database, tester-front, tester-back, github-ops, validator, agent-sync, agent-prep, devstart, bugfix-pr}

Every Agent() call must include the dispatch template from `.claude/rules/orchestrator-dispatch.md` to ensure sub-agents work in isolation without attempting further delegation.

## Synthesizer dispatch (v3 W6)

Before passing raw research outputs to the planner, evaluate the synthesizer dispatch condition. Read thresholds from `.forge/config.json → wave_policy`:

```
SYNTH_MIN_EXPLORES        = wave_policy.synth_min_explores        (default 2)
SYNTH_RAW_TOKEN_THRESHOLD = wave_policy.synth_raw_token_threshold (default 3000)

if n_explores >= SYNTH_MIN_EXPLORES  OR  sum_raw_tokens > SYNTH_RAW_TOKEN_THRESHOLD:
    Agent(synthesizer, inputs=[<concatenated, source-tagged raw outputs>])
    → use synthesizer.findings as planner input
else:
    → pass raw outputs straight to planner
```

The synthesizer never plans, edits, or implements. It dedups, reconciles, drops findings without evidence, and promotes high-confidence discoveries to Engram Tier 2. See `skills/forge-synth/SKILL.md`.

## Tool routing (v3 W7)

Every wave dispatch computes an **effective tool set** per agent:

```
requested = plan.waves[N].required_tools.per_agent[<agent>]   (from approved plan, W5 V4)
denied    = .forge/config.json → agent_denylist[<agent>]     (architectural safety net)
effective = subtract(requested, denied)
```

Inject `effective` into the agent's dispatch envelope. Hard rules:

- **Plan must declare `required_tools.per_agent`** for every dispatched agent. If missing, `forge:propose` V4 already blocked the gate — this is a belt-and-braces check.
- **Deny-list is negative and architectural** — it expresses "this role can never reasonably need X" (e.g. `tester-back` never needs `figma`). Plans cannot override deny-list. If a plan requests a denied tool, log a warning and strip it without failing dispatch.
- **No tool injection from outside the plan + config**. Orchestrator never silently grants extra tools at runtime.

Pseudocode the orchestrator runs per dispatch:

```python
def dispatch_with_tools(agent_name, plan, wave_num, config):
    requested = (plan.waves[wave_num]
                     .required_tools
                     .per_agent
                     .get(agent_name, {"mcp": [], "skills": []}))
    denied = config.agent_denylist.get(agent_name, {"mcp": [], "tools": []})

    effective_mcp    = [t for t in requested.get("mcp", [])    if t not in denied.get("mcp", [])]
    effective_skills = list(requested.get("skills", []))  # skills not currently deny-listed
    # On Claude Code, Tool Search auto-activates once MCPs cross ~10% of context;
    # this contract is what the search filters down against.
    return Agent(agent_name, mcp=effective_mcp, skills=effective_skills, ...)
```

OpenCode uses the hybrid model: `.opencode/agents/<name>.md` carries the SUPERSET in `tools:` / `mcp:` (defense against #12566), and the orchestrator's dispatch prompt limits the ACTIVE subset for that invocation. See `agents/claude/*.md` frontmatter for the source of truth on supersets.

Schema reference: `schemas/plan.schema.json` → `required_tools` block. Deny-list reference: `templates/forge/config.json` → `agent_denylist`.

## When to use

- Multi-task changes where parallelism matters (≥3 tasks).
- Complex features spanning multiple files/modules.
- Multi-repo changes.
- When you want hands-off execution of an approved spec.

## When NOT to use

- Single-task changes — use `forge:implement` directly.
- Exploration phase — use `forge:explore`.
- As a substitute for `forge:implement` — orchestrate coordinates implement, doesn't replace it.

## Next step

After orchestration completes (including verification), proceed to `opsx:archive`. agent-sync soft-deletes stale `state/*` and `handoff/*` topics post-archive.

<!-- forge:skill:forge-orchestrate:3.0.0 -->
