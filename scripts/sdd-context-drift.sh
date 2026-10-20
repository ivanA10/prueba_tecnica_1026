#!/bin/bash
# sdd-context-drift.sh — unified context-drift detection (single-repo + multi-repo).
#
# One mechanism, three drift dimensions, NEVER mutates anything:
#
#   --sections          Version drift: section markers in AGENTS.md/CLAUDE.md vs
#                       the install-time snapshot .forge/sections.lock (AU-8).
#                       Ownership drift: a coordination-role repo carrying
#                       member-owned sections (per .forge/section-ownership.json)
#                       → needs-split (the Mode 6b migration trigger).
#                       Emits: SECTIONS=current | stale(<list>) | needs-split | unknown
#
#   --repo <key>        Content drift: recompute the member repo's project-stack
#                       digest and compare against the hub's
#                       `forge:context:<key>:<hash12>` line.
#                       Emits: CONTEXT=current | CONTEXT_DRIFT=<key> (<why>)
#
#   --hash-repo <key>   Print the member's current 12-hex digest (used by
#                       bootstrap/agent-prep when writing the hub repo-map).
#
# Digest definition (MUST stay in sync with installer/core/markers.py
# compute_section_digest): sha256 over the full project-stack marker block
# (start marker line .. end marker line inclusive), with trailing whitespace
# stripped per line and leading/trailing blank lines dropped; first 12 hex.
#
# Consumers: sdd-preflight.sh (--sections, every session), agent-sync
# (--repo per touched member, post-wave → drift triggers re-audit 📋).

set -u

MODE=""
REPO_KEY=""

case "${1:-}" in
  --sections) MODE="sections" ;;
  --repo) MODE="repo"; REPO_KEY="${2:-}" ;;
  --hash-repo) MODE="hash"; REPO_KEY="${2:-}" ;;
  *)
    echo "Usage: $0 --sections | --repo <key> | --hash-repo <key>" >&2
    exit 2
    ;;
esac

if [ "$MODE" != "sections" ] && [ -z "$REPO_KEY" ]; then
  echo "Usage: $0 --sections | --repo <key> | --hash-repo <key>" >&2
  exit 2
fi

# --- helpers -----------------------------------------------------------------

# Resolve a repos: key to its path in openspec/config.yaml (flat + nested forms).
_repo_path() {
  local key="$1"
  [ -f "openspec/config.yaml" ] || return 1
  awk -v key="$key" '
    /^repos:[[:space:]]*$/ { inblock=1; next }
    inblock && /^[^[:space:]#]/ { exit }
    inblock {
      line=$0
      if (line ~ "^  " key ":[[:space:]]*[^[:space:]]") {
        sub(/^[^:]*:[[:space:]]*/, "", line); sub(/[[:space:]]*#.*$/, "", line)
        gsub(/["'"'"']/, "", line); print line; exit
      }
      if (line ~ "^  " key ":[[:space:]]*$") { incur=1; next }
      if (incur && line ~ /^    path:/) {
        sub(/^[^:]*:[[:space:]]*/, "", line); sub(/[[:space:]]*#.*$/, "", line)
        gsub(/["'"'"']/, "", line); print line; exit
      }
      if (incur && line ~ /^  [a-zA-Z0-9_-]+:/) { incur=0 }
    }
  ' openspec/config.yaml
}

# Normalized 12-hex digest of the project-stack marker block in a file.
# Parity contract with installer/core/markers.py compute_section_digest:
# trailing whitespace stripped per line; leading blank lines dropped (sed
# '/./,$!d'); trailing blank lines + final newline dropped ($() strips
# trailing newlines); sha256 over the bytes, first 12 hex.
_stack_digest() {
  local file="$1"
  [ -f "$file" ] || return 1
  local text
  text="$(sed -n '/<!-- forge:section:project-stack:/,/<!-- \/forge:section:project-stack -->/p' "$file" \
    | sed 's/[[:space:]]*$//' \
    | sed '/./,$!d')"
  printf '%s' "$text" | sha256sum | cut -c1-12
}

_repo_role() {
  local role="standalone"
  if [ -f ".forge/config.json" ]; then
    if command -v jq >/dev/null 2>&1; then
      role="$(jq -r '.repo_role // "standalone"' .forge/config.json 2>/dev/null || echo standalone)"
    else
      role="$(grep -o '"repo_role"[[:space:]]*:[[:space:]]*"[a-z]*"' .forge/config.json 2>/dev/null | sed 's/.*"\([a-z]*\)"$/\1/' || echo standalone)"
      [ -z "$role" ] && role="standalone"
    fi
  fi
  echo "$role"
}

# --- --hash-repo -------------------------------------------------------------

if [ "$MODE" = "hash" ]; then
  REPO_PATH="$(_repo_path "$REPO_KEY" || true)"
  if [ -z "$REPO_PATH" ]; then
    echo "ERROR: repo key '$REPO_KEY' not found in openspec/config.yaml repos:" >&2
    exit 1
  fi
  if [ ! -f "$REPO_PATH/AGENTS.md" ]; then
    echo "ERROR: $REPO_PATH/AGENTS.md missing" >&2
    exit 1
  fi
  DIGEST="$(_stack_digest "$REPO_PATH/AGENTS.md")"
  if ! grep -q "forge:section:project-stack" "$REPO_PATH/AGENTS.md"; then
    echo "ERROR: $REPO_PATH/AGENTS.md has no project-stack section" >&2
    exit 1
  fi
  echo "$DIGEST"
  exit 0
fi

# --- --repo (content drift vs hub forge:context line) ------------------------

if [ "$MODE" = "repo" ]; then
  HUB_HASH="$(grep -o "forge:context:$REPO_KEY:[0-9a-f]\{12\}" AGENTS.md 2>/dev/null | head -1 | awk -F: '{print $NF}')"
  if [ -z "$HUB_HASH" ]; then
    echo "CONTEXT_DRIFT=$REPO_KEY (no hub hash — bootstrap never wrote forge:context:$REPO_KEY)"
    exit 0
  fi
  REPO_PATH="$(_repo_path "$REPO_KEY" || true)"
  if [ -z "$REPO_PATH" ] || [ ! -f "$REPO_PATH/AGENTS.md" ]; then
    echo "CONTEXT_DRIFT=$REPO_KEY (member AGENTS.md missing at '${REPO_PATH:-?}')"
    exit 0
  fi
  MEMBER_HASH="$(_stack_digest "$REPO_PATH/AGENTS.md")"
  if [ "$HUB_HASH" = "$MEMBER_HASH" ]; then
    echo "CONTEXT=current"
  else
    echo "CONTEXT_DRIFT=$REPO_KEY (hub=$HUB_HASH member=$MEMBER_HASH)"
  fi
  exit 0
fi

# --- --sections (version + ownership drift) ----------------------------------

LOCK=".forge/sections.lock"
OWNERSHIP=".forge/section-ownership.json"

if [ ! -f "$LOCK" ]; then
  echo "SECTIONS=unknown (no $LOCK — re-run the Forge installer to snapshot section versions)"
  exit 0
fi

ROLE="$(_repo_role)"

# Ownership drift first — it outranks staleness (it's the migration trigger).
if [ "$ROLE" = "coordination" ] && [ -f "$OWNERSHIP" ] && [ -f "AGENTS.md" ]; then
  MEMBER_OWNED=""
  if command -v jq >/dev/null 2>&1; then
    MEMBER_OWNED="$(jq -r '.sections | to_entries[] | select(.value.owner == "member") | .key' "$OWNERSHIP" 2>/dev/null || true)"
  else
    # Fallback: known member-owned set (kept in sync with src/schemas/section-ownership.md)
    MEMBER_OWNED="project-stack
commands
repo-pairings"
  fi
  for section in $MEMBER_OWNED; do
    if grep -q "forge:section:$section:" AGENTS.md 2>/dev/null; then
      echo "SECTIONS=needs-split"
      echo "[CONTEXT-DRIFT] coordination repo carries member-owned section '$section' — run /sdd Mode 6b to move member detail into the member repos (gated, nothing moves without approval)."
      exit 0
    fi
  done
fi

# Version drift: compare live markers against the lock snapshot.
STALE=""
for FILE in AGENTS.md CLAUDE.md; do
  [ -f "$FILE" ] || continue
  # lock versions for this file: "name version" pairs
  if command -v jq >/dev/null 2>&1; then
    PAIRS="$(jq -r --arg f "$FILE" '(.files[$f] // {}) | to_entries[] | "\(.key) \(.value)"' "$LOCK" 2>/dev/null || true)"
  else
    PAIRS=""
  fi
  [ -n "$PAIRS" ] || continue
  while read -r NAME LOCKVER; do
    [ -n "$NAME" ] || continue
    LIVE="$(grep -o "forge:section:$NAME:[0-9.]*" "$FILE" 2>/dev/null | head -1 | awk -F: '{print $NF}')"
    if [ -z "$LIVE" ]; then
      STALE="${STALE:+$STALE,}$FILE:$NAME(removed)"
    elif [ "$LIVE" != "$LOCKVER" ]; then
      STALE="${STALE:+$STALE,}$FILE:$NAME($LOCKVER→$LIVE)"
    fi
  done <<EOF
$PAIRS
EOF
done

if [ -n "$STALE" ]; then
  echo "SECTIONS=stale($STALE)"
  echo "[CONTEXT-DRIFT] installed sections drifted from the install snapshot — re-run the Forge sync workflow to refresh (never hand-edit inside forge markers)."
else
  echo "SECTIONS=current"
fi
exit 0
