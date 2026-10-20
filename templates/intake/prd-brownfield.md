# Change Request — `<short-name>`

> Brownfield change request. Consumed by `/sdd Mode 6b` (`forge:kickstart` brownfield branch).
>
> This format is intentionally smaller than a greenfield PRD: focus on what is changing in an existing system, not on rebuilding everything from scratch.

## 1. Trigger

What event prompted this change? `<bug report / customer feedback / regulatory / performance issue / strategic / debt repayment>`

Linkable refs: `<Jira / Linear / Notion / GitHub issue URLs>`

## 2. Current behavior

How does the system behave today, in the area of concern?

- `<concrete observable behavior, with file references where helpful>`
- `<edge cases that already exist>`

## 3. Desired behavior

What should the system do after this change?

- `<concrete observable behavior, ideally machine-checkable>`
- `<acceptance criteria, GIVEN/WHEN/THEN>`

## 4. Constraints

- **Must preserve**: `<existing contracts, public APIs, data shapes>`
- **Must not regress**: `<features, perf characteristics>`
- **Compliance**: `<auth/PII/payments — high-risk profile triggers if any apply>`
- **Migration**: `<is a DB migration needed? data backfill? feature flag rollout?>`

## 5. Out of scope

- `<things we are NOT changing in this iteration>`

## 6. Affected surface (best estimate)

| Layer | Estimate |
|---|---|
| Frontend | `<paths / components / "n/a">` |
| Backend | `<paths / services / "n/a">` |
| Database | `<tables / migrations / "n/a">` |
| Tests | `<unit / integration / e2e additions>` |

## 7. Risk

- **Blast radius**: `<low / medium / high>` — `<reason>`
- **Rollback plan**: `<feature flag, revert commit, data snapshot>`
- **Customers affected during deploy**: `<all / segment / none>`

## 8. References

- Related Engram topics: `<topic_keys to surface>`
- Similar prior changes: `<openspec/changes/<name>/ refs>`
- Mocks / specs: `<links>`

---

When ready, paste this change request into the `/sdd Mode 6b` intake. The planner will run `forge:explore` to seed `topic_key=project/memory`, summarize its understanding, and propose a single `proposal.md` + delta spec for your approval before any files are written.
