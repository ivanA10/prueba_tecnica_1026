#!/usr/bin/env bash
# sdd-validator-readonly-hook.sh — Read-only enforcement for the validator subagent.
#
# Hook context: PreToolUse on Write|Edit|NotebookEdit. Claude Code passes the
# hook payload as a single JSON object on stdin. Per the docs, when running
# inside a subagent the payload includes `agent_type` (e.g. "validator").
#
# Behavior:
#   - Reads stdin once, parses agent_type.
#   - If agent_type == "validator", exit 2 — Claude Code feeds stderr to the
#     model and aborts the tool call.
#   - Otherwise exit 0 (allow). The next hook in the array still runs.
#
# Defense-in-depth: the validator agent's `tools:` allowlist already blocks
# Write/Edit/NotebookEdit. This hook catches accidental allowlist drift.

set -u

agent_type=$(node -e '
  let s = "";
  process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write(j.agent_type || "");
    } catch (e) {
      process.stdout.write("");
    }
  });
' 2>/dev/null) || agent_type=""

if [ "$agent_type" = "validator" ]; then
  echo "[BLOCKED] validator subagent is read-only — Write/Edit/NotebookEdit not allowed" >&2
  exit 2
fi
exit 0
