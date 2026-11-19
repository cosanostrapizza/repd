# Repd — Product Contract

**Status:** Authoritative product direction
**Updated:** 2026-11-18

## Promise

Every creative deserves a business manager.

Repd is an agent-operated business workspace for independent commercial
creatives. Repd maintains the business record, prepares and coordinates work,
and escalates decisions that require the creative's judgment.

**The agent manages the work. The creative manages the decisions.**

Repd is not a CRM with an assistant attached, a collection of workflow forms,
or a chat transcript treated as a database.

## Users and business scope

The initial user is an independent commercial photographer, director, stylist,
or adjacent creative who personally manages inquiries, holds, bookings,
commercial terms, production obligations, communications, invoicing, payments,
and professional relationships.

The durable business objects are jobs, people, organizations, holds,
communications, invoices, payments, commitments, sources, and evidence.

## Two modes, one system

### Repd-led structured mode

Today and each Job Workspace show what changed, what Repd completed, what is in
progress, what is waiting, and which decisions or approvals need attention.
Ordinary work can be completed without opening chat.

### User-led conversational mode

The universal agent accepts natural-language questions and instructions from
anywhere. It resolves the relevant records, shows real operational activity,
uses validated business commands, prepares artifacts, and requests approval
where required.

Both modes operate on the same records, commands, permissions, work items, and
orchestration. Conversation is an interaction surface, never the source of
truth.

## Product principles

1. **Durable business state.** A job is understandable without its chat
   history. Sources, revisions, decisions, artifacts, and execution history are
   inspectable.
2. **Concurrent work.** A job may have several active objectives and
   dependencies. Repd recommends one next action without hiding the others.
3. **Cross-job intelligence.** Page context is a hint, not a boundary. Material
   ambiguity is clarified rather than guessed.
4. **Quiet maintenance.** Routine, unambiguous, source-backed record upkeep is
   automatic. Extracted claims remain distinct from confirmed commitments.
5. **Controlled execution.** Repd may inspect, organize, reconcile, and prepare
   automatically. External communication, hold changes, invoice issuance, and
   other consequential execution require authorization.
6. **Visible work.** Repd shows actual searches, checks, record changes,
   preparations, approvals, failures, retries, and results. It never fabricates
   progress or exposes private model reasoning.
7. **Continuity.** Saved decisions do not reappear because downstream work
   failed. Failures are explicit and retryable. Actions retain stable meaning.
8. **Low interaction cost.** The creative supplies judgment, not bookkeeping.

## Automation and authorization

| Operation                                                   | Default authority                         |
| ----------------------------------------------------------- | ----------------------------------------- |
| Read/search workspace records                               | Automatic                                 |
| Extract and reconcile non-conflicting source facts          | Automatic, with provenance                |
| Link people, organizations, sources, and answered questions | Automatic                                 |
| Prepare drafts, follow-ups, and internal recommendations    | Automatic                                 |
| Record an explicit user decision                            | Authorized by that instruction            |
| Grant/release a hold                                        | Explicit user authorization required      |
| Approve or send external communication                      | Separate explicit approval/execution      |
| Issue an invoice                                            | Explicit approval required                |
| Confirm delivery, booking, or payment                       | Provider evidence or explicit user record |

Copying or opening a draft is not delivery. A client-selected date is not a
confirmed booking. A conditional commitment must remain conditional.

Choosing which overlapping opportunity should take priority is also not a
booking confirmation. Repd may record that internal preference while both
holds remain active; release and confirmation require their own authorized
commands and evidence.

## Primary product surfaces

- **Today:** a concise manager briefing led by genuine user decisions,
  approvals, and recoverable failures. Repd work, external waiting, and recent
  changes are separate compact background sections rather than competing tasks.
- **Jobs:** durable workspaces organized around current situation, next steps
  by owner, and a progressively disclosed business record. Objectives and
  dependencies remain domain primitives, not primary interface concepts.
- **Calendar:** authoritative holds, bookings, availability, and conflicts.
- **Relationships:** people and organizations connected to jobs and history.
- **Universal agent:** a docked desktop panel (full-screen on mobile) and an
  expanded workspace sharing one durable conversation. It reflows the
  structured workspace, preserves page context without limiting cross-job
  work, and keeps external-message approval distinct from submitting an
  instruction to Repd.

Prepared communications and invoices open in focused action-backed review
surfaces. Job Workspace remains the business overview. Approval records an
internal decision only and never implies external delivery or invoice issuance.

The detailed interaction and technical contracts live in
`docs/agent-native-architecture.md`. Shipped reality and limitations live in
`PROJECT_STATE.md`.

## Composable conversational work

The universal agent can compose grounded searches, canonical job or Today
reads, evidence inspection, approval-gated producer drafts, dated internal
follow-ups, treatment decisions, and invoice preparation within one bounded
request. A conditional commercial statement is copied into the draft and
validated before persistence. A draft never counts as contact, and a follow-up
linked to an unsent draft remains a handoff reminder rather than an alleged
external wait.

Arbitrary commercial-field mutation, external delivery, invoice issuance, and
inbox monitoring remain outside this milestone. Requests that would silently
rewrite an externally agreed deadline stop for clarification.
