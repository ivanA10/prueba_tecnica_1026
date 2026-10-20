# /sdd — Preflight detail

> Read this file (explicit `Read` call) when running `/sdd` preflight presentation — referenced docs never auto-load on any runtime.

## Step 1: Preflight validation

Run `bash scripts/sdd-preflight.sh` from the repo root. Parse stdout lines as KEY=VALUE pairs.

If exit code = 1 (bootstrap missing):
- Only allow Mode 6 / 6b (bootstrap).
- Tell the developer: "This project hasn't been bootstrapped. The agents don't know your stack yet. I'll run bootstrap first."

If exit code = 0 (ready):
- Parse MCP_STATUS lines.
- Report availability to developer (see MCP status report below).
- Proceed to intent classification.

## Step 2: MCP status report

```
╔═══════════════════════════════════════════════════╗
║                   Forge — Ready                   ║
╠═══════════════════════════════════════════════════╣
║ [status] engram              Persistent memory     ║
║ [status] context7            Library docs          ║
║ [status] figma               Design context        ║
║ [status] agent-browser       E2E probing (default) ║
║ [status] playwright (CLI)    Committed test runtime║
╠═══════════════════════════════════════════════════╣
║ [impact message if any MCPs are missing]           ║
╚═══════════════════════════════════════════════════╝
```

Impact messages (full list in `agent_docs/dispatch-mcp-fallback.md`):
- engram BLOCK (`.engram/` present, binary missing): "⛔ BLOCKED: This repo carries Engram chunks but the engram binary is not installed. See agent_docs/engram-install.md."
- engram WARNING (binary missing, no `.engram/` chunks): "⚠️ Memory persistence disabled."
- context7 DOWN: "⚠️ Library API calls will be marked needs-verification."
- figma absent + `frontend_paths` set: "⚠️ Frontend tasks flagged needs-mockup-review."
- agent-browser missing: "⚠️ Falling back to Playwright CLI for E2E probes."
- playwright CLI absent + project-stack `Test runner` is Playwright: "⚠️ e2e tests flagged INCOMPLETE."

If `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is unset and engram is present, surface a one-line reminder to set it.

## Step 3: Intent classification

Ask: **"What do you want to do?"**

### Picker UI constraint (host-tool agnostic)

Some host tools (notably Claude Code's `AskUserQuestion`) hard-cap option pickers at **4 options per question** AND at **4 questions per call** (issue [anthropics/claude-code#12420](https://github.com/anthropics/claude-code/issues/12420)). There are **8 modes total** (Modes 1, 2, 3, 4, 5, 6, 6b, 7) — they will not all fit in a single picker, and neither will the entire mode list fit across the 4-question budget if every mode were its own question.

When presenting modes through a constrained picker, use exactly this paging — it stays inside both caps and reaches every mode in at most 3 questions:

| Page | Slots (≤4) |
|---|---|
| Page 1 (default) | Mode 1, Mode 2, Mode 3, **"Show modes 4–7 →"** |
| Page 2 (on selection of nav) | Mode 4, Mode 5, Mode 6, **"Show modes 6b/7 →"** |
| Page 3 (on selection of nav) | Mode 6b, Mode 7, **"← Back to 1–3"** |

Rules:

1. **Always state the total in the question text** — e.g. "What do you want to do? (8 modes total — showing 1–3; pick 'Show modes 4–7' to see the rest)". Never silently truncate.
2. **Stay within 4 options per question and 3 questions per call** (one budget remaining after the picker for follow-ups like profile/branch flags).
3. **Plain-text fallback is always allowed**: list all 8 modes as a numbered list and accept a number reply. This is the cleanest path when there's no obvious primary candidate, and avoids the picker caps entirely.
4. **If you already know the mode** (PRD attached → Mode 2; PR URL → Mode 7; bug + file → Mode 5; bootstrap missing → Mode 6/6b): skip the picker and confirm the inferred mode with one sentence.

The 8 modes are listed in the router (`commands/sdd.md`). The picker is only a UX shortcut — never the source of truth.
