---
name: forge:browse
version: 1.0.0
description: >
  Browser-driven verification skill. Default tooling is Vercel agent-browser
  (Rust CLI + persistent daemon, accessibility-tree refs like `@e1`, 82%
  less context than Playwright MCP). Falls back gracefully to Playwright
  CLI if agent-browser is not installed. Used by tester-front, validator's
  manual probes, and Mode 1 simple verification. Existing committed
  *.spec.ts test suites still run via Playwright CLI for assertion contracts.
triggers: ["browse", "navigate", "click", "fill", "snapshot", "e2e probe", "agent-browser"]
layer: 2
wraps: agent-browser CLI (with Playwright CLI fallback)
phase: testing, verification
applies-to: tester-front, validator, frontend
mcp_dependencies: []
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:browse

## Purpose

End-to-end verification of UI flows with the lowest context cost. Replaces Playwright **MCP** (which is dropped) for ad-hoc probing. Playwright **CLI** is retained for committed `*.spec.ts` suites and advanced needs (network mocks, multi-tab, PDF).

## Defaults

| Tooling | Use when |
|---|---|
| **agent-browser CLI** (default) | Ad-hoc probes, validator manual checks, Mode 1 verification, exploratory navigation, snapshot + click + fill + screenshot. |
| Playwright CLI | Committed `*.spec.ts` suites; `Verification gate: playwright:<spec-path>`; advanced (network mock, multi-tab, PDF). |

## Detection

`scripts/sdd-preflight.sh` includes:

- `AGENT_BROWSER=available` if `agent-browser` is on PATH.
- `AGENT_BROWSER=absent` otherwise — fall back silently to Playwright CLI; emit a one-liner in the session report: `agent-browser not installed — using Playwright CLI fallback. Install via README → "Browser tooling".`

## Vocabulary

The C4-locked `agent-browser:` verification gate uses semicolon-separated steps:

```
agent-browser:nav <url>; click @<accessibility-ref>; fill @<ref> <text>; expect <substring or selector>; snapshot
```

| Step | Effect |
|---|---|
| `nav <url>` | Navigate to URL (relative or absolute). |
| `click @e<N>` | Click the element with accessibility-tree ref `@e<N>` from the latest snapshot. |
| `fill @e<N> <text>` | Type into the element. Quote multi-word values. |
| `expect <substring>` | Assert page text contains substring or current URL matches. |
| `snapshot` | Take an accessibility-tree snapshot (renumbers `@e<N>` refs). |
| `screenshot <name>` | Save a screenshot for the validator's record. |
| `wait <selector|ms>` | Wait for selector visible OR for ms milliseconds. |

## Example

`tasks.md`:

```markdown
- [ ] 1.1 Login screen happy path
  - **Owner profile:** frontend
  - **Verification gate:** agent-browser:nav /login; fill @e1 admin@example.com; fill @e2 secret; click @e3; expect /dashboard; snapshot
```

The validator parses the gate, calls forge:browse, captures the snapshot for evidence, and reports the result in the C5 `verification_gates` criterion.

## Fallback to Playwright CLI

If agent-browser is unavailable, forge:browse converts the step list into a transient Playwright spec at `tests/e2e/.tmp-<change>-<task>.spec.ts`, runs it via `npx playwright test`, captures the result, and removes the temp file. Token cost rises but the gate still verifies.

## Acceptance

- E2E verification of a login flow uses ≤5 agent-browser commands totaling <1500 tokens.
- The same flow on Playwright MCP exceeded 8000 tokens (baseline pre-D1).
- When agent-browser is missing, the Playwright CLI fallback runs the same gate transparently.

<!-- forge:skill:forge-browse:3.0.0 -->
