# Engram install + plugin + verification + troubleshooting

> Loaded by `scripts/sdd-preflight.sh` when Engram is missing **and** `.engram/` files
> are detected (BLOCK condition), or when the user asks "how do I install Engram?".

## One-time install (per OS)

| OS | Command |
|----|---------|
| macOS | `brew install gentleman-programming/tap/engram` |
| Linux | `go install github.com/Gentleman-Programming/engram/cmd/engram@latest` (requires Go 1.22+) |
| Windows | Download `engram-windows-amd64.exe` from https://github.com/Gentleman-Programming/engram/releases — add the parent dir to `PATH` |

Verify the binary:

```bash
engram version
```

## Claude Code plugin

```bash
claude plugin marketplace add Gentleman-Programming/engram
claude plugin install engram
```

Add to your shell rc (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
```

This disables Claude Code's auto-memory so Engram is the sole memory source.

Restart your Claude Code session and run:

```bash
claude mcp list
# expect: engram (running) — http://127.0.0.1:7437
```

## OpenCode setup

```bash
engram setup opencode
```

This writes the MCP config into your OpenCode settings. Restart OpenCode and run `/mcp` to confirm `engram` appears.

## Server health

The plugin auto-starts a local server. Verify:

```bash
curl -sf http://127.0.0.1:7437/health
# expect: {"status":"ok"}
```

If you prefer to run the server manually (long-lived background process):

```bash
engram serve --port 7437 &
```

## Multi-repo / monorepo override

By default Engram derives the project name from the git remote slug. To use a different name (per-shell, per-workspace):

```bash
export ENGRAM_PROJECT=my-workspace-name
```

Apply this when entering a monorepo workspace where you want isolated memory per package.

## Sync — making memories portable

Engram captures memories in your **local** DB at `~/.engram/engram.db`. To make those memories portable (committable with a PR, available to teammates), they must be exported to a per-repo `.engram/` chunk.

The orchestrator (main session) is responsible for triggering this — typically right after `opsx:archive`. See `.claude/rules/orchestrator-dispatch.md` → "Memory Sync".

### Manual workflow

```bash
engram sync --status           # see what's pending for this project
engram sync                    # export new memories to .engram/<chunk>.json.gz
git add .engram/
git commit -m "chore(engram): sync memories for <change-name>"
```

### Pulling teammates' memories

```bash
git pull                       # pulls new .engram/ chunks
engram sync --import           # imports new chunks into your local DB
```

### Multi-repo

Each repo's orchestrator runs `engram sync` independently. Teammates run `engram sync --import` in their own repo to pull each other's chunks. Cross-project queries (`scripts/engram-cross-project.sh`) read across repo namespaces from the same local DB.

### What NOT to do

- `engram sync --all` exports **every** project in your global DB — leaks unrelated work into `.engram/`. Avoid in project repos.
- Do not commit `~/.engram/engram.db` (that's your global DB). Only commit per-repo `.engram/<chunk>.json.gz` files.
- Do not delete `.engram/` after sync — those chunks are the source of truth for cross-session continuity.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `engram: command not found` | Binary not on PATH | macOS: `brew install ...`. Linux: ensure `$GOPATH/bin` is in PATH. Windows: add the install dir. |
| `claude mcp list` doesn't show engram | Plugin install pending | `claude plugin list` → if absent, re-run `claude plugin install engram`. |
| Port 7437 already in use | Conflicting service | `lsof -i :7437` and stop the holder, or set `ENGRAM_PORT=7438` and restart the plugin. |
| Permission prompts on every save | Allowlist missing | Add `mcp__engram__*` to `.claude/settings.local.json` `permissions.allow`. |
| Saves silently disappear | `.engram/` was wiped | Check `~/.engram/engram.db` exists and is readable. The plugin recreates if missing. |
| `mem_save` rejected with `[TOPIC SCHEMA]` | Topic key violates `schemas/memory-topics.md` | Run `bash scripts/validate-topic-key.sh "<your-topic>"` for a precise diagnostic. |
| OpenCode shows MCP but tools not callable | Stale config | Re-run `engram setup opencode` and restart OpenCode. |

## CI / GitHub Actions

CI runners do **not** install Engram (per design decision D1). The action.yml step that installs Claude Code agents runs with `SDD_CI_MODE=true`, which bypasses the Engram plugin install — only the agent files are written. Tests should not depend on Engram being available.

## References

- Engram: https://github.com/Gentleman-Programming/engram
- AGENT-SETUP guide: https://github.com/Gentleman-Programming/engram/blob/main/docs/AGENT-SETUP.md
- Architecture: https://github.com/Gentleman-Programming/engram/blob/main/docs/ARCHITECTURE.md
