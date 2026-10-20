# Install detail — supplementary

> Most install actions go through the GitHub Action with one preset (`solo` / `coordination-hub` / `member-repo`). This file covers extras that are dev-machine local — never synced to target repos.

## Browser tooling (D1)

Default is **Vercel agent-browser**. Install once per dev machine:

```bash
npm i -g agent-browser
agent-browser install            # downloads the Rust binary + Chrome profile
```

Verify:

```bash
agent-browser --version
which agent-browser
```

Fallback when `agent-browser` is absent: `forge:browse` silently switches to Playwright CLI. Keep Playwright installed for committed `*.spec.ts` suites and advanced cases (network mocks, multi-tab, PDF):

```bash
npm i -D @playwright/test
npx playwright install
```

`scripts/sdd-preflight.sh` reports both:

```
AGENT_BROWSER=available
PLAYWRIGHT_CLI=available
```

## Engram

See `agent_docs/engram-install.md`. Engram is the memory backend; install once per dev machine via the Claude Code plugin.

## Codacy CLI (B5 pre-flight)

Optional — used by `bugfix-pr` in pre-flight mode. If absent, `bugfix-pr` falls back to project-stack `Lint` as a severity proxy.

```bash
brew install codacy/codacy-analysis-cli/codacy-analysis-cli   # macOS
# OR via Docker:
docker pull codacy/codacy-analysis-cli
```

## Baseline permissions (A5)

The action installs `templates/settings/permissions.json` into `.claude/settings.json` via deep merge. The 16 read-only commands (`ls`, `cat`, `git log`, `git diff`, etc.) execute without prompts. User-added permissions are preserved. See `installer/merge-settings.js`.
