#!/usr/bin/env bash
# sdd-memory-budget.sh — Per-turn Engram budget enforcement.
#
# Hook context: PreToolUse on mcp__engram__*. Claude Code passes hook payload
# as JSON on stdin. We count tool calls per turn by stamping a counter file.
#
# Budget (see agent_docs/memory-budget.md):
#   - max_search_calls       = 2
#   - max_full_fetches (L3)  = 1
#   - max_mem_context        = 1 (and only after compaction / explicit recall)
#   - max_saves              = 2 (warn only, not hard block)
#
# Behavior:
#   - exit 0 → allow
#   - exit 2 → block + stderr feeds back to model
#   - State file: $CLAUDE_STATE_DIR/memory-budget.json
#                 default ${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state/memory-budget.json
#                 reset per turn by Stop hook (sdd-memory-budget-reset.sh)

set -u

STATE_DIR="${CLAUDE_STATE_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state}"
mkdir -p "$STATE_DIR" 2>/dev/null || true
BUDGET_FILE="$STATE_DIR/memory-budget.json"

payload=$(cat 2>/dev/null || echo '{}')

# Best-effort JSON parse via node (Claude Code prerequisite). Fall back to allow.
if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

tool_name=$(printf '%s' "$payload" | node -e '
  let s = "";
  process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write(j.tool_name || "");
    } catch(e) { process.stdout.write(""); }
  });
' 2>/dev/null) || tool_name=""

case "$tool_name" in
  mcp__engram__mem_search|mcp__engram__mem_get_observation|mcp__engram__mem_context|mcp__engram__mem_save)
    ;;
  *)
    exit 0
    ;;
esac

if [ ! -f "$BUDGET_FILE" ]; then
  printf '%s' '{"search":0,"fetch":0,"context":0,"save":0}' > "$BUDGET_FILE"
fi

node -e '
const fs = require("fs");
const file = process.argv[1];
const tool = process.argv[2];
let data;
try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
catch(e) { data = {search:0,fetch:0,context:0,save:0}; }
const LIMITS = { search: 2, fetch: 1, context: 1, save: 2 };
const KEY = {
  "mcp__engram__mem_search": "search",
  "mcp__engram__mem_get_observation": "fetch",
  "mcp__engram__mem_context": "context",
  "mcp__engram__mem_save": "save"
}[tool];
data[KEY] = (data[KEY] || 0) + 1;
fs.writeFileSync(file, JSON.stringify(data));

if (data[KEY] > LIMITS[KEY]) {
  if (KEY === "save") {
    process.stderr.write(`[MEMORY BUDGET] WARNING: ${KEY} count ${data[KEY]} exceeds soft limit ${LIMITS[KEY]} this turn. Consider batching.\n`);
    process.exit(0);
  } else {
    process.stderr.write(`[MEMORY BUDGET] BLOCKED: ${KEY} count ${data[KEY]} exceeds limit ${LIMITS[KEY]} this turn. See agent_docs/memory-budget.md. Use existing context or escalate to user.\n`);
    process.exit(2);
  }
}
process.exit(0);
' "$BUDGET_FILE" "$tool_name"
