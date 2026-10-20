# Skills catalog

> Reference for the 13 `forge:*` skills (Layer 2) and selected community skills.
> Loaded when the user asks about skills or selects a non-default skill.

## forge:* skills (canonical interface)

The 13 `forge:*` skills are the team-facing default. They wrap `opsx:*` (Layer 1, OpenSpec) with sub-agent orchestration, explicit MCP usage, Engram persistence, and the v2 audit gates.

| Skill | Wraps | MCPs | Purpose |
|---|---|---|---|
| `forge:explore` | `opsx:explore` | engram, context7 | Enriched exploration + brownfield project memory |
| `forge:research` | *(standalone)* | engram, context7, WebSearch | Deep multi-hop research with persistence |
| `forge:propose` | `opsx:propose`/`opsx:new` + `opsx:ff` | engram, context7, figma? | Spec creation with API/library validation + C4 verification-gate format check |
| `forge:implement` | `opsx:apply` | engram, context7 (+ profile MCPs) | Wave-based parallel sub-agents, TDD, B3 lint scope guard |
| `forge:verify` | `opsx:verify` | engram | Isolated read-only validator running the C5 scorecard |
| `forge:orchestrate` | *(meta)* | engram | Task DAG + parallel dispatch (wave-based) |
| `forge:kickstart` | `forge:explore`, `forge:propose` | engram, context7 | Greenfield (Mode 6) and brownfield change-request (Mode 6b) bootstrap |
| `forge:simple` | *(direct dispatch)* | engram | Mode 1 fast path — ≤5 tasks, ≤3 files, single domain, 2 commits |
| `forge:browse` | agent-browser CLI (Playwright fallback) | — | E2E probes; default for tester-front, validator manual checks, Mode 1 verification |
| `forge:bugfix-pr` | bugfix-pr agent | engram | Mode 7 post-PR review parser + pre-flight Codacy critical blocker |
| `forge:github-ops` | github-ops agent | engram | 4 commit checkpoints (plan/impl/test/archive) + B1 branch gate enforcement |
| `forge:sync` | agent-sync agent | engram | C2 hybrid task tracking — `tasks.md` primary, `.engram/state/tasks-<change>.json` mirror |
| `forge:gc` | filesystem audit + Engram soft-delete | engram | D4 audit-first cleanup; auto-runs at end of every cycle |

`opsx:*` commands remain available unmodified — direct use is an expert exception.

## Community skills (optional)

Installed by the action when present. Examples:

- `community/playwright` — committed `*.spec.ts` test patterns.
- `community/test-driven-development` — TDD reference patterns.
- `community/ui-ux-pro-max` — design system extraction.

## Choosing a skill — by user intent

| User intent | Skill | Mode |
|---|---|---|
| "Investigate / explore / qué hay sobre" in a repo with code | `forge:explore` | 4 |
| "Research / compare options / find best practice" | `forge:research` | 4 |
| "Plan / create the spec / draft the design" | `forge:propose` | 2 |
| "Implement / build / code this" (with approved spec) | `forge:implement` | 2 / 3 |
| "Add a /health endpoint" / "fix this typo" / "small change" | `forge:simple` | 1 |
| "Verify / validate / review before merge" | `forge:verify` | 2 / 3 / 5 |
| "Orchestrate / dispatch / parallelize" (3+ tasks) | `forge:orchestrate` | 2 |
| "Bootstrap / kickstart / start from PRD" (empty repo) | `forge:kickstart` | 6 / 6b |
| "Open PR" / "commit this phase" / "branch from approved plan" | `forge:github-ops` | 2 / 3 / 5 |
| "Fix Codacy / Copilot review on PR #N" | `forge:bugfix-pr` | 7 |
| "Test in browser" / "run the e2e flow" | `forge:browse` | any |
| "Sync task state" / "wave handoff" | `forge:sync` | 2 / 3 |
| "Clean up stale specs / orphan sidecars" | `forge:gc` | any |

## Skill descriptions and anti-patterns

Each `SKILL.md` carries an Anthropic-pattern description:

- Third-person ("Investigates X", not "You investigate X").
- Pushy triggers ("Use this skill whenever the user says ...").
- Explicit exclusions ("Do NOT use for ...").
- Bilingual triggers (English + Spanish).

This combats both **under-triggering** (skill exists but isn't picked up) and **over-triggering** (skill runs when a simpler tool would do).

## Combining skills (canonical chains)

| Mode | Chain |
|---|---|
| 1 simple | `forge:simple` → `forge:browse` (verify) → `forge:github-ops` |
| 2 plan + impl | `forge:explore` → `forge:research?` → `forge:propose` → 📋 → `forge:implement` (per wave) → `forge:sync` → `forge:verify` → ✅ → `opsx:archive` → `forge:github-ops` (per checkpoint) → `forge:gc` |
| 3 impl-existing | `forge:implement` → `forge:sync` → `forge:verify` → ✅ → archive |
| 4 research | `forge:explore` → `forge:research` |
| 5 bugfix | `forge:explore` (scoped) → `forge:propose` (lightweight) → `forge:implement` → `forge:verify` → ✅ |
| 6 / 6b bootstrap | `forge:kickstart` (greenfield branch / brownfield change-request branch) |
| 7 bugfix-pr | `forge:bugfix-pr` (post-PR mode) → routed domain agent → `forge:verify` |

## Where SKILL.md lives

- Source of truth: `skills/forge-<name>/SKILL.md`.
- Installed to: `.claude/skills/forge-<name>/SKILL.md`.
- OpenCode reads `.claude/skills/` natively — no translation needed.
