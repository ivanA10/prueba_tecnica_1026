#!/usr/bin/env bash
# sdd-cascade-cap.sh — Validation-cascade depth cap (W3 of forge-token-cascade-refactor).
#
# Prevents the "Backend Wave 0 create-user-flow" anti-pattern: a wave finishes,
# validation step fails, agent expands scope (full test suite → install →
# symlinks → re-test → re-prettier → …), turn balloons to 50min and 52.6M
# tokens. Hard cap: ONE failed validation step + ONE remediation attempt per
# wave. After that, the next Bash call is blocked.
#
# Dual-event hook — registered for BOTH PreToolUse and PostToolUse on Bash.
# Branches on `hook_event_name` in the payload.
#
#   PreToolUse:
#     - Read state; if a banned mid-wave pattern was already triggered OR
#       depth > 1, emit [CASCADE-CAP] BLOCK and exit 2 (hard-block).
#     - Otherwise exit 0 (allow).
#
#   PostToolUse:
#     - Parse the just-completed Bash command.
#     - Banned mid-wave patterns set `banned_triggered = true` (sticky for the
#       remainder of the wave). NO depth-1 grace: these are never legitimate
#       mid-wave work, so the NEXT Bash call is hard-blocked by PreToolUse.
#     - Validation-step patterns: classify outcome from tool_response.
#       FAIL → depth += 1.  PASS → depth = 0 (success clears prior failures).
#     - Always exits 0; the just-completed command already ran.
#
# State: $CLAUDE_STATE_DIR/cascade-depth.json (default .claude/state/...)
#   {
#     "depth": <int>,
#     "banned_triggered": <bool>,
#     "banned_reason": "<string>",
#     "fmt_write_paths": ["<path>", ...]
#   }
#
# Reset: `sdd-cascade-reset.sh` on Stop event (per-session/per-turn). The
# orchestrator should additionally rm the file at wave boundaries via
# FORGE_WAVE_NUMBER (not yet wired — for now, Stop is the reset trigger).
#
# 3-layer enforcement (defense in depth):
#   1. This hook (CC + Codex).
#   2. Agent body sections in 6 .md files (CC + OC + Codex).
#   3. Validator scorecard criterion 7 `cascade_discipline` (all 3 tools).
#
# Reference: src/agent_docs/cascade-policy.md (full state machine + anti-example).

set -u

STATE_DIR="${CLAUDE_STATE_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state}"
mkdir -p "$STATE_DIR" 2>/dev/null || true
STATE_FILE="$STATE_DIR/cascade-depth.json"

payload=$(cat 2>/dev/null || echo '{}')

if ! command -v node >/dev/null 2>&1; then
  # No node → hook can't classify; never block.
  exit 0
fi

# Parse event + command in one node call to minimise stdin re-reads.
parsed=$(printf '%s' "$payload" | node -e '
  let s = "";
  process.stdin.on("data", d => s += d).on("end", () => {
    try {
      const j = JSON.parse(s);
      if ((j.tool_name || "") !== "Bash") return process.stdout.write("");
      const event = j.hook_event_name || "";
      const cmd = (j.tool_input && j.tool_input.command) || "";
      // tool_response shape varies; collect any output-ish field.
      const tr = j.tool_response || {};
      const out = [tr.output, tr.stdout, tr.stderr, tr.error].filter(Boolean).join("\n");
      const exit_code = (tr.exit_code !== undefined) ? tr.exit_code : (tr.exitCode !== undefined ? tr.exitCode : null);
      process.stdout.write(JSON.stringify({event, cmd, out, exit_code}));
    } catch (_) { process.stdout.write(""); }
  });
' 2>/dev/null) || parsed=""

# Not a Bash call (or parse failed) → no-op.
[ -z "$parsed" ] && exit 0

EVENT=$(printf '%s' "$parsed" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.event||"");}catch{process.stdout.write("");}})' 2>/dev/null)
[ -z "$EVENT" ] && exit 0

# Seed state file if missing.
if [ ! -f "$STATE_FILE" ]; then
  printf '%s' '{"depth":0,"banned_triggered":false,"banned_reason":"","fmt_write_paths":[]}' > "$STATE_FILE"
fi

# ---------------------------------------------------------------- PreToolUse
if [ "$EVENT" = "PreToolUse" ]; then
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const parsedStr = process.argv[2] || "";
    let cmd = "";
    try { cmd = (JSON.parse(parsedStr).cmd) || ""; } catch(_) {}

    // ESCAPE HATCH — never block the commands that CLEAR the cap, or that
    // read its state. Without this, a tripped cap deadlocks the wave: the cap
    // blocks every Bash call, including the very `rm`/reset that would lift it
    // (chicken-and-egg). The orchestrator must always be able to reset and
    // recover in-turn, not only at the Stop event. Recognised escapes:
    //   - the reset script (sdd-cascade-reset.sh)
    //   - an rm of the cascade-depth.json state file
    //   - a cat/read of the state file (diagnostics)
    if (/sdd-cascade-reset\.sh/.test(cmd) ||
        /\brm\b[^|&;]*cascade-depth\.json/.test(cmd) ||
        /\bcat\b[^|&;]*cascade-depth\.json/.test(cmd)) {
      process.exit(0);
    }

    let s;
    try { s = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch(_) { process.exit(0); }
    if (s.banned_triggered) {
      process.stderr.write(`[CASCADE-CAP] HARD-BLOCK: ${s.banned_reason || "banned mid-wave pattern"} triggered earlier in this wave. Surface [CASCADE-STOP] to orchestrator instead of retrying. See agent_docs/cascade-policy.md.\n`);
      process.exit(2);
    }
    if ((s.depth || 0) > 1) {
      process.stderr.write(`[CASCADE-CAP] BLOCK: cascade depth ${s.depth} exceeds cap (1) for this wave. One failed validation step + one remediation attempt is the budget. Surface [CASCADE-STOP] to orchestrator with the failing step + root-cause hypothesis. Do NOT broaden scope or retry. See agent_docs/cascade-policy.md.\n`);
      process.exit(2);
    }
    process.exit(0);
  ' "$STATE_FILE" "$parsed"
  exit $?
fi

# --------------------------------------------------------------- PostToolUse
if [ "$EVENT" = "PostToolUse" ]; then
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const parsedStr = process.argv[2];
    let parsed; try { parsed = JSON.parse(parsedStr); } catch(_) { process.exit(0); }
    const cmd = parsed.cmd || "";
    const out = parsed.out || "";
    const ec = parsed.exit_code;
    if (!cmd) process.exit(0);

    let s; try { s = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch(_) { s = {depth:0,banned_triggered:false,banned_reason:"",fmt_write_paths:[]}; }

    // ============================================================
    // Everything below is LANGUAGE- and FRAMEWORK-AGNOSTIC.
    // The cascade cap is a generic SDD safety device, not a JS tool:
    //   - Anti-patterns are recognised by ecosystem-spanning token sets
    //     (every common package manager / dependency dir / test runner),
    //     so the same hook works for JS, Python, Go, Rust, Java, Ruby,
    //     PHP, .NET, make-based repos, etc.
    //   - The pass/fail VERDICT comes from the process EXIT CODE — the one
    //     signal that is universal across every toolchain. Per-tool output
    //     parsing is only a last-resort fallback when no exit code exists.
    // To extend coverage, add a token to the relevant list below; no
    // per-framework branching is required.
    // ============================================================

    // Dependency/vendor directories across ecosystems (no surrounding group).
    const DEP = "node_modules|site-packages|dist-packages|\\.venv|(?:^|/)venv(?:/|$)|(?:^|/)vendor(?:/|$)|/target/(?:debug|release)|/Pods/|bower_components|\\.cargo/registry|/packages/";
    // Package managers across ecosystems + their install/add verbs.
    const PKG = "npm|pnpm|yarn|bun|pip|pip3|pipenv|poetry|pdm|rye|uv|conda|mamba|cargo|go|gem|bundle|composer|nuget|dotnet|mvn|gradle|apt|apt-get|brew|apk|yum|dnf|pacman";

    // Blank QUOTED spans before pattern-matching (delimiters kept, contents
    // dropped). Text inside a grep/rg/echo argument — e.g. the validator
    // grepping the rule list in THIS file for a "pnpm install" string — must
    // never trip a banned/validation matcher. A real `npm install "@scope/x"`
    // still matches because only the quoted *contents* are removed, not the
    // verb. Implemented as a charCode scan (no literal quote chars) so it is
    // safe inside this single-quoted node block. 34=dquote 39=squote 92=bslash.
    const scrubbed = (function(str){
      var out = "", q = 0;
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (q) {
          if (c === 92) { i++; continue; }            // skip escaped char in quote
          if (c === q) { q = 0; out += str[i]; continue; }
          continue;                                    // drop quoted content
        }
        if (c === 34 || c === 39) { q = c; out += str[i]; continue; }
        out += str[i];
      }
      return out;
    })(cmd);

    // ----- Banned mid-wave patterns: sticky flag, blocks NEXT call -----
    // Package install is recognised only at a COMMAND POSITION — the first token
    // of a segment (start of string, or after | & ; newline ( ), allowing a
    // leading sudo / `python -m` / env-assignment prefix. This anchors to the
    // command VERB, so "<pm> install" appearing as an ARGUMENT (a grep pattern,
    // an echo string, a --flag value) does not fire. `--dry-run` (/ --dryrun /
    // --dry_run) is a non-mutating PREVIEW, not an install, and is excluded.
    const PKG_INSTALL = new RegExp(
      "(?:^|[\\n|&;(])\\s*(?:sudo\\s+)?(?:python[0-9.]*\\s+-m\\s+)?(?:env\\s+)?(?:[A-Za-z_]\\w*=\\S*\\s+)*(" +
      PKG + ")\\s+(install|i|add|get|require|restore)\\b", "i");
    const banned = [
      { re: PKG_INSTALL, name: "package install mid-wave",
        skip: () => /--dry[-_]?run\b/i.test(scrubbed) },
      { re: new RegExp("(ln\\s+-s\\s+|\\breadlink\\s+).*(" + DEP + ")"), name: "dependency-tree environment debug (symlink/readlink)" },
    ];
    // `find … <dep dir>` is the env-debug anti-pattern ONLY when it searches
    // INTO a dependency dir — NOT when it merely EXCLUDES one via `-not -path`
    // / `! -path`, which is a routine, legitimate filter. That exclusion form
    // was the original false-positive that hard-blocked a clean
    // `find … -name ".env*" -not -path "*/node_modules/*"` search mid-wave.
    if (new RegExp("\\bfind\\s+.+(" + DEP + ")").test(scrubbed) &&
        !new RegExp("(-not\\s+-path|!\\s+-path)\\s+\\S*(" + DEP + ")").test(scrubbed)) {
      banned.push({ re: new RegExp("\\bfind\\b[\\s\\S]+(" + DEP + ")"), name: "dependency-dir debug via find" });
    }
    for (const b of banned) {
      if (b.re.test(scrubbed) && !(b.skip && b.skip())) {
        s.banned_triggered = true;
        s.banned_reason = b.name + " (cmd: " + cmd.slice(0, 100) + ")";
        fs.writeFileSync(file, JSON.stringify(s));
        process.stderr.write(`[CASCADE-CAP] banned mid-wave pattern fired: ${b.name}. Next Bash call will be hard-blocked. Surface [CASCADE-STOP] now: report the failing step + missing module / env issue to orchestrator instead of attempting to remediate via install / symlink.\n`);
        process.exit(0);
      }
    }
    // Whole-suite test run (no filter / path scope) — banned across ecosystems.
    const fullSuite = [
      /^\s*(pnpm|npm|yarn|bun)\s+(run\s+)?test\s*(--)?\s*$/,
      /^\s*pytest\s*$/,
      /^\s*tox\s*$/,
      /^\s*go\s+test\s+\.\/\.\.\.\s*$/,
      /^\s*cargo\s+test\s*$/,
      /^\s*(bundle\s+exec\s+)?rspec\s*$/,
      /^\s*(\.\/)?(mvn|mvnw|gradle|gradlew)\s+test\s*$/,
      /^\s*make\s+test\s*$/,
      /^\s*dotnet\s+test\s*$/,
    ];
    if (fullSuite.some(re => re.test(scrubbed))) {
      s.banned_triggered = true;
      s.banned_reason = "whole-suite test run (no filter / path scope)";
      fs.writeFileSync(file, JSON.stringify(s));
      process.stderr.write(`[CASCADE-CAP] banned mid-wave pattern fired: whole-suite test (cmd: ${cmd.slice(0,80)}). Scope tests to the change folder. Surface [CASCADE-STOP] if validation gaps need orchestrator attention.\n`);
      process.exit(0);
    }
    // Formatter --check repeated after a --write on the same paths (re-format
    // thrash). Generic across common formatters; write-mode vs check-mode are
    // distinguished per-tool, the rest of the logic is shared.
    const FORMATTERS = [
      { w: /\bprettier\b[^|]*(?:--write|\s-w\b)/, c: /\bprettier\b[^|]*(?:--check|--list-different|\s-c\b|\s-l\b)/ },
      { w: /\bblack\b(?![^|]*--check)/, c: /\bblack\b[^|]*--check\b/ },
      { w: /\bruff\s+format\b(?![^|]*--(?:check|diff))/, c: /\bruff\s+format\b[^|]*--(?:check|diff)\b/ },
      { w: /\bgofmt\b[^|]*\s-w\b/, c: /\bgofmt\b[^|]*\s-l\b/ },
      { w: /\b(?:cargo\s+fmt|rustfmt)\b(?![^|]*--check)/, c: /\b(?:cargo\s+fmt|rustfmt)\b[^|]*--check\b/ },
    ];
    // Path-ish tokens (contain /, ., or *) from the first command segment.
    const pathTokens = (c) => c.split(/[|&;]/)[0].split(/\s+/).filter(t => t && !t.startsWith("-") && /[\/.*]/.test(t));
    const fmtWrite = FORMATTERS.some(f => f.w.test(scrubbed) && !f.c.test(scrubbed));
    const fmtCheck = FORMATTERS.some(f => f.c.test(scrubbed));
    if (fmtWrite) {
      s.fmt_write_paths = (s.fmt_write_paths || []).concat(pathTokens(cmd)).slice(-20);
    }
    if (fmtCheck && (s.fmt_write_paths || []).length > 0) {
      const checkPaths = pathTokens(cmd);
      if (checkPaths.some(cp => s.fmt_write_paths.some(wp => wp === cp || wp.includes(cp) || cp.includes(wp)))) {
        s.banned_triggered = true;
        s.banned_reason = "formatter --check repeated after --write on the same paths";
        fs.writeFileSync(file, JSON.stringify(s));
        process.stderr.write(`[CASCADE-CAP] banned pattern fired: formatter --check after --write on the same paths. One --write pass is enough; do not re-check.\n`);
        process.exit(0);
      }
    }

    // ----- Validation-step detection (ecosystem-agnostic): depth tracking -----
    // A command is a validation gate if it invokes a recognised test/lint/type/
    // format tool, OR uses a gate verb as a subcommand of a known runner. The
    // VERDICT is decided by exit code below — so a missed/extra match only
    // changes whether a step is counted, never how its outcome is judged.
    const GATE_VERB = "(?:test|tests|spec|specs|lint|typecheck|type-check|typing|format|fmt|build|check|verify|vet)";
    const RUNNER = "npm|pnpm|yarn|bun|npx|cargo|go|dotnet|mvn|mvnw|gradle|gradlew|make|poetry|pdm|hatch|pipenv|rye|uv|bundle|composer|nx|turbo|task|just|tox|nox|rake|gulp|grunt";
    const TOOL = "jest|vitest|mocha|ava|jasmine|karma|cypress|playwright|pytest|py\\.test|unittest|nose2?|rspec|minitest|phpunit|pest|gotestsum|clippy|golangci-lint|staticcheck|eslint|tslint|biome|oxlint|tsc|flow|mypy|pyright|pyre|ruff|flake8|pylint|black|isort|prettier|stylelint|checkstyle|spotless|ktlint|detekt|swiftlint|rubocop|standardrb|phpstan|psalm";
    const isValidation =
      new RegExp("\\b(" + RUNNER + ")\\b[^|&;]*\\b" + GATE_VERB + "\\b", "i").test(scrubbed) ||
      new RegExp("\\b(" + TOOL + ")\\b", "i").test(scrubbed);
    if (!isValidation) {
      fs.writeFileSync(file, JSON.stringify(s));
      process.exit(0);
    }

    // Classify outcome — by EXIT CODE only.
    // An explicit exit code is AUTHORITATIVE — structured (ec) when the harness
    // provides it, otherwise the textual "Exit code: N" line Claude Code appends
    // to failed Bash output. A clean exit means SUCCESS even if the output
    // happens to contain the word "error" (e.g. a build that prints a benign
    // warning).
    //
    // KEY CONTRACT: Claude Code appends an "Exit code: N" line ONLY to FAILED
    // (non-zero) Bash output. So when NO exit code is present anywhere — no
    // structured `ec` AND no "Exit code:" line — the command exited 0, i.e.
    // SUCCESS. We do NOT fall back to scanning stdout for "error"/"fail"
    // substrings: that heuristic miscounts *passing* verify gates (build, lint,
    // test) whose output benignly mentions those words, bumping cascade depth
    // on green runs. A missed real failure on an exotic harness is the cheaper
    // mistake than blocking legitimate verification work — and the validator
    // scorecard (criterion 7) is the backstop for cascade discipline anyway.
    let exitCode = (typeof ec === "number") ? ec : null;
    if (exitCode === null) {
      const m = out.match(/(?:^|\n)\s*Exit code:\s*(\d+)/);
      if (m) exitCode = parseInt(m[1], 10);
    }
    // exitCode === null ⇒ no failure signal was emitted ⇒ treat as success (0).
    const failed = (exitCode !== null) && (exitCode !== 0);

    if (failed) {
      s.depth = (s.depth || 0) + 1;
      fs.writeFileSync(file, JSON.stringify(s));
      if (s.depth === 1) {
        process.stderr.write(`[CASCADE-CAP] validation step FAILED (depth=1, remediation allowed). One more failure on this wave triggers hard-block. Scope the next attempt narrowly — same files, same gate, no scope expansion.\n`);
      } else if (s.depth > 1) {
        process.stderr.write(`[CASCADE-CAP] validation step FAILED again (depth=${s.depth} > cap 1). Next Bash call will be BLOCKED. Surface [CASCADE-STOP] now with the failing step + root-cause hypothesis. Orchestrator decides next move.\n`);
      }
      process.exit(0);
    }
    // Success clears prior failures on the same wave.
    s.depth = 0;
    fs.writeFileSync(file, JSON.stringify(s));
    process.exit(0);
  ' "$STATE_FILE" "$parsed"
  exit $?
fi

# Unknown event → no-op.
exit 0
