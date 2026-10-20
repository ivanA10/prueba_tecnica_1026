# /sdd Mode 7 — Bugfix-PR (Codacy + Copilot review surface)

> Read this file (explicit `Read` call) when the user selects Mode 7 — referenced docs never auto-load; only the `/sdd` router instruction loads them on any runtime.

## When to use

A PR is open and has accumulated review surface — GitHub Copilot review comments, Codacy findings, or human reviewer comments — that needs classification + targeted fixes.

## Input

- PR URL or `--latest`

## Skill invoked

`forge:bugfix-pr` mode `post-pr` (default) — backed by the `bugfix-pr` agent. See `skills/forge-bugfix-pr/SKILL.md`.

## Pre-flight variant

`mode=pre-flight` is auto-dispatched by `github-ops` BEFORE `gh pr create`. Behavior:

- Run Codacy locally on `git diff` against the merge-base of the target branch.
- If any `severity: critical` issue → emit `{ block: true }`, github-ops aborts PR creation.
- If none → emit `{ block: false }`, github-ops proceeds.

## Flow (post-PR)

```
you → bugfix-pr (classifies findings by file × severity × domain)
   → posts ordered classified PR comment with proposed dispatch plan
   → orchestrator dispatches the right domain agents (frontend | backend | database)
   → tester per domain → validator → done
```

## Approval gates

- ❓ clarification — when classification is ambiguous
- ✅ MANUAL TEST — **none** (PR comment delivery is the deliverable; fixes go through their own domain flow)

## Memory classification

Orchestrator dispatch (per `sdd-memory-governor.sh`):

- `--need similar_issue` (other PRs may have hit the same Codacy patterns)
- `--topic-prefix pr/<change>/bugfix-findings` + `pr/<change>/preflight-block`

## Examples

```
USER: /sdd 7 https://github.com/org/repo/pull/123
bugfix-pr (post-pr mode) → classified findings comment → orchestrator dispatches domain agents → done

USER: (github-ops invoked pre-flight before gh pr create)
bugfix-pr (pre-flight mode) → Codacy critical found → { block: true } → PR creation aborted
```

## Structured compaction triggers (W5)

Proactively issue `/compact` at these natural boundaries in Mode 7 flow:

- **post-classification** (after `bugfix-pr` posts the classified findings comment, before per-finding dispatch): the full PR comment + Codacy / Copilot review surface is now on the PR — the orchestrator only needs the dispatch plan going into per-domain fix waves.
- **post-PR-comment** (final delivery): the classified comment is the deliverable; subsequent fixes route through their own domain flow (Mode 5 semantics) and start fresh.

Never compact mid-classification or while bugfix-pr is still resolving file × severity × domain groupings. Pre-flight mode is single-shot — never compact pre-flight runs. See `agent_docs/context-hygiene.md`.
