# Artifact Classification

This document is the authoritative source for how every artifact in the SDD standard is classified across the four-layer architecture.

Use this table to decide: should a new artifact be in the baseline, a profile, or a local pack?

## Decision Table

| Artifact | Layer | Committed to repo? | Installed by baseline sync? | Installed by profile sync? | Local bootstrap only? | Required? |
|---|---|---|---|---|---|---|
| `openspec/config.yaml` | 2 | Yes | Yes | — | No | Yes |
| `openspec/specs/` (directory) | 2 | Yes | Yes | — | No | Yes |
| `openspec/changes/` (directory) | 2 | Yes | Yes | — | No | Yes |
| `AGENTS.md` sdd-workflow section | 2 | Yes | Yes | — | No | Yes |
| `AGENTS.md` skills section | 2 | Yes | Yes | — | No | Yes |
| `AGENTS.md` mcp-integration section | 2 | Yes | Yes | — | No | Yes |
| `AGENTS.md` conventions section | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-explore/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-research/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-propose/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-implement/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-verify/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-orchestrate/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `.claude/skills/forge-kickstart/SKILL.md` | 2 | Yes | Yes | — | No | Yes |
| `schemas/task-format.md` | 2 | Yes | Yes (copy-if-missing) | — | No | Yes |
| `schemas/approval-gates.md` | 2 | Yes | Yes (copy-if-missing) | — | No | Yes |
| `schemas/spec-frontmatter.md` | 2 | Yes | Yes (copy-if-missing) | — | No | Yes |
| `templates/openspec/handoff.md` | 2 | Yes | Yes (copy-if-missing) | — | No | Yes |
| `CLAUDE.md` compatibility entrypoint (real file) | 2 | Yes | Yes (create-if-missing) | — | No | Recommended |
| `.github/copilot-instructions.md` compatibility entrypoint (real file) | 2 | Yes | Yes (create-if-missing) | — | No | Recommended |
| `AGENTS.md` frontend-conventions section | 3 | Yes | No | Yes (frontend) | No | No |
| `AGENTS.md` backend-api-conventions section | 3 | Yes | No | Yes (backend-api) | No | No |
| `AGENTS.md` brownfield-conventions section | 3 | Yes | No | Yes (brownfield) | No | No |
| `AGENTS.md` high-risk-conventions section | 3 | Yes | No | Yes (high-risk) | No | No |
| `.claude/mcp.json` (AIRIS, context7, etc.) | 4 | No | No | No | Yes | No |
| `.cursor/mcp.json` | 4 | No | No | No | Yes | No |
| `.vscode/mcp.json` | 4 | No | No | No | Yes | No |
| `.opencode/mcp.json` | 4 | No | No | No | Yes | No |
| `.codex/config.toml` | 4 | No | No | No | Yes | No |
| Engram local DB (`~/.engram/engram.db`) | 4 | No | No | No | No | No |
| Engram per-repo chunks (`.engram/*.json.gz`) | 2 | Yes | Yes | Yes | Yes | No |
| Optional MCP configs (Layer 4) | 4 | No | No | No | Yes | No |
| Personal memory files | 4 | No | No | No | No | No |
| Experimental skills | 4 | No | No | No | No | No |

## Support-Level Taxonomy

Use these labels consistently across docs:

| Label | Meaning |
|---|---|
| **Guaranteed** | Baseline sync installs, creates, or merges the artifact consistently as part of the repo contract. |
| **Supported** | The standard can work with the artifact or tool, but some behavior depends on runtime or local setup. |
| **Recommended** | Suggested by the workflow design, but not technically enforced by baseline sync. |
| **Local-only** | Must stay in developer-local config and is never committed by baseline sync. |
| **Experimental** | Mentioned or scaffolded, but not yet first-class in the stable standard. |

## Classification Rules

### A new artifact belongs in Layer 2 (baseline) if:
- It defines the SDD delivery contract for the whole team
- It must be consistent across all repos
- It has no dependency on local services or personal credentials
- Its absence would break the SDD workflow

### A new artifact belongs in Layer 3 (profile) if:
- It extends the contract for a specific class of repos
- Not all repos need it
- It is a team decision, not an individual developer preference
- Its absence does not break baseline SDD workflow

### A new artifact belongs in Layer 4 (local only) if:
- It requires local services (AIRIS Gateway, browser engines)
- It carries or references credentials
- It is specific to one developer's environment
- Its presence in a committed file would break other developers' setups

## When in doubt

Ask: "Would committing this file cause problems for a developer who doesn't have AIRIS running, doesn't have a Morph API key, or is using a different AI tool than the one this config targets?"

If yes → Layer 4 (local only).
