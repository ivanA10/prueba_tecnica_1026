---
name: forge:research
version: 2.0.0
description: >
  Performs multi-hop research with web sources, library documentation via
  context7, and persists findings to Engram under topic_key=research/<slug>.
  Use this skill whenever the user asks to "research", "compare", "investigate
  options", "find best practice", "investigar opciones", "comparar A vs B",
  or whenever the planner blocks on unknowns before proposing a spec. Outputs
  a research.md and saves an upsertable Engram entry. Do NOT use for codebase
  exploration of an existing repo (use forge:explore) or for spec creation
  (use forge:propose after research is complete).
triggers: ["research", "investigar a fondo", "deep dive", "buscar", "compare", "comparar"]
layer: 2
wraps: null
mcp_dependencies: [engram, context7]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:research

Deep multi-hop investigation for unknowns. Persists findings to Engram so future agents pick them up automatically. Standalone skill — does not wrap an OpenSpec command.

## One-shot example

```
USER: /sdd 4 "Compare cookie-based auth vs OAuth2 PKCE for our SaaS — which fits our compliance + multi-tenant needs?"

forge:research
  ├─ mem_search topic_prefix:research/   (miss for "auth-pkce-vs-cookie")
  ├─ decompose: { compliance, multi-tenant isolation, mobile clients, refresh strategy, library support }
  ├─ parallel context7 + WebSearch per sub-question (5 hops)
  ├─ write openspec/changes/<active>/research.md (3-section: findings / sources / recommendation)
  └─ mem_save topic_key=research/auth-pkce-vs-cookie {summary, recommendation, sources[], anti_patterns[]}

Next: planner reads research.md → drafts proposal.md.
```

## Flow

1. **Pre-search Engram** — `mem_search topic_prefix:research/`. If a related slug exists and is recent, decide: extend (revise body, increment revision_count) or supplement (new sub-topic).
2. **Read project-stack** in AGENTS.md — library queries must be version-correct.
3. **Plan** — decompose the question into 3–5 sub-questions.
4. **Parallel search** per sub-question:
   - `context7:resolve-library-id` → `context7:get-library-docs` for library-specific answers.
   - `WebSearch` for web results (vendor docs, RFCs, primary blog posts).
   - `WebFetch` to pull a specific URL when WebSearch surfaces it.
5. **Cross-check** — every claim survives at least two independent sources. Conflicts reported, not suppressed.
6. **Synthesize** with confidence levels (high / medium / low).
7. **Write report** — `openspec/changes/<current>/research.md` (when tied to a change) with explicit sections per sub-question, sources cited inline, anti-patterns called out.
8. **Persist to Engram** — `mem_save topic_key=research/<topic-slug>` with the full write-up. Use kebab-case slug. Pass `revision_count` for upserts when extending prior research.

## Evidence rules

- Track sources for every claim — no unsourced facts.
- Note confidence level (high / medium / low) per finding.
- Flag contradictions explicitly.
- Prefer primary sources (official docs via context7, RFCs, vendor blog) over secondary.

## Engram graceful degradation

If Engram is unreachable: continue, save to `research.md` only, emit `[MEMORY] WARNING`.

## When to use

- The exploration phase revealed significant unknowns.
- Technical decisions need evidence (libraries, patterns, version choices).
- Compliance or security questions need documented answers.
- Any time you'd otherwise guess — research instead.

## Next step

`forge:propose` with evidence-backed decisions.

<!-- forge:skill:forge-research:3.0.0 -->
