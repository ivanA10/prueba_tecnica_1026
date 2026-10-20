---
name: forge:kickstart
version: 2.2.1
description: >
  Bootstraps a project from a PRD/backlog (greenfield, /sdd Mode 6) or a
  change-request (brownfield, /sdd Mode 6b) into decomposed specs and a
  wave plan. For greenfield it calls forge:explore then forge:propose
  for each wave; for brownfield it consumes a templates/prd-brownfield.md
  change-request and produces a single proposal/spec. Includes the 📥
  intake gate and the 📋 audit gate (renders templates/repo-audit.md
  to .sdd/repo-audit.md, auto-deletes after approval). On a coordination
  hub (repos: in openspec/config.yaml) it runs the multi-repo branch:
  one audit + 📋 gate per member repo, member-owned sections written to
  each member's own AGENTS.md, hub gets only the repo-map. Triggers when
  the user starts a brand-new empty repository, runs /sdd Mode 6 or 6b,
  or provides a PRD, feature list, or change-request.
triggers: ["kickstart", "greenfield", "new project", "bootstrap project", "start from scratch", "armar el proyecto desde cero"]
layer: 2
wraps: forge:explore, forge:propose
phase: explore → propose
applies-to: orchestrator, planner
mcp_dependencies: [engram, context7]
compatible_tools: [claude-code, cursor, opencode, codex, copilot]
---

# forge:kickstart

## One-shot example (greenfield, Mode 6)

```
USER: /sdd 6
       PRD: Building a B2B admin portal for tenant management.
       Stack: Node 22, Next.js 15, Postgres + Prisma, Vitest.
       Out of scope: billing (separate service).
       Backlog: 3 epics, 11 user stories — paste table.

kickstart (greenfield branch)
  ├─ Step 1.5 — render templates/repo-audit.md → .sdd/repo-audit.md
  │     └─ 📋 audit gate: stack detected, domain map proposed → user ✅
  │     └─ Agent(agent-prep) writes project-stack to AGENTS.md
  │     └─ rm .sdd/repo-audit.md (auto-delete)
  ├─ Step 3 — parse PRD + backlog → summary table (3 epics, 11 stories, 2 critical)
  ├─ Step 4 — clarifying questions (auth provider? deploy target?)
  ├─ Step 5 — propose openspec decomposition (4 specs across 3 waves) → 📋
  ├─ Step 5.5 — propose change name "bootstrap-tenant-admin-mvp" → 📋
  ├─ Step 6 — propose wave plan → 📋
  └─ Step 7 — Agent(planner) per change folder → proposal/design/tasks
```

Brownfield (Mode 6b) shortcuts: smaller change-request format from `templates/prd-brownfield.md`, single proposal + delta spec, runs `forge:explore` first to seed `topic_key=project/memory`.

## When to use
Invoke at the start of any greenfield project or when asked to create an initial plan from scratch.
Do NOT invoke for brownfield or incremental feature work.

## Scope check before bootstrap

If the PRD/backlog spans >1 epic or >8 stories, the orchestrator must decompose
into multiple changes BEFORE invoking kickstart for artifact generation.
kickstart generates artifacts for ONE change at a time.

Invoke the scope decomposition gate in orchestrator.md first. Present the decomposition to the user
and get approval. Only then invoke kickstart per-change sequentially.

## Step 1 — Detect project type
- If `project-stack` section is absent from AGENTS.md AND no source code directories exist → GREENFIELD (Mode 6)
- If source code exists → BROWNFIELD (Mode 6b) → run `forge:explore` first to seed `topic_key=project/memory`, then continue here with the **brownfield branch** below.

## Step 1.25 — Detect topology (multi-repo branch gate)

Read preflight output: if `MULTI_REPO=true` (i.e. `openspec/config.yaml` has a
`repos:` map) AND `.forge/config.json` has `repo_role: "coordination"`, this is
a **coordination hub** → run the **Multi-repo branch** below INSTEAD of the
single-repo Step 1.5, then rejoin at Step 2. Otherwise continue at Step 1.5.

## Multi-repo branch (coordination hub) — per-member audit + 📋 gates

The hub's AGENTS.md carries hub-owned sections ONLY (`hub-repo-map`, workflow,
memory, boundaries). Member stack/domain detail lives in each member's own
AGENTS.md (`project-stack`, `repo-pairings`) — written by agents dispatched
INTO that repo, never inlined into the hub or into dispatch envelopes.

**M0 — Precheck members.** For each `<key>: <path>` under `repos:` in
`openspec/config.yaml`, verify `<path>/AGENTS.md` exists with forge section
markers. If any member lacks the skeleton, STOP with a plain-language gate:

```
---
📋 **Member repo not installed**

The repo `<key>` at `<path>` doesn't have the Forge harness installed yet, so I
can't bootstrap its context. Install it first, then re-run this mode.

> Technical: from the hub root, one command installs the hub AND every
> `repos:` member that exists on disk —
> `python -m installer github-action --target-root . --preset coordination-hub`
> (run it from a checkout of the Forge repo, `pip install -e .` first).
> Org-governed alternative, one repo at a time via PR:
> `gh workflow run sdd-sync-targeted.yml -f repos="<owner>/<repo>" -f repo_role="<frontend|backend>" -f dry_run="false"`
---
```

**M1 — Audit each member (one leaf dispatch per repo, sequential).** For each
member: dispatch `agent-prep` with `mode: audit` and **cwd = the member repo
root** (the member's own AGENTS.md/CLAUDE.md auto-load there on every runtime;
the hub's do not). The envelope carries paths and keys only — NEVER member
file content — and restates hard restrictions (read-only in audit mode, no
sub-dispatch, return raw audit data). Render the result to
`.sdd/repo-audit-<key>.md` **in the hub** and hold one 📋 audit gate per repo
(same format as Step 1.5; title it `Repo audit — <key>`). ✏️ feedback re-runs
that member's audit only.

**M2 — Write member context (one leaf dispatch per approved repo).** After ✅
for a member: dispatch `agent-prep` with `mode: write`, cwd = member root, and
pairing data computed from `repos:` (peer keys + paths, `contracts_dir`, hub
path). agent-prep writes `project-stack` AND `repo-pairings` into the
**member's** `./AGENTS.md` (section markers, never outside them), saves
`project/memory` to the **member's** Engram project, and returns ONLY: a
repo-map row (≤3 lines: key, path, role, one-line stack) — not the sections.
Then delete `.sdd/repo-audit-<key>.md`.

**M3 — Render the hub repo-map.** After all members complete: dispatch
`agent-prep` (cwd = hub) to fill the `hub-repo-map` section from the collected
rows — one table row per member, the pointer line ("Full member context lives
in `<path>/AGENTS.md` — loaded by the teammate session, never inlined here"),
and one `forge:context:<key>:<hash12>` line per member (hash via
`bash scripts/sdd-context-drift.sh --hash-repo <key>`, run from the hub).
The hub AGENTS.md must stay ≤180 lines; if it would exceed, trim the repo-map
rows, never re-inline member detail.

**M4 — Migration sweep (existing bloated hubs).** If the hub AGENTS.md
contains member-owned sections (`project-stack`, `repo-pairings`, `commands`
per `.forge/section-ownership.json`) — preflight reports this as
`SECTIONS=needs-split` — fold them into the flow: seed each member's M1 audit
with the hub's existing content for that repo, and AFTER the member's M2 write
is confirmed on disk, remove that section from the hub (markers included).
Never delete from the hub before the member write is verified. Aborting
mid-migration is safe: already-migrated members keep their files; the hub
keeps whatever wasn't migrated yet.

Nesting note: this skill runs in the orchestrator main session; every
`agent-prep` dispatch above is a leaf (max depth orchestrator → agent-prep —
the 2-level limit is never exceeded). Audits run sequentially because each 📋
gate needs the user.

Then rejoin the normal flow at **Step 2** (PRD intake for Mode 6,
change-request for Mode 6b) — planning happens on the hub.

## Step 1.5 — Render repo audit (📋 audit gate, BOTH branches)

Before any planning, render the audit doc for human review:

1. Detect stack (runtime, framework, package manager, ORM/DB, test runner, lint/format) by reading `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, lockfiles, etc.
2. Detect domain map (frontend/backend/database paths) by walking `src/`, `app/`, `pages/`, `migrations/`, etc.
3. Render the audit by populating `templates/repo-audit.md` and writing it to `.sdd/repo-audit.md`.
4. Present the 📋 audit gate:

```
---
📋 **Repo audit ready for review**

I've audited this repo and rendered the findings to `.sdd/repo-audit.md`.

This file is **temporary** — it is auto-deleted once the AGENTS.md `project-stack` section is written.

Please review and reply with:
- ✅ **Approved** — proceed to write project-stack and bootstrap
- ✏️ **Feedback: [corrections]** — I'll update the audit and re-render
- ❌ **Reject** — stop bootstrap
---
```

5. After ✅: write `project-stack` to AGENTS.md (delegated to `agent-prep`), then **delete `.sdd/repo-audit.md`**. Do not commit the audit file — it's bootstrap-ephemeral.

## Step 2 — Request input (branch on greenfield vs brownfield)

### Greenfield branch (Mode 6)

Use the PRD format from `templates/prd-greenfield.md` and the backlog format from `templates/backlog.md`. Output the intake request message below. Wait for user input.

### Brownfield branch (Mode 6b)

Use the change-request format from `templates/prd-brownfield.md` (smaller — `Trigger / Current behavior / Desired behavior / Constraints / Out of scope / Affected surface / Risk`). Same parsed-summary table, just shorter:

```
---
📥 **Change-request input required**

This is a brownfield repo, so I need a change-request rather than a full PRD. Paste your change-request following templates/prd-brownfield.md, or paste any document and I'll normalize it. Minimum useful content:

- **Trigger** — what prompted this change
- **Current behavior** — what the system does today
- **Desired behavior** — what it should do after
- **Constraints** — must preserve / must not regress
- **Out of scope**

Reply with your change-request to continue.
---
```

After parsing, output the same parsed-summary table as the greenfield branch — but for a brownfield change, the planner emits a single proposal + delta spec instead of multi-spec decomposition.

### Greenfield intake message (preserved from v2.0)

Output the intake request message (see orchestrator.md). Wait for user input.
Do not proceed without it or explicit user override ("proceed without PRD").

```
---
📥 **Project input required before planning**

To kick off this greenfield project I need the following input. Please provide what you have — partial input is fine, I'll work with what's available:

### 1. PRD (Product Requirements Document)
A document describing what we're building. Can be a markdown doc, Notion export, Google Doc link, or paste the content directly.

Minimum useful content:
- Product vision / problem statement
- Target users / personas
- Key features and goals
- Non-functional requirements (performance, security, scale)
- Out of scope

### 2. Backlog (User Stories or Feature List)
A list of features, epics, or user stories. Preferred format:

| ID | Epic | User Story | Priority | Acceptance Criteria | Technical Notes |
|----|------|------------|----------|---------------------|-----------------|
| US-001-01 | EP-001 | As a [role], I want [goal], so that [reason] | Critical/High/Medium/Low | GIVEN/WHEN/THEN | stack notes |

Accepted formats: XLSX, CSV, Markdown table, Notion/Linear/Jira export, or plain list.

---
Once you provide these, I will:
1. Parse and summarize what I understood
2. Ask clarifying questions if anything is ambiguous
3. Propose a descriptive change name for your approval
4. Propose epics → openspec spec decomposition for your approval
5. Define implementation waves for your approval before any files are written

Reply with your PRD and/or backlog to continue.
---
```

## Step 3 — Parse input
From the provided PRD and/or backlog extract:
- Product vision, target users, key features, non-functional requirements, out of scope
- Epics, user stories, priorities, acceptance criteria, technical notes
- Output a structured summary table for user confirmation

Summary format:

```
### Parsed summary

| Metric | Value |
|--------|-------|
| Epics | N |
| User stories | N |
| Critical priority | N |
| High priority | N |
| Medium priority | N |
| Low priority | N |
| Total story points | N (if available) |

### Epics overview
| Epic ID | Name | Story count | Priority spread |
|---------|------|-------------|-----------------|
| EP-001 | ... | N | N critical, N high, ... |
```

## Step 4 — Ask clarifying questions
Using the ❓ clarification format, ask about genuine ambiguities only:
- Tech stack if not specified
- Deployment target if not specified
- Conflicting priorities or missing acceptance criteria
- Integration dependencies not mentioned

```
---
❓ **Clarification needed**

Before I continue, I need to clarify the following:

1. [Question 1]
2. [Question 2 — only if truly needed]

Please reply with your answers and I'll proceed.
---
```

## Step 5 — Propose openspec decomposition
Map epics to openspec spec files. Propose which epics become which specs under `openspec/specs/`.

For any spec that will be implemented across more than one wave, note that the spec file must
contain explicit `## Wave N — [scope]` sections so tasks can reference the specific slice.

Present for user approval using the 📋 format before creating any files.

```
---
📋 **Validation required before proceeding**

I've prepared the following openspec decomposition:

| Spec file | Classification | Covers epics | Stories | Multi-wave? |
|-----------|---------------|-------------|---------|-------------|
| `openspec/specs/auth.md` | capability | EP-001 | US-001-01, US-001-02 | No |
| `openspec/specs/dashboard.md` | capability | EP-002 | US-002-01–03 | No |
| `openspec/specs/stage2-project.md` | stage | EP-009–EP-015 | US-009-01–015-04 | Yes (Wave 3 + Wave 4) |
| ... | ... | ... | ... | ... |

Spec classifications: foundation · capability · stage · cross-cutting
(See `schemas/artifact-classification.md` for definitions.)

Please review and reply with one of:
- ✅ **Approved** — to proceed to change name proposal
- ✏️ **Feedback: [your notes]** — to request changes before I continue

I will not proceed until you approve.
---
```

## Step 5.5 — Derive and approve change name

**This step is mandatory. Do not create any folders before the change name is approved.**

Based on the PRD and the scope of this bootstrap, derive a descriptive kebab-case change name.

**Naming rules (enforced, not optional):**
- Format: `verb-scope-outcome`
- Must describe what this change accomplishes, derived from the PRD scope
- **Numeric IDs are strictly prohibited** — `1`, `change-1`, `update`, `misc`, or any pure number are all invalid
- If you cannot derive a name, ask the user — do not default to a number

Good examples:
- `bootstrap-client-portal-mvp`
- `introduce-auth-and-admin-core`
- `launch-proposal-stage`
- `add-notification-service`

Bad examples (never use):
- `1`, `2`, `change-1`, `update`, `misc`, `fix`

Present the proposed name for approval:

```
---
📋 **Validation required before proceeding**

Proposed change name for this bootstrap:

`openspec/changes/<proposed-change-name>/`

This name will be used for all planning artifacts, referenced in every commit message,
and passed to the OpenSpec engine (`opsx:propose` or `opsx:new`) to create the canonical change folder.

Please reply with:
- ✅ **Approved** — to proceed with wave planning
- ✏️ **Different name: [your name]** — I'll use yours instead (must be kebab-case verb-scope-outcome)
---
```

## Step 6 — Propose implementation waves
Based on dependencies and priorities, propose wave groupings.

For specs that span multiple waves, list them with explicit wave-slice labels so tasks can
reference the correct section of the spec:

| Wave | Specs / Wave slices | Dependencies | Rationale |
|------|---------------------|--------------|-----------|
| 0 | `foundation.md` | none | Foundation must exist first |
| 1 | `auth.md`, `admin-core.md` | Wave 0 | Auth gates every route |
| 3 | `stage2-project.md § Wave 3` | Wave 2 | Core day-to-day screens |
| 4 | `stage2-project.md § Wave 4` | Wave 3 | Completes Stage 2 |

Present for user approval using the 📋 format.
Do not call `opsx:new` or create any files until approved.

```
---
📋 **Validation required before proceeding**

I've prepared the implementation wave plan. Please review and reply with one of:
- ✅ **Approved** — to proceed with project bootstrap
- ✏️ **Feedback: [your notes]** — to request changes before I continue

I will not proceed until you approve.
---
```

## Step 7 — Bootstrap project artifacts (delegation required)

Only after the wave plan is approved. Execute in this exact order:

1. **Delegate to agent-prep** — scan and write the `project-stack` section to AGENTS.md
2. **Delegate to planner agent** with the following context:
   - Approved spec decomposition from Step 5
   - Approved wave plan from Step 6
   - Approved change name from Step 5.5
   - Tech stack decisions from Step 4
   - Parsed PRD/backlog summary from Step 3
   
   The planner will:
   a. Check openspec/config.yaml for the active profile
   b. Invoke the appropriate opsx commands (see forge:propose)
   c. Write proposal.md, design.md, delta specs, and tasks.md
   d. Enrich tasks.md with forge metadata (see `schemas/task-format.md`)
   e. Create handoff.md if multi-wave
   f. Present the 📋 approval gate

3. **Wait for planner to complete and report back**
4. **Verify artifacts exist** — check that all expected files are present in `openspec/changes/<change-name>/`
5. **Save project memory** — once agent-prep finishes, ensure `mem_save topic_key=project/memory` reflects the bootstrapped stack. This becomes the baseline for downstream skills.

YOU (orchestrator) DO NOT WRITE ANY OF THESE FILES. The planner does.
If planner reports an error, ask the user for guidance. Do not attempt to write files as fallback.

### Post-generation validation

After planner completes, orchestrator MUST verify:
- [ ] All delta specs are in `openspec/changes/<change-name>/specs/` — NOT in `openspec/specs/`
- [ ] All spec files have frontmatter matching `schemas/spec-frontmatter.md`
- [ ] `tasks.md` uses opsx checkbox format (`- [ ] N.N`) with forge sub-bullets per `schemas/task-format.md`
- [ ] No files were created directly in `openspec/specs/`
- [ ] Change folder name is kebab-case (verb-scope-outcome)

If any check fails, report to user and ask planner to fix before proceeding.

<!-- forge:skill:forge-kickstart:3.0.0 -->
