# Approval gates — standard formats

## Greenfield intake gate

Used by orchestrator at the start of a greenfield project.

Output:
```
---
📥 **Project input required before planning**

To kick off this greenfield project I need:

### 1. PRD (Product Requirements Document)
Markdown doc, Notion export, or paste directly. Minimum: vision, users, features, NFRs, out of scope.

### 2. Backlog (User Stories or Feature List)
XLSX, CSV, Markdown table, or plain list with: ID, Epic, User Story, Priority, Acceptance Criteria.
---
```

## Plan/artifact approval gate

Used after any spec, proposal, design, or tasks.md is written.

Output:
```
---
📋 **Validation required before proceeding**

I've written [artifact name] at `[path]`. Please review:
- ✅ **Approved** — proceed
- ✏️ **Feedback: [your notes]** — revise first

I will not proceed until you approve.
---
```

## Clarification gate

Used when any agent encounters ambiguity.

Output:
```
---
❓ **Clarification needed**

1. [Question — only genuinely ambiguous items]
2. [Question — max 3]

Please reply so I can continue.
---
```

## Manual test gate

Used after validator issues a PASS.

Output:
```
---
✅ **Manual test required**

Validator score: N/18. Please verify these acceptance criteria in the running app:
- [ ] Criterion 1
- [ ] Criterion 2

Reply with results or issues found.
---
```
