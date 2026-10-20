# Backlog — `<project-name>`

> Schema for backlog input consumed by `/sdd Mode 6` and `/sdd Mode 6b`.
>
> Accepted formats: XLSX / CSV / Markdown table / Notion / Linear / Jira export / plain numbered list. The planner normalizes any of these into the table below before producing the parsed-summary confirmation.

## Required columns

| Column | Required | Notes |
|---|---|---|
| `ID` | yes | `US-NNN-MM` format. Unique. |
| `Epic` | yes | `EP-NNN` format. Group multiple stories. |
| `User story` | yes | "As a `<role>`, I want `<goal>`, so that `<reason>`" — keep the framing. |
| `Priority` | yes | One of: `Critical / High / Medium / Low`. |
| `Acceptance criteria` | yes | One or more `GIVEN <state> WHEN <action> THEN <outcome>` triples. |
| `Technical notes` | no | Stack / API / dependency hints; the planner will surface or ignore. |

## Optional columns (if present, used)

| Column | Notes |
|---|---|
| `Story points` | Used for backlog volume metrics in the parsed summary. |
| `Mockup ref` | Figma URL or local path; populated automatically into tasks.md `mockup_ref:` for FE stories. |

## Example

| ID | Epic | User story | Priority | Acceptance criteria | Technical notes | Mockup ref |
|---|---|---|---|---|---|---|
| US-001-01 | EP-001 | As a customer, I want to log in with email + password, so that I can access my account | Critical | GIVEN a registered user WHEN they submit valid credentials THEN they are redirected to /dashboard within 500ms; GIVEN invalid credentials WHEN submitted THEN show inline error and remain on /login | use bcrypt; rate-limit 5/min/IP; session JWT 24h | https://figma.com/file/.../node-id=12-345 |
| US-001-02 | EP-001 | As a customer, I want to reset my password via email, so that I can recover my account | High | GIVEN a forgotten password WHEN I request reset THEN I receive an email with a link valid for 1h; the link sets a new password and logs me in | reuse existing transactional-email service | n/a |

## Parsed summary (auto-generated)

The planner produces this table after parsing your backlog. Confirm before any spec is written:

| Metric | Value |
|---|---|
| Epics | N |
| User stories | N |
| Critical | N |
| High | N |
| Medium | N |
| Low | N |
| Total story points | N (if available) |

Then per-epic breakdown:

| Epic ID | Name | Story count | Priority spread |
|---|---|---|---|
| EP-001 | … | N | N critical, N high, N medium |
