# Proliquid Loop Run Log

## Purpose

This file records formal Proliquid loop runs used to review the operating model, identify execution priorities, and guide the next stage of product and operational development.

## Run Entries

## Run 005

### Run date

2026-06-12

### Run type

Invoice Loop draft review traceability increment.

### Documents reviewed

- `LOOP_RUNNER.md`
- `BACKLOG.md`
- `LOOP_RUN_LOG.md`
- `INVOICE_LOOP.md`
- `ACCOUNTING_RULES.md`
- `LOOP_IMPLEMENTATION_ROADMAP.md`

### Main findings

- The invoice workflow could already create a draft accounting transaction from a ready invoice candidate.
- The remaining user-visible gap was not another workflow state. It was the lack of a clean way to move from the invoice workflow into reviewing the created draft.
- The highest-value small increment was therefore traceability and navigation, not more internal workflow machinery.

### Increment completed

- Extended invoice candidate payloads to carry enough linked draft transaction context for review actions.
- Added an `Open draft` action on invoice candidates whose accounting draft already exists.
- After creating a draft from a ready invoice candidate, the workspace now moves directly into the Accounting tab.
- The linked transaction is focused and visually highlighted in the Accounting transactions list.
- Added a focused-draft indicator in the Accounting transactions section to make review orientation clearer.

### Control decisions reinforced

- No new autonomous accounting behavior was introduced.
- No posting behavior was changed.
- The increment improves reviewability of existing draft outputs rather than weakening any control gate.
- Human review remains the required next step after draft creation.

### Open questions

- Should the next accounting review increment surface the linked draft journal entry as explicitly as the draft transaction?
- Should invoice workflow users be able to jump directly into the journal lines view for the created draft, or is transaction-first review the better default?
- What is the minimum approval path from draft accounting output to posting for invoice-originated transactions?

### Recommended next focus area

Recommended next focus area: invoice accounting review completion.

The next smallest useful increment should let a reviewer move from the created draft transaction into a clearer accounting review outcome, ideally by exposing the linked draft journal entry and tightening the transition from draft review to controlled posting readiness without adding AI or new workflow states for their own sake.

## Run 004

### Run date

2026-06-11

### Run type

Invoice Loop manual accounting proposal MVP increment.

### Documents reviewed

- `LOOP_RUNNER.md`
- `LOOP_IMPLEMENTATION_ROADMAP.md`
- `INVOICE_LOOP.md`
- `ACCOUNTING_RULES.md`
- `CURRENT_PRODUCT_STATE.md`
- `BACKLOG.md`
- `DECISIONS.md`

### Main findings

- The product already had the minimum building blocks for a controlled draft accounting handoff:
  - reviewed source documents
  - structured invoice candidates
  - candidate readiness progression
  - counterparties
  - accounting rules
  - draft transaction and journal entry generation
- The highest-priority unfinished gap was the absence of a bridge between a ready invoice candidate and the existing accounting engine.
- The smallest useful increment was not account suggestion logic or AI assistance. It was a controlled way to create a draft accounting transaction from a ready candidate while preserving auditability and review discipline.

### Increment completed

- Added a dedicated backend route to create a draft accounting transaction and draft journal entry from a `READY_FOR_ACCOUNTING_REVIEW` invoice candidate.
- Reused the existing accounting rule engine by mapping invoice candidate type to:
  - `SUPPLIER_INVOICE`
  - `CUSTOMER_INVOICE`
- Linked the source document to the created draft transaction.
- Moved the source document into `LINKED` status after successful draft creation.
- Moved the invoice candidate into `ACCOUNTING_DRAFT_CREATED` status after successful draft creation.
- Added compact entity workspace actions so permitted internal users can create the draft directly from the invoice candidate row.

### Control decisions reinforced

- Only `READY_FOR_ACCOUNTING_REVIEW` candidates may create a draft accounting transaction.
- The source document must remain `REVIEWED` until the draft is created.
- The draft uses the existing accounting rule engine and remains `DRAFT`; no posting was introduced.
- Once a draft accounting transaction exists, the invoice candidate becomes read-only in the candidate editor.
- No OCR, AI extraction, VAT automation, reconciliation, or automatic posting was introduced.

### Audit behavior

- Added audit logging for:
  - `INVOICE_CANDIDATE_ACCOUNTING_DRAFT_CREATED`
  - `DOCUMENT_STATUS_CHANGED` to `LINKED`
- Preserved the existing `BUSINESS_TRANSACTION_CREATED` audit event for the draft transaction itself.

### Open questions

- Should the next accounting-stage object remain the transaction/journal draft pair, or should Proliquid introduce a dedicated accounting proposal review record before posting workflows?
- When the accounting draft is created, which additional fields should become mandatory for invoice candidates:
  - invoice number
  - VAT amount
  - due date
  - supporting classification note
- What is the first minimum approval authority rule for moving from accounting draft to posted journal entry by entity profile?

### Recommended next focus area

Recommended next focus area: invoice candidate to accounting review traceability.

The next smallest useful increment should expose the draft accounting output more clearly from the candidate itself, including the created draft transaction or journal reference and a tighter review path before posting, without adding AI or automated accounting judgment.

## Run 003

### Run date

2026-06-11

### Run type

Invoice Loop validation progression increment.

### Documents reviewed

- `LOOP_RUNNER.md`
- `LOOP_IMPLEMENTATION_ROADMAP.md`
- `INVOICE_LOOP.md`
- `ACCOUNTING_RULES.md`
- `CURRENT_PRODUCT_STATE.md`
- `BACKLOG.md`
- `DECISIONS.md`

### Main findings

- The invoice candidate MVP already covered the first structured object in the invoice loop, but it stopped at candidate creation.
- The highest-priority unfinished gap was the lack of a controlled progression step between `DRAFT` and accounting review.
- A small but real workflow increment was possible without adding OCR, AI extraction, accounting proposals, or automatic posting.

### Increment completed

- Added controlled invoice candidate editing from the entity workspace.
- Added server-side invoice candidate update support.
- Added a validated candidate status progression from `DRAFT` to `READY_FOR_ACCOUNTING_REVIEW`.
- Added the ability to reopen a ready candidate back to `DRAFT`.
- Added audit logging for:
  - invoice candidate content updates
  - invoice candidate status changes

### Control decisions reinforced

- Invoice candidates may progress only when the source document remains `REVIEWED`.
- Minimum readiness for accounting review now requires:
  - counterparty
  - invoice date
  - currency
  - total amount
  - description
- Ready candidates are treated as controlled review objects and must be reopened to `DRAFT` before accounting fields are edited again.
- No OCR, AI extraction, reconciliation, automatic accounting proposal, or posting was introduced.

### Open questions

- Which approval role should be allowed to move a ready invoice candidate into a formal accounting proposal stage?
- Should invoice number become mandatory before accounting proposal, or remain optional for limited supporting invoice formats?
- What is the first minimum accounting proposal object: transaction draft, journal draft wrapper, or dedicated proposal record?

### Recommended next focus area

Recommended next focus area: manual accounting proposal MVP from ready invoice candidates.

The next smallest useful increment should let a `READY_FOR_ACCOUNTING_REVIEW` candidate produce a controlled draft accounting proposal without posting automatically and without bypassing chart-of-accounts, period, or approval controls.

## Run 002

### Run date

2026-06-11

### Run type

Invoice Loop MVP foundation increment.

### Documents reviewed

- `LOOP_RUNNER.md`
- `LOOP_IMPLEMENTATION_ROADMAP.md`
- `INVOICE_LOOP.md`
- `ACCOUNTING_RULES.md`
- `CURRENT_PRODUCT_STATE.md`
- `BACKLOG.md`
- `DECISIONS.md`

### Main findings

- The product already had the necessary prerequisites for the first invoice-loop object: reviewed document states, secure document storage, counterparties, permissions, audit logging, and entity-first workflow surfaces.
- The highest-value missing step was not extraction or UI polish. It was the absence of a structured business object representing a reviewed invoice before accounting treatment.
- A small manual invoice candidate layer is the safest next step because it creates workflow structure without pretending OCR, AI extraction, or automatic accounting already exist.

### Increment completed

- Added `InvoiceCandidate` as a structured entity-level workflow object linked to:
  - reviewed invoice document
  - entity
  - optional counterparty
- Added API support to:
  - list invoice candidates for an entity
  - create one invoice candidate from one reviewed invoice document
- Added entity workspace support in the Documents tab to:
  - start an invoice candidate from a reviewed invoice document
  - capture core manual fields
  - show created invoice candidates in a compact list

### Control decisions reinforced

- Reviewed documents only may enter the invoice candidate workflow.
- Only invoice-type documents may become invoice candidates.
- One document may create one invoice candidate only.
- Candidate creation remains human-driven and manual.
- No OCR, AI extraction, reconciliation, automatic accounting, or posting was introduced.

### Open questions

- What is the minimum candidate review status model after `DRAFT`?
- Which fields should become mandatory before an invoice candidate may produce an accounting proposal?
- Should counterparty be mandatory at candidate stage, or can unresolved counterparty mapping remain a controlled exception?
- What is the first approval threshold for moving a candidate into accounting proposal status?

### Recommended next focus area

Recommended next focus area: invoice candidate review progression.

The next smallest useful increment should let teams move invoice candidates from `DRAFT` into a controlled accounting-preparation state with explicit validation checks, without yet introducing OCR or automatic proposal logic.

## Run 001

### Run date

2026-06-11

### Run type

First official Proliquid General Loop run.

### Documents reviewed

- `VISION.md`
- `OPERATING_MODEL.md`
- `PRODUCT_BLUEPRINT.md`
- `ACCOUNTING_RULES.md`
- `INVOICE_LOOP.md`
- `BANK_STATEMENT_LOOP.md`
- `RECONCILIATION_LOOP.md`

### Main findings

- The documentation set now defines a coherent control philosophy across product, operations, accounting, document handling, bank processing, and reconciliation.
- The strongest recurring theme is clear: Proliquid is a human-led Luxembourg financial operating platform with structured assistance, not an autonomous accounting engine.
- The operating model is directionally strong, but several execution foundations are still missing, especially onboarding, role-based approval authority, entity operating data standards, and measurable service operations.
- The loop architecture is sufficiently defined to support a real product roadmap, but not yet sufficiently operationalized to scale without process ambiguity.
- The highest-risk gap is not conceptual product design. It is the absence of explicit execution rules for who does what, when, and under which thresholds.

### Highest priorities identified

- define the minimum viable client onboarding journey
- define the minimum viable business data structure for live entities
- launch the first usable entity workspace
- establish accounting approval authority and review thresholds
- define the live chart-of-accounts operating standard
- formalize document room operating rules
- operationalize invoice, bank statement, and reconciliation service policies
- build the review queue and exception taxonomy
- define the first audit and reporting release standards

### Open questions

- What should be the first real customer journey from mandate to live reporting?
- Which roles must exist on day one for internal operations and external access?
- How should high-value review thresholds vary between a small holding company and an active SPV or family office structure?
- What is the minimum investor reporting standard that is commercially credible without overbuilding?
- What is the smallest safe AI assistance scope that can enter production without undermining trust?

### Recommended next focus area

Recommended next focus area: operating foundation.

The next loop should prioritize turning the product concept into a controlled service system by defining:

- onboarding
- internal roles and approval rights
- entity operating records
- document operating standards
- review queue and exception taxonomy

Until those foundations exist, further loop sophistication risks outpacing operating control.

## Observations

- The documentation set is strongest on control philosophy and target-state logic.
- The documentation set is weaker on launch-sequencing detail and day-one operating roles.
- The product direction is credible for Luxembourg structures, but execution discipline now matters more than additional conceptual expansion.

## Follow-Ups

- maintain the top-20 execution backlog
- review accepted decisions before introducing any broader automation
- use the next formal loop run to define onboarding, role authority, and minimum service metrics

## Notes

Each future run should add a new entry with dated findings, updated priorities, new decisions, and a recommended next focus area.
