---
name: forge:explore
version: 2.0.0
description: >
  Investigates the problem space before any spec is written, enriching opsx:explore
  with context7 library docs, web research, and Engram brownfield project memory.
  Use this skill whenever the user says "explore", "investigate", "what about",
  "qué hay sobre", "investigar", or starts a non-trivial change in a brownfield
  repository. Always use it as the first step on any feature in a repo with
  existing code — it seeds the project memory other agents rely on. Do NOT use
  for trivial bug fixes (use bugfix mode), pure research questions without
  implementation intent (use forge:research), or greenfield bootstrap
  (use forge:kickstart).
triggers: ["explore", "investigar", "what about", "qué hay sobre", "investigate"]
layer: 2
wraps: opsx:explore
mcp_dependencies: [engram, context7]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:explore

Enriches OpenSpec's native `opsx:explore` with live documentation, web research, and Engram-backed project memory. Run before any spec is written.

## One-shot example

```
USER: /sdd 4 "Explore the auth surface — providers used, session store, token rotation"

forge:explore
  ├─ mem_search topic_key=project/memory   (miss → seed)
  ├─ Glob src/auth/** → 14 files
  ├─ Grep "jwt.sign|jwt.verify"  → 3 hits
  ├─ Read 3 most-relevant files (cap)
  ├─ context7:get-library-docs jsonwebtoken (current 9.0.2)
  └─ mem_save topic_key=project/memory {
        auth_provider: "Auth0 + custom JWT",
        session_store: "Redis 24h TTL",
        token_rotation: "absent (HIGH RISK note)",
        files: [...]
     }

Output: bullet summary + Engram entry. No code modified.
```

## Flow

1. **Detect context** — read `openspec/specs/` and `AGENTS.md` (the project-stack section in particular).
2. **Brownfield detection via Engram** — `mem_search topic_key:project/memory`.
   - **Hit + recent**: use it as the baseline. Validate against current files; if the codebase signature has shifted, supplement (don't replace).
   - **Miss**: scan key files (README, manifest, architecture docs, main modules) and **upsert** via `mem_save topic_key=project/memory` with the schema below. In monorepos, also write `mem_save topic_key=workspace/<pkg>/memory` per detected workspace.
3. **Identify libraries** relevant to the exploration topic from the project-stack and code.
4. **Fetch current docs** via `context7:resolve-library-id` → `context7:get-library-docs` for each library.
5. **Web research** (if needed) — `WebSearch` for external context, patterns, prior art.
6. **Delegate to OpenSpec** — execute `opsx:explore` with the enriched context.
7. **Persist findings** — append to `openspec/changes/<current>/research.md` if a change folder exists; otherwise save standalone topics under `research/<topic-slug>` in Engram.

## Brownfield project memory schema

`mem_save topic_key=project/memory` body:

```json
{
  "project_name": "...",
  "tech_stack": ["..."],
  "architecture_summary": "...",
  "key_modules": ["..."],
  "conventions": ["..."],
  "known_constraints": ["..."],
  "exploration_date": "YYYY-MM-DD"
}
```

Becomes the baseline for:
- `forge:verify` — implementation vs. project norms.
- `opsx:archive` — broad progress and impact relative to the project.

## Engram graceful degradation

If Engram is unreachable: continue and persist findings to `openspec/changes/<current>/research.md` only. Emit `[MEMORY] WARNING — operating without persistence`. Exception: if `.engram/` directory or `engram.db` is present in the repo, BLOCK and surface install instructions (see `agent_docs/engram-install.md`).

## When to use

- Requirements are unclear or ambiguous.
- The task involves unfamiliar libraries or APIs.
- Starting a new feature area with unknown constraints.
- **Brownfield repos**: always run before any feature work to seed `project/memory`.

## Behavior by tool

- **Claude Code**: dispatch as sub-agent via Agent tool; context7 + engram via MCP.
- **Cursor / Copilot / Codex**: follow flow inline; MCPs via configured servers.
- **OpenCode**: skill is read directly from `.claude/skills/forge-explore/SKILL.md`.

## Next step

`forge:research` (deeper investigation) or `forge:propose` (ready to spec).

<!-- forge:skill:forge-explore:3.0.0 -->
