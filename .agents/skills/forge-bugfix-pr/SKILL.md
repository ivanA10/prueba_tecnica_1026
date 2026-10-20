---
name: forge:bugfix-pr
version: 1.0.0
description: >
  Wraps the bugfix-pr agent in two modes — post-PR (default, Mode 7)
  comments on a PR with classified Codacy + Copilot review findings;
  pre-flight (auto-dispatched by github-ops) blocks PR creation when
  Codacy critical issues are present in the local diff. Routes fixes
  through the correct domain agent (frontend / backend / database).
triggers: ["bugfix-pr", "pr-review", "codacy", "copilot review", "fix pr comments"]
layer: 2
wraps: bugfix-pr agent
phase: post-implementation
applies-to: bugfix-pr, github-ops, orchestrator
mcp_dependencies: [engram]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:bugfix-pr

## One-shot example

```
USER: /sdd 7 https://github.com/forge-cloud/admin-portal/pull/482

bugfix-pr (post-pr) → fetches PR + Codacy report
  → classifies 6 findings: 1 critical, 2 errors, 3 warnings
  → posts PR comment:
       | sev | file                             | line | suggested fix       | route to |
       |-----|----------------------------------|------|---------------------|----------|
       | 🔴  | src/auth/jwt.ts                  | 42   | clear secret on err | backend  |
       | 🟠  | src/components/UserMenu.tsx      | 17   | add aria-label      | frontend |
       | ... |                                  |      |                     |          |
  → mem_save pr/<change>/bugfix-findings
  → orchestrator dispatches: backend (1), frontend (2), database (0)
```

## Two modes

### Mode A — `post-pr` (default, Mode 7)

User invokes `/sdd 7 <PR-url>` or `/sdd 7 --latest`. Orchestrator dispatches:

```
Agent(bugfix-pr, mode=post-pr, pr=<url>, change=<resolved-change-name>)
```

bugfix-pr fetches the PR's Copilot reviews + Codacy report, classifies findings, posts a single summary comment, and writes `pr/<change>/bugfix-findings` to Engram. Orchestrator then dispatches per-domain fix agents based on the dispatch plan in the comment.

### Mode B — `pre-flight` (auto-dispatched)

Triggered by github-ops between `git push` and `gh pr create`:

```
Agent(bugfix-pr, mode=pre-flight, change=<change-name>)
```

bugfix-pr runs Codacy (or project-stack lint as fallback) on the local diff. If `severity: critical` is present:
- Writes `pr/<change>/preflight-block` to Engram.
- Returns `{ block: true, criticals: [...] }`.
- github-ops aborts PR creation.

When critical issues are resolved (in a subsequent commit), the next github-ops `pre_flight_check` returns `{ block: false }` and PR opens normally.

## Outputs

| Engram topic | When | Payload |
|---|---|---|
| `pr/<change>/bugfix-findings` | post-PR | `{mode, pr, findings, summary: {critical, error, warning, info}}` |
| `pr/<change>/preflight-block` | pre-flight (only if criticals) | `{criticals: [...], blocking_files: [...]}` |

## Acceptance

- post-PR comment lands within 60s of dispatch with a summary table + per-file findings.
- pre-flight returns `{ block: true }` on injected Codacy critical; `{ block: false }` once resolved.
- Findings classified by domain so the orchestrator routes to the correct fix agent.

<!-- forge:skill:forge-bugfix-pr:3.0.0 -->
