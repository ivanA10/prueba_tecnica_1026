#!/usr/bin/env bash
# rtk-rewrite.sh — opportunistic Bash compression hook (plugin: rtk)
#
# Claude Code PreToolUse hook on Bash. Reads a Bash tool payload from stdin and,
# if the `rtk` binary is installed and the command falls into rtk's coverage
# set, emits a stderr hint suggesting the rtk-prefixed form.
#
# This hook is INTENTIONALLY ADVISORY, NOT REWRITE-CAPABLE. Reasons:
#   1. Claude Code's PreToolUse rewrite protocol is not stable across versions —
#      ship a fragile rewrite and the next CC release breaks our harness.
#   2. Some commands legitimately need un-compressed output (e.g. the model is
#      parsing exact stdout). Forcing a rewrite violates user agency.
#   3. The harness already ships agent-side guidance in
#      `rules/agent-common.md` telling agents to PREFER `rtk <cmd>` over `<cmd>`
#      when expected output is large. That guidance + the plugin marker (in
#      `.forge/plugin_context.md`) does the real work; this hook just makes the
#      suggestion visible at run time so the agent sees the cue immediately.
#
# Users who want fully automatic rewriting should run `rtk init -g` themselves
# (or `rtk init -g --opencode` / Codex equivalent) — rtk ships a globally-
# installed hook that does the protocol-correct rewrite. The forge plugin
# deliberately avoids reinventing rtk's surface.
#
# Behaviour:
#   - rtk not on PATH                       → exit 0 silently (no-op)
#   - command already rtk-prefixed          → exit 0 silently (no-op)
#   - command not in rtk's coverage set     → exit 0 silently (no-op)
#   - command IS in coverage set            → emit stderr hint, exit 0 (advisory)
#   - any error in payload parsing          → exit 0 silently (never block)

set -u
trap 'exit 0' ERR

# Fast path: no rtk, nothing to suggest.
if ! command -v rtk >/dev/null 2>&1; then
  exit 0
fi

# Read the PreToolUse payload (JSON on stdin). Tolerate absence of stdin.
payload=""
if [ ! -t 0 ]; then
  payload=$(cat 2>/dev/null || true)
fi
[ -z "$payload" ] && exit 0

# Extract tool_input.command. Prefer jq; fall back to node. If neither, exit.
cmd=""
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
elif command -v node >/dev/null 2>&1; then
  cmd=$(printf '%s' "$payload" | node -e '
    let s="";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try { const p = JSON.parse(s); process.stdout.write(p?.tool_input?.command ?? ""); }
      catch (_) { /* swallow */ }
    });
  ' 2>/dev/null || true)
fi
[ -z "$cmd" ] && exit 0

# Already rtk-prefixed? Don't double-wrap.
case "$cmd" in
  rtk\ *|*\;\ rtk\ *|*"&&"\ rtk\ *|*"|"\ rtk\ *) exit 0 ;;
esac

# Coverage set — commands rtk knows how to compress.
covered=0
case "$cmd" in
  ls|ls\ *)                              covered=1 ;;
  cat|cat\ *)                            covered=1 ;;
  head|head\ *)                          covered=1 ;;
  tail|tail\ *)                          covered=1 ;;
  wc|wc\ *)                              covered=1 ;;
  grep|grep\ *|rg|rg\ *)                 covered=1 ;;
  find|find\ *)                          covered=1 ;;
  git\ status*|git\ diff*|git\ log*|git\ show*|git\ branch*)  covered=1 ;;
  pnpm\ test*|pnpm\ run\ test*|npx\ jest*|jest*|npx\ vitest*|vitest*)  covered=1 ;;
  pnpm\ lint*|pnpm\ run\ lint*|npx\ eslint*|eslint*)  covered=1 ;;
  pnpm\ typecheck*|npx\ tsc*|tsc*)       covered=1 ;;
  pnpm\ prettier*|npx\ prettier*|prettier*)  covered=1 ;;
esac
[ "$covered" -eq 0 ] && exit 0

# Advisory hint — goes to stderr so it surfaces in the model's tool-output
# context without affecting tool execution itself.
echo "[rtk] tip: prefix with 'rtk ' for compressed output (e.g. 'rtk ${cmd%% *} ...'). Run 'rtk init -g' to enable automatic rewriting." >&2
exit 0
