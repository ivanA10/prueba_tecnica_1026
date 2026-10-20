#!/usr/bin/env bash
# sdd-trace-hook.sh — PostToolUse trace logger for session observability (A6).
#
# Reads the hook payload from stdin and appends one line per call to
# .claude/state/agent-trace.log in the format the A6 allowlist parser expects:
#   [TRACE] <iso-timestamp> tool=Bash cmd=<command>     # for Bash
#   [TRACE] <iso-timestamp> tool=<tool>                  # for everything else
#
# `cmd=` is emitted only for Bash so the suggest-allowlist parser sees clean
# lines — non-Bash tools have rich tool_input objects we don't want to flatten.

set -u

# Anchor to project root so the hook works when cwd is a subdirectory or
# worktree path. Falls back to cwd for manual invocation outside hooks.
BASE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TRACE_LOG="$BASE_DIR/.claude/state/agent-trace.log"
mkdir -p "$(dirname "$TRACE_LOG")" 2>/dev/null || true

ts=$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')

line=$(node -e '
  let s = "";
  process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const j = JSON.parse(s);
      const tool = j.tool_name || "unknown";
      if (tool === "Bash") {
        // Flatten newlines/tabs/CR to spaces and cap length so multi-line
        // heredocs cannot break the [TRACE] one-line-per-call invariant.
        let cmd = (j.tool_input && j.tool_input.command) || "";
        cmd = cmd.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
        if (cmd.length > 500) cmd = cmd.slice(0, 500) + "...";
        process.stdout.write(`tool=Bash cmd=${cmd}`);
      } else {
        process.stdout.write(`tool=${tool}`);
      }
    } catch (e) {
      process.stdout.write("tool=unknown");
    }
  });
' 2>/dev/null) || line="tool=unknown"

# Brace-group stderr redirect catches BOTH command stderr and bash redirect-open
# failures (the latter bypass per-command 2>/dev/null). If the project's
# .claude/state/ is unreachable (read-only cwd, missing $CLAUDE_PROJECT_DIR), the
# hook stays silent instead of spamming "cannot create" on every tool call.
{ echo "[TRACE] $ts $line" >> "$TRACE_LOG"; } 2>/dev/null
exit 0
