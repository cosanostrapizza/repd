# Repd — Agent-Native UX and Domain Architecture

**Status:** Binding architecture contract
**Updated:** 2026-11-18

## 1. Information architecture

The primary navigation is Today, Jobs, Calendar, and Relationships. Actions are
not a separate business domain; cross-job work is presented on Today and
job-scoped work opens in the relevant Job Workspace.

### Today

Today consumes the canonical workspace projection. It prioritizes, in order:

1. failed operations that need a user-triggered retry;
2. consequential approvals and creative decisions;
3. urgent conflicts and deadlines;
4. Repd preparation currently in progress;
5. external waiting conditions;
6. compressed recent business changes.

Deferred, resolved, dependency-satisfied, and superseded work is excluded until
applicable. The opening briefing uses counts and plain language rather than
concatenating action titles. User attention, Repd work, and external waiting
are visually and semantically separate; recent activity is collapsed by
default. Users can act directly or enter the related job context.

### Job Workspace

Every job presents three primary concepts:

- **Current situation:** one canonical, current explanation of the commercial
  state, selected date versus confirmed booking, commitments, uncertainty, and
  blockers;
- **Next steps:** one concurrent work area grouped by needs you, Repd is
  handling, and waiting on others. Prepared communications, decision controls,
  failures, and retries live inside their relevant item;
- **Job details:** a compact business record for schedule, current and released
  holds, fee, licensing, deliverables, participants, communications, questions,
  activity, sources, revisions, and evidence using progressive disclosure.

Routine producer updates are initiated inside the job rather than through a
separate workflow page. Legacy destinations may redirect to the job.

Prepared work is represented by a compact current-state card. Its action route
is the single focused review surface; Job Workspace does not mount another
editor. Returning to the job re-reads the canonical action, approval, and
delivery state.

### Universal agent

The agent opens as a docked, width-adjustable desktop panel that reflows the
main workspace; mobile uses a full-screen presentation. Closing it retains the
durable conversation. A conversation has workspace or job context, but context
does not partition the agent's ability to search the workspace. The expanded
agent workspace and docked panel use the same component, thread, messages,
runs, and events. Outcome summaries are primary; execution details are
expandable (and open automatically on failure). The composer explicitly sends
an instruction to Repd, never directly to an external recipient.

## 2. Domain boundaries

### Business truth

`jobs`, `people`, `organizations`, `affiliations`, `job_participants`, `holds`,
`communications`, `invoice_drafts`, `sources`, `job_fields`, and
`job_field_revisions` hold business state and provenance.

### Coordination

- An **objective** is a durable outcome for a job. Jobs may have multiple
  active objectives.
- A **dependency** is a condition owned by Repd, the creative, or an external
  party. New evidence may update or supersede its value and evidence.
- An **action** is one stable unit of work. It is completed, deferred, failed,
  or superseded; its kind does not change to represent a later step.
- A **prepared artifact** such as a communication or invoice draft is linked to
  the action that produced or governs it.

No parallel task or proposal system is introduced. Actions are the durable
representation of proposed and pending work.

### Interaction and execution history

`activities` summarize meaningful business history. `action_events` record
action transitions. Agent threads/messages preserve conversation. Agent runs
and run events expose real operational steps and links to affected records.
Private model reasoning is never stored or displayed as activity.

## 3. Canonical projections

`getJobWorkspaceState(workspaceId, jobId)` is the authoritative read model for
Job Workspace, Today, and agent read tools. It derives rather than duplicates:

- current business state;
- active objectives and workstreams;
- recommended and secondary actions;
- pending approvals;
- waiting dependencies;
- preparation failures;
- prepared artifacts;
- active questions;
- recent changes and history.

`getWorkspaceTodayState(workspaceId)` combines job projections and
workspace-level actions using the same selection and priority rules.
The Jobs table consumes these same job projections and their canonical
attention label; it does not infer a separate next need from lifecycle fields.
Shared hold-conflict actions project into every affected job and are
deduplicated when the workspace projection is assembled.

The job projection also owns the short situation summary and compact facts.
Components do not independently infer proposed versus agreed terms, booking
certainty, prepared state, or current conflict preference.

An active action is non-resolved, non-superseded, and either not deferred or
due. An action whose canonical resolution dependency is satisfied is also
inactive, including legacy rows with stale statuses. The selection precedence
is failure, approval, creative decision, preparation, urgent conflict, external
waiting, and routine work. Selected alternatives derive non-selected requested
holds as released current state while retaining their request history.

## 4. Commands and authorization

Structured UI and agent tools call the same service commands. Server Actions
authenticate, validate untrusted input, resolve workspace ownership, and invoke
commands; they do not expose unrestricted database writes to the model.

Initial shared commands include recording inquiry and treatment decisions,
preparing/retrying communications, approval and handoff, hold transitions,
producer-source reconciliation, invoice preparation, and grounded workspace
search/read operations.

Related durable state transitions use transactions where supported. Fallible
AI preparation occurs after the authorized decision is durable. Preparation
has its own stable action and execution status, making failure visible and
retryable without duplicating decisions or artifacts.

Preparation failures are classified as transient provider, provider
configuration, non-retryable provider, artifact validation, or command/state
transition failures. Transient provider failures receive at most one automatic
retry. Manual retry atomically claims the existing preparation action so two
clicks cannot launch duplicate model work. The original dependency decision
and condition remain authoritative throughout.

Completed jobs with an agreed fee, billing client, and payment terms receive
one internal invoice draft automatically. The governing action becomes an
approval, never an issuance or delivery event. Missing invoice inputs remain a
specific creative-owned information request; no commercial value is invented.

## 5. Context resolution

The resolver considers explicit job/client names, named people and their job
participation, current page context, recent activity, and active work. One clear
match is used. Multiple materially plausible matches produce a concise
clarification. Consequential commands never silently use an ambiguous target.

## 6. Agent orchestration

The initial toolset searches jobs and relationships, summarizes Today or a job,
resolves producer/client/job references, inspects active dependencies and
artifacts, records supported explicit treatment decisions, prepares the related
response through the shared command, and returns links and approval state.

Unsupported requests receive an honest capability boundary. No response may
claim a mutation or external execution unless the command and event succeeded.

## 7. State invariants and recovery

- `awaiting_decisions` requires an unresolved creative dependency.
- `awaiting_approval` requires a current approval action and artifact.
- `awaiting_external` identifies an active external dependency.
- resolved, future-deferred, obsolete, and superseded records are not active.
- a completed decision action never becomes a preparation or approval action.
- a failed preparation retains its identity and can be retried idempotently.
- retry cannot duplicate the authorized decision or communication artifact.
- automatic processing is idempotent and bounded.
- overlapping holds share a conflict identity based on the involved active
  hold records; resolving a hold reevaluates the shared action for every
  affected job.
- communication approval, handoff, and delivery assertion remain distinct.
- a hold priority preference is internal metadata on the shared conflict; it
  cannot confirm a booking or release a hold;
- invoice draft approval is not invoice issuance or delivery;
- historical agent messages remain immutable while their linked operation may
  expose one separately resolved current-outcome card.

## 8. Intended versus implemented

This document is the intended contract. `PROJECT_STATE.md` is authoritative for
what is implemented. `IMPLEMENTATION.md` records sequencing and acceptance
coverage. Where they differ, the project-state limitation describes reality.

## 9. Temporal context

Agent instructions have a durable instruction timestamp. Relative business
dates such as “tomorrow” are resolved once against that timestamp and the
configured business timezone, then stored with the authoritative dependency
and preparation action. Retries reuse the saved decision, condition, and
resolved date. Review may show both the conversational phrase and its anchored
calendar date. Historical values are not reconstructed when original context
is insufficient.

## 10. Composable tool execution

Ask Repd now uses a bounded, one-tool-at-a-time orchestration loop. The model
selects one authorized tool, its Zod input is validated, the operation runs,
and the structured observation is returned before the next selection. The
default ceiling is eight steps and 80,000 serialized context characters
(`AGENT_MAX_STEPS` and `AGENT_MAX_CONTEXT_CHARS`, both hard-capped). Completed
commands and run events are durable; hidden reasoning is neither stored nor
shown.

The registry exposes these deliberately small primitives:

| Tool                             | Risk                 | Authority                                     |
| -------------------------------- | -------------------- | --------------------------------------------- |
| `search_business_records`        | read                 | Jobs, clients, and job participants           |
| `read_job_state`                 | read                 | Canonical Job Workspace projection            |
| `read_workspace_attention`       | read                 | Canonical Today projection                    |
| `inspect_job_evidence`           | read                 | Job fields, sources, and communications       |
| `inspect_agent_history`          | read                 | Durable messages in the current thread        |
| `record_treatment_commitment`    | prepare for approval | Existing treatment command and semantic guard |
| `prepare_producer_communication` | prepare for approval | Idempotent action and draft command           |
| `create_conditional_follow_up`   | internal write       | Canonical deferred action                     |
| `prepare_ready_invoices`         | prepare for approval | Source-backed invoice draft command           |

Every tool is workspace-scoped. Write tools authorize referenced jobs and
participants, use stable deduplication keys, and emit action or agent-run
events. There is no SQL tool and no general record-mutation tool.

Conditional follow-ups are deferred actions, not a reminder subsystem. On
workspace reevaluation, a due follow-up checks the linked communication. If it
was never confirmed sent, the action asks the user to complete handoff rather
than claiming a late reply. If it was sent, Repd looks only for a later incoming
source recorded in Repd; it never claims to inspect an inbox. The action is
resolved when such a source exists and otherwise becomes current attention.
