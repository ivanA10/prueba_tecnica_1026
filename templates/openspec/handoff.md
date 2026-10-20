# Implementation Handoff

Use this artifact after proposal/design/tasks are approved and before implementation begins for complex or high-risk changes.

## Change summary
- **Change name:**
- **Approved proposal:**
- **Approved design:**
- **Approved tasks:**

## Goal
What should be implemented, in one concise paragraph?

## In scope
- 
- 

## Out of scope
- 
- 

## Decisions already closed
- 
- 

## Open risks / follow-ups
- 
- 

## Source-of-truth files
- `openspec/changes/<change>/proposal.md`
- `openspec/changes/<change>/design.md`
- `openspec/changes/<change>/tasks.md`
- Additional architecture / ADR / contract files:
  - 

## Implementation guidance
- Work task by task; do not widen scope silently.
- If implementation contradicts approved design, pause and update the spec before continuing.
- Keep context compact: refer back to canonical files instead of copying them into prompts.

## Verification guidance
- What must be true before `verify` passes?
- Which tests/checks/commands matter most?
- Are there package or repo boundary checks required?

## Suggested implement prompt
Start a fresh implementation session for this approved change. Use `forge:implement` for mostly sequential work, or `forge:orchestrate` if tasks form a meaningful DAG or benefit from parallel isolated execution. Follow the approved tasks in order, keep scope within the handoff, and use the listed source-of-truth files as the authority. If reality contradicts the approved design or proposal, stop and surface the drift before continuing. Run the required verification checks before marking work complete.

## Suggested checkpoints
- Planning-approved checkpoint
- Wave/task checkpoint(s) for risky work
- Pre-verify checkpoint
- Post-verify checkpoint
