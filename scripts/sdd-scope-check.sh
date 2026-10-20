#!/bin/bash
# sdd-scope-check.sh — Lint scope guard (B3).
#
# Hooked on PreToolUse(Bash). When the bash command is a lint/format invocation,
# verify that:
#   (a) The command does NOT target the entire repo unscoped, AND
#   (b) The expected delta files (from `git diff --name-only HEAD`) are <= 2× the
#       average task-scope window (8 files), unless the agent is explicitly running
#       a project-stack `Lint` command and project-stack already accepts that scope.
#
# Behavior:
#   - Returns exit 0 (allow) for non-lint commands.
#   - Returns exit 1 (block) for unsafe broad rewrites with a diagnostic.
#
# Usage (manual / test): bash scripts/sdd-scope-check.sh "<full-bash-command>"
# Hook context: payload arrives as JSON on stdin. We read tool_input.command
# (see https://code.claude.com/docs/en/hooks → "Common input fields").

set -u

CMD="${1:-}"
if [ -z "$CMD" ] && [ ! -t 0 ]; then
  CMD=$(node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        const j = JSON.parse(s);
        process.stdout.write((j.tool_input && j.tool_input.command) || "");
      } catch (e) {
        process.stdout.write("");
      }
    });
  ' 2>/dev/null) || CMD=""
fi
[ -z "$CMD" ] && exit 0

# Identify lint/format invocations (case-insensitive)
case "$CMD" in
  *eslint*--fix*|*prettier*--write*|*ruff*--fix*|*black*|*gofmt*-w*|*golangci-lint*--fix*|*rubocop*-A*|*phpcbf*|*npm*run*lint*--*--fix*|*pnpm*run*lint*--*--fix*|*yarn*lint*--fix*) ;;
  *)
    # Not a lint/format invocation
    exit 0
    ;;
esac

# Detect "scope: whole repo" patterns
broad_patterns=(
  "."
  "./"
  "**/*"
  "**"
  "src/"
  "app/"
)

unscoped="false"
for pat in "${broad_patterns[@]}"; do
  case " $CMD " in
    *" $pat "*) unscoped="true"; break ;;
    *" $pat\""*) unscoped="true"; break ;;
  esac
done

# If the command has no path argument at all and uses a `--fix` style flag,
# many linters default to the whole project — also treat as broad.
if echo "$CMD" | grep -qE -- '--fix($| )' && ! echo "$CMD" | grep -qE '(\.[a-zA-Z]+|[a-zA-Z0-9_-]+/[a-zA-Z0-9_./-]+)'; then
  unscoped="true"
fi

if [ "$unscoped" = "false" ]; then
  exit 0
fi

# Compare current scope to git diff
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0
delta_count=$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')
expected_max=8
threshold=$(( expected_max * 2 ))

if [ "$delta_count" -gt "$threshold" ]; then
  cat <<MSG >&2
[SCOPE-GUARD] BLOCK — broad lint/format detected.
Command: $CMD
Touched files (HEAD diff): $delta_count (threshold: $threshold)
Rule (B3): lint/format only files modified in the current task. Use:
  git diff --name-only HEAD | xargs <linter>
or run the linter on a specific path that intersects the change folder.
MSG
  exit 1
fi

exit 0
