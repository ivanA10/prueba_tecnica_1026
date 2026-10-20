#!/usr/bin/env bash
# sdd-memory-budget-reset.sh — Reset per-turn Engram budget counter on Stop event.
set -u
STATE_DIR="${CLAUDE_STATE_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state}"
BUDGET_FILE="$STATE_DIR/memory-budget.json"
[ -f "$BUDGET_FILE" ] && rm -f "$BUDGET_FILE"
exit 0
