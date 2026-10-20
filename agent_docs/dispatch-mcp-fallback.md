# Dispatch MCP Fallback — Detail

Full graceful-degradation matrix referenced from `rules/orchestrator-dispatch.md`.

## Engram

| Repo state | Binary present | Action |
|---|---|---|
| `.engram/` exists | yes | proceed normally |
| `.engram/` exists | **no** | **BLOCK** — surface install instructions (`agent_docs/engram-install.md`); do not let agents run |
| no `.engram/` | yes | proceed |
| no `.engram/` | no | `[MEMORY] WARNING — operating without persistence`; continue but warn the user that decisions/research won't survive sessions |

When the binary is missing but available locally, the orchestrator must remind the user once: `Set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 — Engram is the sole memory source.`

## context7

If unavailable: fall back to WebSearch + project-stack manifest version. Mark every API claim as `needs-verification` in the resulting code/spec — the validator picks these up.

## figma

Conditional on `frontend_paths` being populated in the Domain Map.

| frontend_paths | figma | Action |
|---|---|---|
| empty | down | silent — figma not needed |
| populated | up | proceed |
| populated | down | flag affected frontend tasks `needs-mockup-review`; continue but warn that more design-to-code iterations are likely |

## playwright (CLI)

If `Test runner` in project-stack is Playwright but `npx playwright` is unavailable: flag e2e tasks `INCOMPLETE` and surface install instructions in the session report.

## agent-browser (D1)

If `agent-browser` not installed: tester-front, validator (manual probes), and Mode 1 simple verification fall back to Playwright CLI silently. Surface a one-line note in the session report: `agent-browser not installed — using Playwright CLI fallback. Install via README → "Browser Tooling".`

## Diagnostic order

In `scripts/sdd-preflight.sh`, MCP fallbacks are surfaced in this order so the user sees the most-blocking issue first:

1. engram BLOCK (BLOCKER)
2. context7 missing (HIGH — affects research and API claims)
3. figma missing + frontend present (MEDIUM)
4. playwright/agent-browser missing (LOW unless Test runner is Playwright)
