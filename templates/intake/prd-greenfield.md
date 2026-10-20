# PRD — `<project-name>`

> Greenfield product requirements document. Consumed by `/sdd Mode 6` (`forge:kickstart`).
>
> Be specific but flexible — partial input is fine; the planner will surface clarifying questions before writing any spec.

## 1. Vision

**Problem statement.** What user / business pain motivates this product?

**One-line vision.** "We are building `<X>` for `<who>` so that `<outcome>`."

## 2. Target users / personas

| Persona | Role | Daily pains we address |
|---|---|---|
| `<P1>` | `<role>` | `<3 bullets max>` |
| `<P2>` | `<role>` | `<3 bullets max>` |

## 3. Goals (in priority order)

1. `<goal — measurable if possible>`
2. `<goal>`
3. `<goal>`

## 4. Non-functional requirements

- **Performance**: `<targets>` (latency, throughput, cold-start)
- **Security / privacy**: `<auth, PII, encryption, regulatory>`
- **Scale**: `<expected user/data volume at 6mo / 12mo>`
- **Availability**: `<SLA, downtime tolerance>`
- **Compatibility**: `<browsers, devices, integrations>`

## 5. Out of scope

- `<thing 1 we are NOT building in this iteration>`
- `<thing 2>`
- `<thing 3>`

## 6. Success metrics

- `<metric>: <target by N months>`
- `<metric>: <target>`

## 7. Constraints

- **Tech stack** (if pinned): `<runtime, framework, ORM, hosting>`
- **Budget / timeline**: `<MVP date, hard deadlines>`
- **Team**: `<size, roles, skill profile>`
- **Compliance**: `<SOC2, HIPAA, PCI, GDPR — if applicable>`

## 8. Backlog

Use the backlog table format from `templates/backlog.md` (schema reference). For a copy-and-fill starting point, see `templates/backlog.csv`. Acceptable inputs: XLSX, CSV, Markdown table, Notion / Linear / Jira export, or plain numbered list.

| ID | Epic | User story | Priority | Acceptance criteria | Technical notes |
|---|---|---|---|---|---|
| US-001-01 | EP-001 | As a `<role>`, I want `<goal>`, so that `<reason>` | Critical | GIVEN/WHEN/THEN | `<stack notes>` |

## 9. References

- Mocks / Figma: `<links>`
- Design system: `<link or "n/a">`
- Existing systems we integrate with: `<list>`

---

When ready, paste this PRD into the `/sdd Mode 6` intake gate. The planner will summarize its understanding, ask clarifying questions, and propose an openspec decomposition for your approval before any files are written.
