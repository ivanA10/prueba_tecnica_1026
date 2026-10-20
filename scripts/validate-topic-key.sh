#!/bin/bash
# Validate a topic_key against schemas/memory-topics.md
set -euo pipefail
TOPIC="${1:-}"
[ -z "$TOPIC" ] && { echo "[TOPIC SCHEMA] empty topic_key"; exit 1; }
# Must be lowercase, hyphens, slashes; up to 4 segments (some namespaces nest deeper)
if ! [[ "$TOPIC" =~ ^[a-z][a-z0-9-]*(/[a-z0-9][a-z0-9-]*){0,3}$ ]]; then
  echo "[TOPIC SCHEMA] malformed: $TOPIC"; exit 1
fi
NS="${TOPIC%%/*}"
case "$NS" in
  session|gate|spec|research|project|workspace|state|handoff|\
  coordination|contract|frontend|backend|database|verify|pr) ;;
  *) echo "[TOPIC SCHEMA] unknown namespace: $NS"; exit 1 ;;
esac
exit 0
