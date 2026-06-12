# Proliquid Product Loop Runner

## Purpose

This document is the master operating instruction for running the Proliquid Product Loop with minimal founder intervention.

The loop exists to help Codex select, verify, implement, validate, and document one small valuable product increment at a time while preserving Proliquid's accounting integrity, auditability, and human-in-the-loop operating philosophy.

This runner must be used as an execution discipline, not as permission to make broad autonomous changes.

---

## Required Reading

At the start of every loop run, read the current versions of:

- `VISION.md`
- `OPERATING_MODEL.md`
- `PRODUCT_BLUEPRINT.md`
- `ACCOUNTING_RULES.md`
- `BACKLOG.md`
- `DECISIONS.md`
- `CURRENT_PRODUCT_STATE.md`
- `LOOP_RUN_LOG.md`

If the selected work relates to a specific operating loop, also read the relevant loop document:

- `INVOICE_LOOP.md`
- `BANK_STATEMENT_LOOP.md`
- `RECONCILIATION_LOOP.md`
- `ONBOARDING_LOOP.md`
- `BUSINESS_DATA_MODEL.md`
- `LOOP_IMPLEMENTATION_ROADMAP.md`

---

## Loop Objective

Each run must identify and complete the highest-priority unfinished increment that can be handled safely in one focused pass.

The loop must favor:

- small completed increments over broad unfinished initiatives
- visible business value over internal workflow scaffolding
- end-to-end workflow completion over additional intermediate states
- codebase evidence over assumptions
- operational control over speed
- accounting integrity over automation
- auditability over convenience

---

## Execution Selection Doctrine

The loop runner must prefer increments that make Proliquid more usable as a working financial operations product, not merely more internally structured.

### 1. Visible Business Value First

When multiple valid increments are available, prefer the increment that creates the largest visible business outcome for an end user, operator, reviewer, or accountant.

Visible business value means that, after the run is complete, a user can perform a meaningful business action that was previously impossible or materially incomplete.

Examples of visible business value:

- a reviewed document can become a draft accounting proposal
- a ready invoice candidate can become a draft journal-backed transaction
- a reviewer can complete a real accounting handoff
- a client or operator can move one workflow stage closer to a usable output

Examples of lower-priority internal-only value:

- adding statuses without completing the next business step
- adding intermediate flags that do not unlock a new user action
- adding control metadata without an immediately usable workflow outcome

### 2. Workflow Completion Preference

Prefer completing an existing workflow before extending it with additional internal states, metadata, or control layers.

When choosing between:

- making a workflow more internally detailed
- making the workflow reach its next business-complete milestone

prefer the second option unless controls would be weakened by doing so.

### 3. Avoid Status-Only Loops

Avoid loop runs whose primary outcome is the addition of new statuses, transitions, flags, or workflow states unless those states unlock immediate user-facing value in the same run.

A new state is acceptable when it directly enables the next visible workflow action.

A new state is not sufficient justification by itself.

### 4. End-To-End Thinking

Favor progressions such as:

Document  
→ Accounting Proposal  
→ Review  
→ Journal Draft

over progressions such as:

Document  
→ Status A  
→ Status B  
→ Status C

when both paths are compatible with Proliquid's accounting and control doctrine.

### 5. Product Value Test

Before selecting an increment, explicitly ask:

**"If this run is completed successfully, what new business action can a user perform that was impossible before?"**

If the answer is only:

- an internal state change
- an additional transition
- more metadata
- more workflow structure without a usable outcome

then continue searching for a higher-value increment.

### 6. Current Phase Workflow Priority

For the current Proliquid phase, prioritize completion of:

- document intake
- invoice workflow
- accounting proposal workflow
- accounting review workflow

before introducing additional workflow sophistication, extra internal stages, or secondary refinements.

### 7. Control Remains Mandatory

These execution preferences must not weaken:

- human-in-the-loop doctrine
- permissions
- auditability
- accounting controls
- review requirements

The loop runner should seek the highest-value increment **within** the control framework, not around it.

---

## Standard Loop Procedure

## 1. Read the operating context

Read the required documents listed above.

Understand:

- current product doctrine
- accepted decisions
- current product state
- open backlog priorities
- prior loop run outcomes
- known gaps and risks

Do not select work based only on memory or prior conversation.

## 2. Determine the highest-priority unfinished item

Review `BACKLOG.md` and `LOOP_RUN_LOG.md`.

Select the highest-priority item that is:

- not already completed
- not blocked by unresolved decisions
- small enough to produce a useful increment
- consistent with the current product state
- aligned with Proliquid's human-in-the-loop philosophy
- stronger on visible business value than alternative candidate increments
- more likely to complete a workflow milestone than merely extend internal state machinery

Never work on more than one major feature per run.

When several candidate increments are available, compare them explicitly and prefer the one that most clearly advances a user-facing workflow outcome.

## 3. Verify whether the item is already implemented

Before planning, inspect whether the selected item already exists in the application.

Check:

- pages
- API routes
- database schema
- helpers
- permissions
- UI states
- audit logging
- existing workflows

If the item is already implemented, do not rebuild it. Update the backlog/run log accordingly and select the next unfinished priority.

## 4. Inspect the relevant code

Always inspect the current codebase before making implementation decisions.

Use targeted code reading:

- search for relevant routes, models, helpers, and UI sections
- inspect existing patterns before introducing new ones
- identify permission and audit requirements
- identify validation and build requirements

Do not invent requirements that are not present in project documentation.

## 5. Create an implementation plan

Create a short plan before editing.

The plan must identify:

- selected goal
- why it is selected
- files likely involved
- smallest valuable increment
- the specific new business action unlocked by the increment
- validation checks
- risks or blockers

If the work has non-obvious consequences, pause and ask for approval before proceeding.

## 6. Implement only the smallest valuable increment

Make the smallest change that creates real product value.

The increment should be:

- coherent
- usable
- validated
- auditable where relevant
- compatible with existing permissions
- aligned with existing UI and backend patterns
- directed toward a workflow-complete outcome rather than a state-only outcome

Do not expand scope during implementation.

If a run can either:

- add another internal status layer, or
- complete the next meaningful business action in the workflow,

prefer the latter unless it would violate accounting, review, or permission controls.

## 7. Run validation checks

Run the checks appropriate to the increment.

Typical checks may include:

- TypeScript/build validation
- relevant linting if available
- targeted manual API checks where practical
- UI smoke checks where practical
- permission checks for protected flows

If the work touches accounting behavior, validate:

- accounting integrity is preserved
- posting rules are not weakened
- period controls remain respected
- audit logging is preserved

## 8. Fix issues when possible

If validation fails, investigate and fix issues within the selected scope.

Do not hide failing validation.

If an issue cannot be fixed safely in the same run, document it clearly in the completion report and `LOOP_RUN_LOG.md`.

## 9. Update loop documentation

At the end of a completed run, update:

- `BACKLOG.md`
- `LOOP_RUN_LOG.md`

Documentation updates must reflect:

- what was completed
- what remains open
- any new risks discovered
- recommended next run

Do not rewrite unrelated documentation.

## 10. Produce a completion report

Every run must end with a concise completion report using the required output format below.

Stop after one completed increment and wait for approval.

---

## Hard Rules

- Never work on more than one major feature per run.
- Prefer small completed increments over large unfinished work.
- Prefer visible business-complete increments over internal workflow scaffolding.
- Do not select a run whose primary outcome is only a new status, flag, or transition unless it unlocks immediate user-facing value in the same run.
- Respect the human-in-the-loop philosophy.
- Preserve accounting integrity.
- Preserve auditability.
- Never perform destructive changes.
- Never remove functionality without explicit approval.
- Never invent requirements not present in project documentation.
- Always inspect the current codebase before planning work.
- Stop after one completed increment and wait for approval.
- Do not weaken permissions.
- Do not bypass review for ambiguous or high-value accounting matters.
- Do not introduce automatic posting unless explicitly approved in project documentation.
- Do not create or alter database schema casually.
- Do not modify unrelated application areas.
- Do not touch public homepage or marketing pages unless the selected loop item explicitly requires it.
- Do not confuse workflow sophistication with business progress.

---

## Accounting And Control Rules

Any loop run that touches accounting, documents, reporting, reconciliation, or investor outputs must respect:

- `ACCOUNTING_RULES.md`
- `DECISIONS.md`
- existing permission helpers
- existing audit log patterns
- existing period controls

Human validation remains mandatory for:

- ambiguous classifications
- high-value transactions
- VAT uncertainty
- shareholder, investor, intercompany, investment, and distribution flows
- exceptional or unsupported accounting treatments

---

## Implementation Boundaries

The loop runner may:

- inspect the codebase
- identify the next unfinished priority
- implement one small valuable increment
- run validation checks
- fix scoped defects
- update `BACKLOG.md`
- update `LOOP_RUN_LOG.md`

The loop runner must not:

- implement multiple major features in one run
- make broad redesigns
- prioritize internal state layering over visible workflow completion when a higher-value workflow increment is available
- remove working functionality without approval
- alter accounting logic without validating downstream effects
- skip permission checks
- skip audit implications
- treat AI output as final accounting judgment
- create new product doctrine outside the documentation set

---

## Required Completion Report Format

Each loop run must produce a completion report with these sections:

## Goal selected

State the single selected goal.

## Why selected

Explain why this was the highest-priority unfinished item and why it was safe to work on now.

## Files inspected

List the key documentation and code files inspected before planning and implementation.

## Implementation plan

Summarize the plan that guided the increment.

## Changes made

List files changed and describe the product effect.

## Tests executed

List validation checks run and their result.

## Remaining risks

Document any unresolved risk, limitation, or follow-up discovered during the run.

## Recommended next run

Recommend the next single focused loop run.

---

## Run Discipline

The Proliquid Product Loop should behave like a careful operating partner:

- read first
- verify current state
- choose one meaningful increment
- implement conservatively
- validate honestly
- record what happened
- stop

Progress should accumulate through reliable completed steps, not broad unattended changes.
