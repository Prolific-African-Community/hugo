# Proliquid Loop Backlog

## Purpose

This file tracks the highest-priority execution items required to turn the current Proliquid documentation set into a real operating product for Luxembourg holdings, SPVs, family offices, and investment structures.

The backlog is intended to prioritize execution over theory. Items are framed as operating and product outcomes, not implementation tasks.

## Top 20 Priorities

| ID | Item | Category | Priority | Why it matters now |
| --- | --- | --- | --- | --- |
| 1 | Define the minimum viable client onboarding journey for a new Luxembourg entity from setup request to live workspace. | Operations | Critical | Without a controlled onboarding flow, the rest of the platform cannot operate consistently. |
| 2 | Define the minimum viable data model for live entities, counterparties, investors, bank accounts, and service relationships at the business level. | Product | Critical | The platform needs a clear operating record before loops can scale safely. |
| 3 | Launch the first usable entity workspace covering status, documents, accounting activity, reporting status, and outstanding requests. | Platform | Critical | This is the core surface clients and operators need to work from one place. |
| 4 | Establish the official review and approval policy for accounting proposals, including who can approve what and under which thresholds. | Accounting | Critical | Human control is central to the product philosophy and must be explicit early. |
| 5 | Define the first live chart-of-accounts operating standard for target Luxembourg structures, including custom-account governance. | Accounting | Critical | Consistent accounting treatment depends on a stable account structure. |
| 6 | Stand up the first structured document room policy covering intake categories, ownership, status, and retention logic. | Operations | Critical | Documents are the foundation for invoice, bank, reconciliation, and audit workflows. |
| 7 | Define the first operational invoice loop service policy, including who validates, who reviews, and what blocks accounting acceptance. | Operations | Critical | Invoice handling is one of the first real recurring loops clients will feel. |
| 8 | Define the first operational bank statement loop service policy, including acceptable source quality and review rules by format. | Operations | Critical | Bank-driven accounting and reconciliation depend on disciplined statement processing. |
| 9 | Establish the first reconciliation operating cadence for continuous review and period-end close. | Accounting | Critical | Reconciliation is the bridge between source data and reporting reliability. |
| 10 | Define materiality and high-value review thresholds by entity profile or structure type. | Accounting | High | Human review rules exist conceptually, but execution needs threshold clarity. |
| 11 | Launch the first investor and family office reporting pack standard with clear ownership and release discipline. | Product | High | Reporting is a core promise for these client segments and must become concrete. |
| 12 | Define the client portal access model for principals, finance teams, investors, and family office delegates. | Compliance | High | Information rights must be clear before broader portal rollout. |
| 13 | Establish the first audit trail operating standard covering approvals, overrides, escalations, and source-to-output traceability. | Compliance | High | Auditability is one of the strongest product differentiators and a control requirement. |
| 14 | Build the first live workflow queue for pending reviews, exceptions, escalations, and unresolved dependencies. | Platform | High | Operational throughput will break down without a visible work-control layer. |
| 15 | Define the first exception taxonomy used across invoices, bank statements, reconciliations, and reporting. | Operations | High | Exceptions need a common language to be measurable and manageable. |
| 16 | Create the first service-level operating metrics set for turnaround, backlog aging, review volume, and unresolved items. | Operations | High | COO-level control requires measurable operational performance. |
| 17 | Define the first AI-assistance policy for extraction, classification, matching, and confidence scoring boundaries. | AI Loop | High | AI should be introduced deliberately, not opportunistically. |
| 18 | Design the first family office and multi-entity visibility model for users who oversee several structures at once. | Product | Medium | This is strategically important but should follow the core entity workspace. |
| 19 | Define the first compliance playbook for cross-border VAT ambiguity, related-party treatment, and escalation to external advisers. | Compliance | Medium | Important for risk control, but should follow core workflow stabilization. |
| 20 | Establish the first long-range AI loop roadmap with staged delivery across invoice, bank, reconciliation, and reporting preparation. | AI Loop | Medium | This keeps the product direction coherent while preserving execution focus. |

## Execution Order

### Phase 1: Operating foundation

- 1. Minimum viable client onboarding journey
- 2. Minimum viable business data model
- 3. First usable entity workspace
- 4. Accounting approval policy
- 5. Chart-of-accounts operating standard
- 6. Document room policy

### Phase 2: Core financial loops

- 7. Invoice loop service policy
- 8. Bank statement loop service policy
- 9. Reconciliation operating cadence
- 10. Materiality and high-value thresholds
- 14. Workflow queue
- 15. Exception taxonomy

### Phase 3: Control and client value

- 11. Reporting pack standard
- 12. Client portal access model
- 13. Audit trail operating standard
- 16. Service-level operating metrics

### Phase 4: Expansion and intelligent assistance

- 17. AI-assistance policy
- 18. Family office and multi-entity visibility model
- 19. Compliance playbook
- 20. Long-range AI loop roadmap

## Dependencies And Risks

- The vision file remains high-level and should eventually be expanded so the strategic north star is more explicit.
- Entity onboarding, data structure, and review authority must be defined before advanced loop automation is allowed.
- AI loop work should not move ahead of approval policy, exception taxonomy, and audit rules.
- Investor-facing reporting should not scale until reconciliation and approval workflows are dependable.

## Notes

This backlog should be reviewed after each formal loop run. Priorities may evolve, but the first goal is to make the core operating model real, controlled, and repeatable.

### Recent completed increments

- 2026-06-11: lightweight document review queue MVP completed in the entity workspace.
- 2026-06-11: invoice candidate MVP completed so reviewed invoice documents can become structured draft invoice candidates.
- 2026-06-11: invoice candidate review progression completed so draft candidates can be edited, validated, and moved into a ready-for-accounting-review state with audit logging.
- 2026-06-11: manual accounting proposal MVP completed so ready invoice candidates can create a draft accounting transaction and draft journal entry through existing accounting rules.
- 2026-06-12: invoice draft traceability completed so users can open and review the draft accounting transaction directly from the invoice workflow.
