#!/usr/bin/env bash
# sdd-memory-governor.sh — Resolve memory cards for subagent dispatch briefing.
#
# Usage:
#   bash scripts/sdd-memory-governor.sh \
#     --need <none|recent_session|similar_issue|architecture_decision|continuation|explicit_user_recall> \
#     --topic-prefix <prefix> \
#     [--limit 3] \
#     [--max-tokens 1200] \
#     [--repo <key>]
#
# Output (stdout): JSON with `cards` array and `total_tokens` estimate.
#
# Behavior:
#   - need=none → emit empty cards array; do NOT call Engram.
#   - else → call `engram` CLI (or skip with WARNING if unavailable) with
#     `mem_search` against the topic prefix, take top N, estimate tokens,
#     truncate to budget.
#   - --repo <key> (multi-repo, AU-5): resolve cards from THAT member repo's
#     Engram project instead of the current one, via the same HTTP API that
#     engram-cross-project.sh uses (project name == repos: key convention).
#     Budget and output shape are unchanged.
#
# This script DOES count against the per-turn budget (PreToolUse hook still applies),
# so the orchestrator should call it ONCE per dispatch, not per subagent.

set -u

NEED=""
PREFIX=""
LIMIT=3
MAX_TOKENS=1200
REPO=""

while [ $# -gt 0 ]; do
  case "$1" in
    --need) NEED="${2:-}"; shift 2 ;;
    --topic-prefix) PREFIX="${2:-}"; shift 2 ;;
    --limit) LIMIT="${2:-3}"; shift 2 ;;
    --max-tokens) MAX_TOKENS="${2:-1200}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

if [ "$NEED" = "none" ] || [ -z "$NEED" ]; then
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"need=none"}'
  exit 0
fi

if [ -z "$PREFIX" ]; then
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"no prefix"}' >&2
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"no prefix"}'
  exit 1
fi

if ! command -v engram >/dev/null 2>&1; then
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"engram CLI unavailable"}' >&2
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"engram CLI unavailable"}'
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"node unavailable"}' >&2
  printf '%s\n' '{"cards":[],"total_tokens":0,"reason":"node unavailable"}'
  exit 0
fi

if [ -n "$REPO" ]; then
  # Cross-project resolution for a member-repo teammate (project == repos: key).
  ENGRAM_HOST="${ENGRAM_HOST:-http://127.0.0.1:7437}"
  RESULTS=$(curl -sf "$ENGRAM_HOST/search?q=$PREFIX&project=$REPO" 2>/dev/null || echo '[]')
else
  RESULTS=$(engram search "$PREFIX" --limit "$LIMIT" --json 2>/dev/null || echo '[]')
fi

printf '%s' "$RESULTS" | node -e '
let s = "";
process.stdin.on("data", d => s += d).on("end", () => {
  let arr = [];
  try { arr = JSON.parse(s); } catch(e) { arr = []; }
  if (!Array.isArray(arr)) arr = (arr && Array.isArray(arr.results)) ? arr.results : [];
  const limit = parseInt(process.argv[2] || "3", 10);
  if (arr.length > limit) arr = arr.slice(0, limit);  // HTTP path has no --limit
  const maxTokens = parseInt(process.argv[1], 10);
  const cards = [];
  let total = 0;
  for (const r of arr) {
    const preview = String(r.preview || r.snippet || r.title || "").slice(0, 180);
    const title = String(r.title || "");
    const est = Math.ceil((preview.length + title.length + 40) / 4);
    if (total + est > maxTokens) break;
    cards.push({
      id: r.id || r.observation_id || null,
      topic_key: r.topic_key || null,
      title,
      preview,
      score: r.score || 0,
      est_tokens: est
    });
    total += est;
  }
  process.stdout.write(JSON.stringify({ cards, total_tokens: total }));
});
' "$MAX_TOKENS" "$LIMIT"
echo
