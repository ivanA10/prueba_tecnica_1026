# Profiles (Layer 3) — Appendix

> The recommended entry point is the **`preset`** input on the action (see README install). Profiles are the low-level layer the preset resolves into; pin manually only for advanced cases.

## Preset → profile mapping

| `preset` | Auto-detected role | Profile(s) applied |
|---|---|---|
| `solo` (greenfield) | monorepo / frontend / backend / standalone | `frontend` and/or `backend-api` based on detection |
| `solo` (brownfield) | same | adds `brownfield` |
| `coordination-hub` | coordination | none (baseline only) |
| `member-repo` (greenfield) | frontend / backend | one of `frontend` / `backend-api` |
| `member-repo` (brownfield) | frontend / backend | adds `brownfield` |

`high-risk` is opt-in only — see "Pinning a profile manually" below.

## Profiles in detail

### frontend

For repos whose primary surface is UI:

- Mandates Figma MCP (Code Connect mappings, design-to-code).
- Mandates a browser test runner — agent-browser by default (D1), Playwright CLI for committed `*.spec.ts` suites.
- Adds accessibility (a11y) checks to the validator scorecard.
- Recommends `community/superdesign` skill for design system extraction.

### backend-api

For API-first repos:

- Mandates OpenAPI spec-first workflow (`openapi.yaml` checked in).
- Adds contract validation step in `forge:propose`.
- Integration testing required (cross-process, real DB) — not unit-only.

### brownfield

For repos with significant existing code:

- Mandates `forge:explore` before any work — seeds Engram `topic_key=project/memory`.
- `agent-prep` must run before any feature work (gates `BOOTSTRAP=missing`).
- Stricter scope checks during implementation.

### high-risk

For auth, payments, infrastructure, PII-handling code:

- Human review gates on every PR.
- Two-reviewer requirement.
- Secret-pattern lint added to validator.
- Escalation triggers from `docs/GOVERNANCE.md` enforced strictly.

## Stacking profiles

Profiles stack via comma-separated input (`profile="frontend,brownfield"`). Additive constraints — none override another. Conflicts (rare) escalate to user before sync.

## Per-profile MCP additions

| Profile | Adds MCP | Adds CLI |
|---|---|---|
| frontend | figma | agent-browser, npx playwright |
| backend-api | — | openapi-cli |
| brownfield | — | — |
| high-risk | — | semgrep, trivy (optional) |

## Pinning a profile manually

Pass `profile=<name>` (or comma-separated list). Manual selection always wins over preset auto-detection. Reserve for:

- Forcing `high-risk` on a repo that handles PII.
- Adding `brownfield` to a greenfield repo that already has migrated history.
- Removing a profile the preset would otherwise auto-include.
