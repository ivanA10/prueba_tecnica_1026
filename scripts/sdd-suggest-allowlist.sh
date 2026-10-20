#!/bin/bash
# sdd-suggest-allowlist.sh
#
# Reads the session trace log, finds Bash commands that ran ≥3 times in this
# session, and surfaces a "Consider adding to permissions.allow" suggestion.
#
# The trace is session-scoped: the SessionStart reaper truncates it at the start
# of each session, so this reads the current session's commands directly. There
# is no rotation and no .bak fallback (the old session-report rotator is gone).
#
# Idempotent — does not mutate settings.json itself; only suggests.

set -u

BASE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TRACE_LOG="$BASE_DIR/.claude/state/agent-trace.log"
THRESHOLD=3

if [ ! -f "$TRACE_LOG" ]; then
  exit 0
fi

# Extract Bash commands from the trace.
# Trace format (from PostToolUse hook): `[TRACE] <iso-timestamp> tool=Bash cmd=<command>`
# Older format: `[TRACE] <iso-timestamp> tool=Bash`
# This script looks for `cmd=` segments; if not present, skips silently.

declare -A COUNTS
while IFS= read -r line; do
  # Only process Bash trace entries
  if [[ "$line" != *"tool=Bash"* ]]; then continue; fi
  # Extract the command after `cmd=`
  cmd=$(echo "$line" | sed -nE 's/.*cmd=(.*)$/\1/p')
  if [ -z "$cmd" ]; then continue; fi
  # Normalize: trim trailing whitespace
  cmd="${cmd%"${cmd##*[![:space:]]}"}"
  # First word(s) of command — match up to first redirect/pipe so npm, npx, gh count consistently
  base=$(echo "$cmd" | awk '{
    if ($1 == "npx" || $1 == "bash" || $1 == "node" || $1 == "pnpm" || $1 == "yarn") print $1" "$2;
    else print $1
  }')
  COUNTS["$base"]=$(( ${COUNTS["$base"]:-0} + 1 ))
done < "$TRACE_LOG"

# Read existing allowlist from .claude/settings.json (if available) so we don't suggest dupes
existing_allow=""
SETTINGS_PATH="$BASE_DIR/.claude/settings.json"
if [ -f "$SETTINGS_PATH" ]; then
  existing_allow=$(SETTINGS_PATH="$SETTINGS_PATH" node -e "
    try {
      const s = JSON.parse(require('fs').readFileSync(process.env.SETTINGS_PATH,'utf8'));
      const a = (s.permissions && s.permissions.allow) || [];
      console.log(a.join('|'));
    } catch (e) { console.log(''); }
  ")
fi

# Store "<cmd>|<count>" so the count stays display-only and the Bash() pattern
# we suggest is a valid permission string.
suggestions=()
for cmd in "${!COUNTS[@]}"; do
  count="${COUNTS[$cmd]}"
  if [ "$count" -ge "$THRESHOLD" ]; then
    # Skip if already present in allowlist
    if [ -n "$existing_allow" ]; then
      pattern="Bash($cmd"
      if echo "$existing_allow" | grep -qF "$pattern"; then
        continue
      fi
    fi
    suggestions+=("${cmd}|${count}")
  fi
done

if [ ${#suggestions[@]} -gt 0 ]; then
  echo ""
  echo "═══════════════════════════════════════"
  echo "  💡 Allowlist suggestions"
  echo "═══════════════════════════════════════"
  echo "These commands ran ≥${THRESHOLD} times this session. Add to .claude/settings.json → permissions.allow:"
  for s in "${suggestions[@]}"; do
    cmd_part="${s%|*}"
    count_part="${s##*|}"
    printf "  - Bash(%s:*)   # ran %s× this session\n" "$cmd_part" "$count_part"
  done
  echo ""
fi
