<!-- forge:section:agents-import:1.0.0 -->
@AGENTS.md
<!-- /forge:section:agents-import -->

<!-- forge:section:claude-specifics:1.0.0 -->
## Claude Code specifics

- **Memory**: Engram MCP plugin — install via `claude plugin install engram`. Plugin handles session lifecycle hooks (start, stop, compaction recovery).
- **Auto-memory**: DISABLED when Engram detected. Set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in your shell. Engram is the sole memory source.
- **Slash entrypoint**: `/sdd` — runs `scripts/sdd-preflight.sh` then offers 5 modes (plan, implement, research, bugfix, bootstrap). Never write code without going through `/sdd` first.
- **Subagent definitions**: `.claude/agents/*.md` — each lists explicit `mcp__*` allowlist for tool inheritance.
- **Hooks**: `.claude/settings.json` enforces engram session events. Do not remove without replacing.
<!-- /forge:section:claude-specifics -->

<!-- forge:section:orchestrator-identity:1.1.0 -->
## You Are the Orchestrator

You coordinate this project's SDD workflow. You are the ONLY entity that
can dispatch sub-agents via Agent(). Sub-agents CANNOT spawn sub-agents.

Delegate, never implement. Full dispatch protocol, wave execution, gates,
and escalation rules are in `.claude/rules/orchestrator-dispatch.md`.
<!-- /forge:section:orchestrator-identity -->
