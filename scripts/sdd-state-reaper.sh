#!/bin/bash
# sdd-state-reaper.sh — SessionStart cleanup for .claude/state clutter.
#
# Runs once at session start. Keeps the runtime-state dir lean so it cannot
# accumulate the unbounded per-turn backups that the old session-report
# rotation produced. Pure filesystem; never touches Engram (memory hygiene is
# Claude-driven via the forge:gc skill, which can reason about conflicts).
#
# Actions (all scoped strictly to .claude/state/, all non-fatal):
#   1. Delete every *.bak in .claude/state/  — legacy rotated trace/perf logs.
#   2. Delete retired perf observability artifacts (perf.log, last-perf-report.log,
#      last-session-report.log) left behind by older harness versions.
#   3. Truncate agent-trace.log so the trace is session-scoped and bounded
#      (the validator only greps the current wave window; cross-session history
#      is not needed and is what made the dir grow without limit).
#
# Trace + allowlist logs are recreated on demand by the PostToolUse / Stop hooks.

set -u

BASE_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
STATE_DIR="$BASE_DIR/.claude/state"

# Nothing to do if state dir was never created.
[ -d "$STATE_DIR" ] || exit 0

reaped=0

# 1. Legacy rotated backups (perf.log.*.bak, agent-trace.log.*.bak, anything.*.bak).
for f in "$STATE_DIR"/*.bak; do
  [ -e "$f" ] || continue
  rm -f "$f" 2>/dev/null && reaped=$(( reaped + 1 ))
done

# 2. Retired perf observability artifacts (removed in the local-trace slimdown).
for f in perf.log last-perf-report.log last-session-report.log; do
  if [ -e "$STATE_DIR/$f" ]; then
    rm -f "$STATE_DIR/$f" 2>/dev/null && reaped=$(( reaped + 1 ))
  fi
done

# 3. Truncate the trace so it starts fresh each session (bounded, no .bak).
if [ -e "$STATE_DIR/agent-trace.log" ]; then
  : > "$STATE_DIR/agent-trace.log" 2>/dev/null || true
fi

[ "$reaped" -gt 0 ] && echo "[reaper] cleaned $reaped stale state file(s) in .claude/state/"
exit 0
