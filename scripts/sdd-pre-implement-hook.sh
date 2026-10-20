#!/bin/bash
# sdd-pre-implement-hook.sh — Hook wrapper for the B1 branch gate.
#
# Resolves the active change-name from the most-recently-modified
# `openspec/changes/<change>/tasks.md`, then calls sdd-pre-implement.sh.
#
# Bypass: if the file being written is itself inside `openspec/changes/<change>/`
# (planner output) OR `templates/`, `agent_docs/`, `docs/`, `schemas/`,
# `rules/`, `installer/`, `scripts/` (repo-meta files), allow.
#
# Bypass: if no `openspec/changes/<change>/tasks.md` exists yet (greenfield bootstrap),
# allow — branch gate doesn't apply until a change is active.

set -u

# Read tool_input.file_path from the hook stdin payload. Claude Code does NOT
# export $TOOL_INPUT as an env var — the payload is a JSON object on stdin
# (see https://code.claude.com/docs/en/hooks → "Common input fields").
# Positional $1 is still honored for manual testing: `bash sdd-pre-implement-hook.sh path/to/file`.
TARGET_PATH="${1:-}"
if [ -z "$TARGET_PATH" ] && [ ! -t 0 ]; then
  TARGET_PATH=$(node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        const j = JSON.parse(s);
        const ti = j.tool_input || {};
        // Edit/Write use file_path; NotebookEdit uses notebook_path
        process.stdout.write(ti.file_path || ti.notebook_path || "");
      } catch (e) {
        process.stdout.write("");
      }
    });
  ' 2>/dev/null) || TARGET_PATH=""
fi
[ -z "$TARGET_PATH" ] && exit 0

# Claude Code passes an ABSOLUTE file_path in the hook payload, but the
# allowlist globs below are repo-root-relative (`.claude/*`, `openspec/changes/*`,
# `templates/*`, …). Without normalising, an absolute path like
# `/repo/.claude/state/cascade-depth.json` never matches `.claude/*`, so every
# bypass silently fails and the gate fires on harness-internal writes whenever
# the branch is reserved/mismatched. Strip the project-root prefix (no-op if the
# path is already relative).
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
TARGET_PATH="${TARGET_PATH#"$REPO_ROOT"/}"

# Always allow meta-edits (not impl writes).
# Patterns are anchored to repo root — `*.md` / `*.json` extension globs are
# intentionally NOT used here, since they would match impl files like
# `src/config.json` and silently disable the gate.
case "$TARGET_PATH" in
  openspec/changes/*) exit 0 ;;
  openspec/specs/*)   exit 0 ;;
  templates/*|agent_docs/*|docs/*|schemas/*|rules/*|installer/*|scripts/*|audit/*|archive/*|.claude/*|.github/*|.opencode/*|.cursor/*|.vscode/*|.codex/*|.agents/*) exit 0 ;;
  README.md|AGENTS.md|CLAUDE.md|CHANGELOG.md|GUIDE.md|LICENSE|action.yml|package.json|package-lock.json|.gitignore) exit 0 ;;
esac

# Resolve active change folder (most recently modified tasks.md)
active_change=""
if [ -d "openspec/changes" ]; then
  active_change=$(ls -t openspec/changes/*/tasks.md 2>/dev/null \
    | head -1 \
    | sed -E 's|openspec/changes/([^/]+)/tasks\.md|\1|')
fi

if [ -z "$active_change" ]; then
  # No active change → branch gate doesn't apply (bootstrap or pre-plan)
  exit 0
fi

# Bundle name — read from Engram audit topic if it exists for the current branch.
# (Best-effort; if engram CLI unavailable, fall back to single-change check.)
current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
bundle_arg=()
if [[ "$current_branch" =~ ^feat/(.+)$ ]] && [ "${BASH_REMATCH[1]}" != "$active_change" ]; then
  # Branch name doesn't match the active change → may be a bundle.
  # Best-effort: pass the branch suffix as bundle for sdd-pre-implement.sh to accept.
  bundle_arg=(--bundle "${BASH_REMATCH[1]}")
fi

bash "$(dirname "$0")/sdd-pre-implement.sh" "$active_change" "${bundle_arg[@]}"
