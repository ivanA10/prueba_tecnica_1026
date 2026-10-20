#!/usr/bin/env bash
# sdd-cascade-reset.sh — Reset cascade-depth state on Stop event (per-turn / per-session).
#
# The orchestrator may also reset between waves by deleting the file manually
# when it advances $FORGE_WAVE_NUMBER (not wired yet — Stop is the trigger today).
#
# Companion to sdd-cascade-cap.sh (W3 of forge-token-cascade-refactor).

set -u
STATE_DIR="${CLAUDE_STATE_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state}"
STATE_FILE="$STATE_DIR/cascade-depth.json"
[ -f "$STATE_FILE" ] && rm -f "$STATE_FILE"
exit 0
