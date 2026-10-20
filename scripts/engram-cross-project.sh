#!/bin/bash
# Cross-project Engram search helper.
# Usage:
#   engram-cross-project.sh <topic_prefix> [project1 project2 ...]
#
# Behavior:
#   - If no projects are listed, the script reads `repos:` from openspec/config.yaml
#     and queries each.
#   - Engram must be reachable on http://127.0.0.1:7437 (the plugin's default).
#   - Output is grouped per project; each line is "<topic_key> :: <title>".
#   - Honors `.forge/config.json` → `repo_role`: only `coordination` may read the
#     shared scope; everyone else stays project-scoped (warning emitted on attempt).
#
# Used by:
#   - agent-sync (multi-repo wave aggregation: state/wave/<change>)
#   - frontend teammates polling for backend contracts (contract/<endpoint>)
#   - orchestrator coordination plan (coordination/<change>)

set -euo pipefail

# Read repo_role from .forge/config.json when present. Default standalone.
REPO_ROLE="standalone"
if [ -f ".forge/config.json" ] && command -v jq >/dev/null 2>&1; then
  REPO_ROLE="$(jq -r '.repo_role // "standalone"' .forge/config.json 2>/dev/null || echo standalone)"
fi
case "$REPO_ROLE" in
  coordination|standalone|frontend|backend|monorepo) ;;
  *) REPO_ROLE="standalone" ;;
esac

TOPIC_PREFIX="${1:-}"
[ -z "$TOPIC_PREFIX" ] && {
  echo "Usage: $0 <topic_prefix> [project ...]" >&2
  exit 1
}
shift

PROJECTS=("$@")
if [ ${#PROJECTS[@]} -eq 0 ] && [ -f "openspec/config.yaml" ]; then
  # Extract repo keys from the `repos:` block. Direct children sit at exactly
  # 2 spaces of indentation — deeper keys (path:/role:/branch_prefix: in the
  # nested form) must NOT match. Supports both forms:
  #   repos:               repos:
  #     api: ../api          api:
  #                            path: ../api
  mapfile -t PROJECTS < <(awk '
    /^repos:[[:space:]]*$/ { inblock=1; next }
    inblock && /^[^[:space:]#]/ { exit }
    inblock && /^  [a-zA-Z0-9_-]+:/ {
      key=$1; sub(/:.*/, "", key); print key
    }' openspec/config.yaml)
fi

if [ ${#PROJECTS[@]} -eq 0 ]; then
  echo "No projects to query (no args; openspec/config.yaml has no repos:)" >&2
  exit 1
fi

ENGRAM_HOST="${ENGRAM_HOST:-http://127.0.0.1:7437}"

# Engram must be up; quick health probe
if ! curl -sf "$ENGRAM_HOST/health" > /dev/null 2>&1; then
  echo "[ENGRAM] WARNING: server not reachable at $ENGRAM_HOST — falling back to empty results per project." >&2
  for proj in "${PROJECTS[@]}"; do
    echo "--- $proj ---"
    echo "(engram unreachable)"
  done
  exit 0
fi

if [ "$REPO_ROLE" != "coordination" ] && [ ${#PROJECTS[@]} -gt 1 ]; then
  echo "[engram-cross-project] WARN: repo_role='$REPO_ROLE' is not 'coordination'." >&2
  echo "  Cross-project queries are advisory only; shared scope writes are forbidden." >&2
fi

echo "# repo_role: $REPO_ROLE"
echo "# topic_prefix: $TOPIC_PREFIX"
echo "# projects: ${PROJECTS[*]}"

for PROJ in "${PROJECTS[@]}"; do
  echo "--- $PROJ ---"
  # Engram HTTP API: GET /search?q=<query>&project=<name>
  # Returns a JSON array of SearchResult (Observation + rank). topic_key is on each entry.
  RESPONSE=$(curl -sf "$ENGRAM_HOST/search?q=$TOPIC_PREFIX&project=$PROJ" 2>/dev/null || echo "[]")
  if command -v jq &> /dev/null; then
    echo "$RESPONSE" | jq -r '.[]? | "\(.topic_key // "(no-topic)") :: \(.title // "(untitled)")"' 2>/dev/null || echo "(no results)"
  else
    # Minimal fallback — print raw response if jq isn't installed
    echo "$RESPONSE"
  fi
done
