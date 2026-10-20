#!/bin/bash
# sdd-cleanup-orphans.sh — Stop-hook cleanup for orphan browser/MCP processes.
#
# Addresses anthropics/claude-code#15861 (claude-in-chrome-mcp processes
# accumulate without cleanup — observed at 189 processes / 27 GB RSS over
# ~10 hours in the upstream report). Closed as duplicate; no upstream fix.
#
# Patterns target only the documented leak signatures, scoped to the current
# user so we never touch other users' Chrome instances. Non-zero pkill exit
# codes (no matching process) are expected and silenced.

set -u

# Limit blast radius: only kill processes owned by the user running Claude.
USER_NAME="${USER:-$(id -un 2>/dev/null || echo)}"
[ -z "$USER_NAME" ] && exit 0

# Each pattern is the documented orphan-leak signature. Add new patterns here
# only with an upstream issue reference.
PATTERNS=(
  "claude-in-chrome-mcp"
  "Google Chrome for Testing"
)

killed=0
for pat in "${PATTERNS[@]}"; do
  count=$(pgrep -u "$USER_NAME" -f "$pat" 2>/dev/null | wc -l | tr -d ' ')
  if [ "${count:-0}" -gt 0 ]; then
    pkill -u "$USER_NAME" -f "$pat" 2>/dev/null || true
    killed=$(( killed + count ))
  fi
done

if [ "$killed" -gt 0 ]; then
  echo "[cleanup] killed $killed orphan browser/MCP process(es)"
fi
exit 0
