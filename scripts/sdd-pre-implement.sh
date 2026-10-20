#!/bin/bash
# sdd-pre-implement.sh — Branch gate (B1).
#
# Exits 1 unless the current branch matches `feat/<change-name>` or `feat/<bundle-name>`.
# Used as PreToolUse(Write|Edit) hook before any implementation file write.
#
# Usage:
#   bash scripts/sdd-pre-implement.sh <change-name>                       # default: enforce feat/<change-name>
#   bash scripts/sdd-pre-implement.sh <change-name> --bundle <bundle>     # accept feat/<bundle> instead
#
# Engram audit (orchestrator-driven, not this script):
#   - On bundle approval: mem_save topic_key=gate/multi-spec-branch/<bundle> with the change list.

set -u

CHANGE_NAME="${1:-}"
BUNDLE_NAME=""

shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE_NAME="${2:-}"; shift 2 ;;
    *)        shift ;;
  esac
done

if [ -z "$CHANGE_NAME" ]; then
  echo "[BRANCH-GATE] FAIL — sdd-pre-implement.sh requires a <change-name> argument" >&2
  exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ -z "$current_branch" ]; then
  echo "[BRANCH-GATE] FAIL — not in a git repository or no HEAD" >&2
  exit 1
fi

# Reserved branches — never allow impl writes here
case "$current_branch" in
  main|master|develop|dev|production|prod|release/*)
    echo "[BRANCH-GATE] FAIL — implementation cannot write to '$current_branch'." >&2
    echo "  Expected: feat/${CHANGE_NAME}${BUNDLE_NAME:+ or feat/${BUNDLE_NAME}}" >&2
    exit 1
    ;;
esac

expected_change="feat/${CHANGE_NAME}"
expected_bundle=""
if [ -n "$BUNDLE_NAME" ]; then
  expected_bundle="feat/${BUNDLE_NAME}"
fi

if [ "$current_branch" = "$expected_change" ]; then
  echo "[BRANCH-GATE] OK — on $current_branch (single-change mode)"
  exit 0
fi

if [ -n "$expected_bundle" ] && [ "$current_branch" = "$expected_bundle" ]; then
  echo "[BRANCH-GATE] OK — on $current_branch (bundle mode: $BUNDLE_NAME)"
  exit 0
fi

echo "[BRANCH-GATE] FAIL — current branch '$current_branch' does not match expected." >&2
echo "  Expected: $expected_change${expected_bundle:+ or $expected_bundle}" >&2
echo "  Fix: git checkout -b $expected_change" >&2
echo "  Or bundle: orchestrator dispatch with --multi-spec-branch <bundle-name> at plan approval" >&2
exit 1
