# Repd v2 UX audit and implementation plan

**Status:** Core UX implemented; persistent application canvas refinement completed

**Audit date:** 2026-11-18

**Last implementation update:** 2026-11-19
**North star:** Repd should feel like someone competent has already been working on your behalf before you even open the application.

## 1. Executive summary

Repd does not need a new domain model or a chatbot-led rewrite. The repository already has most of the difficult foundations required by the agreed direction:

- Today and Jobs consume a canonical workspace projection.
- Jobs, actions, objectives, dependencies, sources, revisions, communications, invoice drafts, approvals, and agent execution are durable relational records.
- Structured UI and the agent share a meaningful subset of command services.
- Proposed and confirmed facts are distinct, and consequential actions retain explicit approval boundaries.
- Agent messages, runs, operational events, and current outcomes are persistent.
- Prepared communications and invoices already use focused, action-backed review routes.

The UX evolution should therefore be implemented as a staged shell and presentation refactor over the existing business model. The main architectural additions are:

1. a collapsible workspace shell with a smaller, tiered navigation model;
2. a decomposed Job Workspace built from the existing canonical projection;
3. an on-demand contextual agent surface with a keyboard shortcut and focus management;
4. a read-model projection that merges business activity, incoming sources, action transitions, and agent run events into one job timeline; and
5. richer inline projection metadata so source-backed changes and prepared artifacts can be shown where they belong without creating a second task or proposal system.

The largest constraint is that Repd has no background worker or external sync. Current “background” behavior is synchronous or opportunistically triggered by page requests. The new experience can make completed and in-progress work quieter, but it must not imply continuous autonomous processing, inbox access, calendar sync, delivery, invoice issuance, or payment reconciliation.

### Approved architecture decisions

The following decisions are binding for implementation:

- `Mod+K` opens the contextual agent. A future global search/command surface must use a different binding or explicitly resolve the conflict.
- `/agent` remains a supported expanded fallback, but Ask Repd is removed from primary navigation.
- `/contacts` becomes the canonical combined directory. Existing `/people/[id]` and `/organizations/[id]` detail URLs remain stable.
- Sidebar collapse preference is device-local and does not add a user-preference model.
- The unified timeline shows meaningful business events by default. Historical attribution is conservative: records without reliable actor linkage use neutral source/system language.
- Deterministic reevaluation remains synchronous, server-side, and idempotent. It runs after relevant mutations rather than during page reads. No background worker is added.
- The notification bell is confirmed inert in the current shell and will be removed.

### Persistent application canvas implementation (2026-11-19)

The shell and navigation refinement is complete. The implementation deliberately
keeps the existing `(workspace)` App Router layout as the persistent boundary;
it does not add a custom router, client business-state store, or new route
hierarchy.

Architectural decisions implemented in this pass:

- `WorkspaceShell` now renders a warm neutral outer canvas, a visually integrated
  collapsible sidebar, and a bordered 12 px inset workspace surface. The shell,
  sidebar, agent panel, and global utility remain mounted while App Router client
  navigation replaces route content.
- `WorkspaceViewport` owns the compact workspace breadcrumb header and the one
  independent route-content scroll container. Static routes are mapped to
  workflow labels; dynamic job, action, inquiry-review, person, and organization
  routes expose only the labels needed for contextual breadcrumbs through DOM
  data attributes. Canonical URLs are unchanged.
- Internal navigation continues to use Next.js `Link`. A restrained workspace
  `loading.tsx` keeps the canvas and shell interactive while dynamic route data is
  pending. No transition animation or artificial delay was added.
- Scroll position is stored per pathname and query string in session storage
  immediately before link and browser-history navigation, then restored after
  the destination route commits. This preserves Today/list context across
  focused review navigation and naturally preserves URL-backed filter/sort state.
- Ask Repd now has one global launcher in the bottom-right utility area of the
  outer canvas. The sidebar and old header shortcut are removed; the existing
  `Mod+K`, contextual job/field capture, panel session, approval logic, mobile
  modal behavior, and focus restoration remain unchanged.
- Desktop uses the inset canvas and utility strip, tablet retains manual sidebar
  collapse and agent reflow, and mobile switches to a full-width single-scroll
  workspace with overlay navigation and a persistent agent launcher.

Regression coverage now verifies shell identity across Jobs → Job → Review,
workflow breadcrumbs, Back/Forward, Today scroll restoration, the single global
agent launcher and focus lifecycle, direct dynamic routes through existing
coverage, and desktop/mobile navigation behavior.

Known limitations are intentionally narrow: breadcrumb labels for dynamic routes
hydrate from the rendered route context (with generic labels during the shortest
loading interval), scroll restoration is tab-scoped rather than account-scoped,
and the current Jobs page has no filters or sort controls to preserve beyond its
URL. Cold direct visits still authenticate and render server data before the
workspace layout is available; warm client navigation retains the persistent
shell and loading boundary.

## 2. Audit scope and sources

This plan is based on the current repository, including:

- the installed Next.js 16 App Router documentation in `node_modules/next/dist/docs/`;
- `PROJECT_STATE.md`, `IMPLEMENTATION.md`, and the two product/architecture contracts in `docs/`;
- every current workspace route under `src/app/(workspace)`;
- the Drizzle schema and migrations;
- canonical workspace projections, action reevaluation, command services, and agent orchestration;
- shared UI, editors, global styles, and navigation components; and
- Vitest and Playwright coverage.

The existing product and architecture documents are directionally consistent with this brief. Where those documents describe intent more strongly than the code supports, this plan treats the code and tests as shipped reality.

## 3. Existing application architecture

### 3.1 Framework and routing

- Next.js 16 App Router, React 19, and TypeScript 5.9.
- File-system routes live under `src/app`; route groups separate authentication and workspace layouts without changing URLs.
- Pages and layouts are React Server Components by default. Client Components are used for navigation state, forms, editors, retries, and the agent panel.
- The root and workspace layouts are explicitly dynamic. The application reads the database directly from Server Components rather than through an internal JSON API.
- Mutations use authenticated Server Actions, followed by `revalidatePath` and, for workflow transitions, redirects.
- The only Route Handler is `/api/health`.

This is a server-first application, not a client-side SPA with an API layer. The UX plan should preserve that boundary. Interactive shell state and keyboard handling belong in small Client Components; business reads and writes should remain server-side.

### 3.2 State management

There is no global client state library.

- Durable state is held in PostgreSQL-shaped tables through Drizzle and PGlite.
- Route state uses path segments and query parameters, for example Calendar month/view.
- Form state uses React `useActionState` and Server Actions.
- Short-lived UI state uses local `useState`/`useTransition`, for example agent open/width, dirty editor state, and handoff state.
- Cross-surface business state comes from `getJobWorkspaceState` and `getWorkspaceTodayState`.

This is appropriate for the product. A new global store is not required for the redesign. A small shell-level client context may be useful for sidebar and agent presentation state, but it must not become a parallel business-state store.

### 3.3 Data and backend boundary

- Drizzle ORM targets PGlite at runtime. The schema and migrations are PostgreSQL-oriented, but hosted PostgreSQL wiring is not implemented.
- `requireContext()` validates the signed session and workspace membership before server reads and writes.
- Business writes are divided between:
  - general authenticated Server Actions in `src/lib/server-actions.ts`;
  - intake, preparation, approval, and delivery-state actions in `src/lib/agent-actions.ts`;
  - shared intake/reconciliation services in `src/lib/services/intake.ts`; and
  - bounded agent commands in `src/lib/agent-business-commands.ts` and `src/lib/agent-tools.ts`.
- `src/lib/action-engine.ts` deterministically reevaluates missing information, hold conflicts, conditional follow-ups, and invoice readiness.
- `src/lib/workspace-state.ts` is the main read-model boundary for Today, Jobs, Job Workspace, and agent read tools.

The frontend/backend boundary is consequently “Server Components and Server Actions over shared domain services,” not REST. New UX contracts should be implemented as server-only projection functions and typed view models.

### 3.4 Styling and component system

- Tailwind CSS 4 is imported, but the application is styled primarily with a single large global stylesheet and semantic class names.
- Icons come from `lucide-react`.
- There is no third-party component library or formal design-system package.
- Shared primitives are currently CSS conventions rather than React abstractions: `.button`, `.badge`, `.card`, `.field`, `.form-message`, `.tabs`, `.record-row`, `.state-pill`, and related layout classes.
- Many pages also use inline styles, and route files own substantial presentation markup.

Current root tokens in `src/app/globals.css` are:

| Token | Current purpose |
| --- | --- |
| `--ink` | Primary text |
| `--muted` | Secondary text |
| `--paper` | App background |
| `--card` | Raised surface |
| `--line` | Borders/dividers |
| `--accent` | Lime highlight |
| `--accent-dark` | Primary dark action |
| `--terracotta` | Failure/exception |
| `--blue` | Waiting/informational state |
| `--shadow` | Elevated surface shadow |

The existing tokens are usable but incomplete. The implementation should extend them with neutral surface, hover, focus, selected, and semantic status aliases rather than introducing a second styling system. Typography currently mixes Arial and Georgia; the agreed restrained utility-first direction should reduce editorial display styling on operational screens while preserving a modest brand voice in briefings.

### 3.5 Canonical models already worth preserving

Business truth is stored in `jobs`, `people`, `organizations`, `affiliations`, `job_participants`, `holds`, `sources`, `job_fields`, `job_field_revisions`, `communications`, and `invoice_drafts`.

Coordination is stored in `coordination_objectives`, `coordination_dependencies`, `coordination_date_options`, `actions`, and `action_events`.

Interaction/execution history is stored in `activities`, `agent_threads`, `agent_messages`, `agent_runs`, and `agent_run_events`.

These boundaries already match the product direction. In particular, actions should remain the only durable unit of work. The UX redesign must not add a separate “agent contribution,” “proposal,” notification, or generic task table unless a later implementation proves the existing records cannot carry a required invariant.

## 4. Navigation audit

### 4.1 Current shell

`src/app/(workspace)/layout.tsx` renders:

- a fixed 248 px dark sidebar;
- brand and workspace name;
- `AppNav`;
- user identity and sign-out;
- a sticky top bar with a currently inert notification button;
- the route content;
- a five-item mobile bottom navigation; and
- one persistent `AgentPanel`.

The shell already supports agent-panel reflow through CSS classes on `<html>`, including a wider panel state and full-screen mobile treatment. It does not support sidebar collapse, shell-level focus handling, or saved display preferences.

### 4.2 Current route map

| Destination | Route | Current role |
| --- | --- | --- |
| Today | `/` | Canonical attention briefing |
| Jobs | `/jobs` | Canonical job list |
| Job Workspace | `/jobs/[id]` | Main business workspace |
| New job | `/jobs/new` | Manual creation |
| Producer update | `/jobs/[id]/response` | Paste incoming update |
| Calendar | `/calendar` | Month/agenda holds and conflicts |
| Relationships list | `/people` | Combined people and organizations directory |
| Person | `/people/[id]` | Person, affiliations, and job history |
| Organization | `/organizations/[id]` | Organization, people, and job history |
| Action history | `/actions` | Open and resolved durable actions |
| Action review | `/actions/[id]` | Focused communication, hold, invoice, or fallback review |
| Ask Repd | `/agent` | Expanded version of the universal agent |
| New inquiry | `/inquiries/new` | Source-preserving inquiry intake |
| Intake review | `/inquiries/review/[id]` | Reconciliation and acceptance |

There is no `/companies` route. “Companies” are represented by the `organizations` table and detail route. The existing `/people` list already queries and displays both models, so a unified Contacts destination is primarily an information-architecture and route-label change, not a data merge.

### 4.3 Current navigation behavior

- `AppNav` and `MobileNav` use `usePathname()` and Next `<Link>` active-state matching.
- Primary navigation currently contains Today, Jobs, Calendar, Relationships, and Ask Repd at the same level.
- The sidebar is not collapsible.
- Mobile uses a fixed five-item bottom bar.
- No application keyboard shortcuts or keyboard command layer exist.
- The agent panel has explicit open, close, and width buttons, but no shortcut, Escape handling, focus trap, or focus restoration.
- Several older links still target `#coordination` or `#active-work`, while the current Job Workspace exposes `#next-steps`. These stale anchors are a concrete navigation regression risk.

### 4.4 Proposed navigation

Desktop sidebar:

1. **Primary:** Today, Jobs.
2. **Secondary:** Calendar, Contacts.
3. **Utilities:** workspace/account controls; Ask Repd is a shortcut/button, not a peer destination.

Recommended route treatment:

- Keep `/` and `/jobs` canonical.
- Keep `/calendar` canonical.
- Add `/contacts` as the canonical combined directory, reusing the current people/organization queries and forms.
- Redirect `/people` to `/contacts` after internal links are updated.
- Initially retain `/people/[id]` and `/organizations/[id]` as stable detail routes. Renaming every detail URL adds migration and link risk without improving the first UX increment.
- Keep `/agent` as an expanded/deep-link fallback that uses the same conversation component, but remove it from primary navigation.
- Keep `/actions` as history accessible from Today and focused contexts, not as a primary product destination.
- Keep `/actions/[id]`, inquiry routes, and producer-update routes as focused workflows.

The collapsible state should have three desktop modes: expanded, icon rail, and mobile-hidden. Persist the preference device-locally in a cookie or local storage; do not store it in the business database. Use a Client Component only around the shell chrome, leaving route content server-rendered.

## 5. Today audit

### 5.1 Current data and prioritization

`src/app/(workspace)/page.tsx`:

1. authenticates the workspace;
2. calls `reevaluateWorkspace()`;
3. reads `getWorkspaceTodayState()`; and
4. renders a briefing, user attention, background work, waiting conditions, and collapsed recent changes.

`getWorkspaceTodayState()` builds every job through `getJobWorkspaceState()`, deduplicates cross-job actions, ranks work, and separates it by responsibility.

Priority is deterministic in `src/lib/workspace-state-rules.ts`:

1. failed execution;
2. pending approval or approved handoff;
3. inquiry/treatment decisions;
4. urgent work such as conflicts;
5. executing work;
6. blocking work;
7. routine work; and
8. optional work.

Resolved, superseded, future-deferred, dependency-satisfied, answered, and obsolete items are filtered from canonical active work. Shared hold conflicts are deduplicated across jobs.

### 5.2 How actions relate to jobs

- Actions may belong to a job and optionally an objective and person.
- Shared hold conflicts are stored once with `jobIds` and `holdIds` in payload and projected into each affected job.
- Waiting-on-others items are projected from external coordination dependencies rather than duplicated as actions.
- Prepared communications and invoices link back to their governing action.
- Today links to the action review route or the relevant job workflow.

### 5.3 Assessment

Today is already an action-oriented homepage and is close to the agreed direction. It correctly separates “Needs you,” “Repd is handling,” and “Waiting on others,” and keeps recent changes collapsed.

The redesign should refine hierarchy, density, language, and inline result presentation rather than replace its data source. Specific issues to address are:

- `reevaluateWorkspace()` mutates durable data during a page read. This is currently how deterministic maintenance happens, but it couples dashboard latency and correctness to navigation.
- Today and Jobs both trigger reevaluation, while Job Workspace does not. State freshness can therefore depend on which page the user opened.
- `getWorkspaceTodayState()` has an N+1-shaped query pattern: it loads every job, then runs each job projection and objective dependency queries. This is acceptable for the demo dataset but is a scaling constraint.
- Recent changes use only `activities`, so they do not yet represent the promised unified activity model.
- The page truncates attention to five items without an explicit “more” count or canonical overflow destination.

## 6. Jobs audit

### 6.1 Current list

`src/app/(workspace)/jobs/page.tsx` already uses `getWorkspaceTodayState()`, so “Next need” is derived from the same projection as Today and the agent. This should be preserved. The current list is a simple four-column card/table and can be restyled without backend work.

### 6.2 Current Job Workspace component tree

`src/app/(workspace)/jobs/[id]/page.tsx` is a 651-line Server Component. Its effective tree is:

```text
JobDetail
├── Job header
│   ├── client/type/title/status
│   ├── add producer update
│   └── primary next action
├── update notice
├── Current situation
│   ├── canonical summary
│   ├── canonical facts
│   └── recorded treatment commitment
├── Next steps
│   ├── Needs you
│   │   ├── work item / focused action link
│   │   ├── retry preparation
│   │   └── treatment decision form
│   ├── Repd is handling
│   └── Waiting on others
└── Business record
    ├── overview fact grid
    ├── dates and holds
    ├── people and organizations
    ├── questions, communications, and artifacts
    ├── activity and sources
    ├── sources and confidence
    └── edit job details
```

The information architecture is directionally correct, but the route owns too much query and rendering logic. It reads the canonical projection and then separately re-queries organizations, participants, holds, activities, fields/revisions, questions, sources, and communications. Several of those records are already available in the projection, creating drift and duplicated work.

### 6.3 Fetching and mutation paths

Reads:

- `getJobWorkspaceState()` joins the job/client and loads actions, objectives, dependencies, date options, communications, invoice drafts, active questions, activities, sources, holds, and accepted field revisions.
- The page then performs additional direct Drizzle reads for editable forms and disclosure content.

Writes:

- General job, participant, hold, and relationship edits use `src/lib/server-actions.ts`.
- Inquiry and producer-update intake use `src/lib/agent-actions.ts` and `src/lib/services/intake.ts`.
- Treatment decisions and retries use shared intake commands.
- Communication edit, rewrite, approval, handoff, and sent confirmation use `src/lib/agent-actions.ts`.
- Invoice preparation, editing, and approval use `src/lib/agent-actions.ts`.
- Hold preference and hold transitions use `src/lib/server-actions.ts`.

The services enforce workspace scope and preserve the distinction between internal approval and external execution. The UX changes should continue to call these commands rather than writing directly from new components.

### 6.4 Source-backed fields, confidence, and reconciliation

- Canonical job columns hold the current business record.
- `job_fields` identifies tracked fields and their current accepted revision.
- `job_field_revisions` stores source reference, value, information state, confidence, and review status.
- `sources` preserves incoming/outgoing/internal evidence.
- `intake_reviews` stores model proposals and match candidates before acceptance.
- `acceptIntakeReview()` and related services reconcile accepted source claims into the durable Job and revisions.
- Proposed budget and confirmed/agreed fee are separate. Selected dates and confirmed bookings are separate. Requested holds and active holds are separate.

The Job Workspace currently shows confidence as a separate disclosure, while the visible fact grids reconstruct some values directly from `jobs`. To make agent work feel inline, the projection should return each display fact with its accepted revision state, source reference, and last meaningful update, allowing provenance to sit beside the field rather than in a disconnected section.

### 6.5 Documents, communications, invoices, and approvals

- “Documents” are currently source records with text previews; there is no file/object storage or attachment model.
- Communications are editable drafts linked to actions. Approval changes internal state only. Copying/opening records handoff; a separate explicit action records sent state.
- Communication revision is an integer on the current row, not a separate immutable revision table.
- Invoice drafts are internal structured records with line items, billing data, terms, notes, and draft/ready/approved status.
- Invoice approval does not number, issue, send, or mark the job invoice as sent.
- Focused review is already centralized at `/actions/[id]` through `CommunicationEditor` and `InvoiceDraftEditor`.

These workflows match the proposed approval boundary and should be visually integrated into the job as compact current-state cards, while retaining the focused action route as the only editor/review surface.

### 6.6 Current activity and source history

The job page has one disclosure that serially renders:

- `activities` summaries; then
- `sources` as expandable text records.

It does not include action transitions or agent run events, and it is not chronologically merged. Agent execution details live only in the conversation result. Therefore, the agreed unified activity timeline does not yet exist.

## 7. Agent audit

### 7.1 Entry points

- A persistent launcher/panel is mounted in the workspace layout.
- `/agent` renders the same `AgentPanel` in expanded mode.
- The panel derives current job context from `/jobs/[id]` in the pathname.
- “Revise with Repd” inside the communication editor is a separate scoped AI preparation action, not part of the universal conversation.
- Inquiry extraction and response preparation are other agent-assisted entry points, but they remain structured workflows.

### 7.2 Persistence and session behavior

- `agent_threads` stores active/archived durable conversations and optional latest job context.
- `agent_messages` stores immutable user/assistant messages, job context, links, and related action/communication identifiers.
- `agent_runs` stores one execution per user instruction with status and affected record IDs.
- `agent_run_events` stores ordered operational events.
- The shell loads the latest active workspace thread. Closing the panel does not delete it.
- Current outcomes are reconciled from the latest action/communication state and attached to historical assistant messages, avoiding a false stale failure state.

Current UI state has two limitations: after a submission, the response is displayed separately rather than appended to the local message list, and the panel has no thread chooser or explicit new-conversation control. Neither is a blocker for the agreed single durable contextual conversation, but the component should be decomposed before adding shortcut/focus behavior.

### 7.3 Capabilities and supported mutations

The bounded model-directed loop permits one validated tool per step, up to configured step/context ceilings. Current tools are:

- search business records;
- read canonical job state;
- read canonical workspace attention;
- inspect job evidence;
- inspect current thread history;
- record a treatment commitment and prepare its approval-gated reply;
- prepare an approval-gated producer communication;
- create an internal conditional follow-up over Repd records; and
- prepare eligible internal invoice drafts.

There is no general SQL or arbitrary record mutation tool. Arbitrary commercial-field mutation, direct deadline rewriting, external delivery, inbox monitoring, invoice issuance, and payment updates are unsupported.

### 7.4 Execution and background behavior

- A user instruction creates a message and run synchronously.
- Each successful tool call writes a presentation event such as search, check, record change, artifact preparation, or approval required.
- Failed operations write a durable failure event and preserve already completed durable commands.
- Hidden reasoning is not stored or displayed.
- Automatic intake/preparation may perform one bounded provider retry for transient failures.
- Conditional follow-ups are reevaluated during normal workspace reevaluation, not by a scheduler.

There is no job queue, worker, subscription, push channel, or continuous background process. “Repd is handling” can accurately describe a synchronous executing action, but the UX must not show fabricated progress after the request has ended or imply the app is monitoring external systems.

### 7.5 Representation in persistent data

Agent effects are not stored in chat alone:

- decisions update dependencies and actions;
- drafts are `communications` or `invoice_drafts` linked to actions;
- follow-ups are deferred actions;
- execution is represented by agent runs/events;
- approval and handoff are action/communication transitions; and
- the assistant message links to the affected action/communication.

This is the correct foundation for inline agent results. The UI should resolve from business records first and show the agent run as provenance, not treat message content as the result.

## 8. Proposed component structure

The following structure keeps route files thin without forcing a new frontend architecture:

```text
src/components/shell/
├── workspace-shell.tsx          # client shell state only
├── sidebar.tsx                  # expanded/icon-rail presentation
├── primary-nav.tsx              # Today and Jobs
├── secondary-nav.tsx            # Calendar and Contacts
├── mobile-nav.tsx
└── agent-launcher.tsx           # shortcut button and accessible trigger

src/components/agent/
├── agent-surface.tsx            # shared docked/full-screen/expanded shell
├── agent-conversation.tsx
├── agent-composer.tsx
├── agent-execution-details.tsx
├── agent-current-outcome.tsx
└── agent-shortcut.tsx           # key binding, Escape, focus restoration

src/components/jobs/
├── job-header.tsx
├── job-situation.tsx
├── job-next-steps.tsx
├── work-owner-group.tsx
├── inline-contribution.tsx
├── job-facts.tsx
├── job-artifacts.tsx
├── job-activity-timeline.tsx
├── job-record-disclosures.tsx
└── provenance-popover.tsx

src/components/contacts/
├── contacts-directory.tsx
├── people-list.tsx
├── companies-list.tsx
└── contact-create-panel.tsx

src/components/ui/
├── button.tsx                   # optional thin class wrapper
├── badge.tsx
├── disclosure.tsx
├── empty-state.tsx
└── status-indicator.tsx
```

The `ui` wrappers should only be introduced when they remove repeated accessibility or state logic. Purely visual one-off markup can remain route-local. Do not replace all existing markup in one sweep.

Server-side view-model modules should sit next to the existing projection boundary:

```text
src/lib/workspace-state.ts       # canonical business/attention state
src/lib/job-activity.ts          # merged timeline projection
src/lib/job-contributions.ts     # inline result projection, if not folded into workspace-state
```

`src/app/(workspace)/jobs/[id]/page.tsx` should orchestrate these sections, not own their query logic.

## 9. Proposed data contracts

These are read contracts over existing durable records. They are not proposals for new persistent tables.

### 9.1 Inline agent contribution

```ts
type InlineContribution = {
  id: string;
  jobId: string;
  kind:
    | "field_revision"
    | "communication_draft"
    | "invoice_draft"
    | "recorded_decision";
  placement: {
    section: "facts" | "schedule" | "artifacts" | "next_steps";
    fieldKey?: string;
  };
  state:
    | "applied"
    | "ready_for_review"
    | "approved"
    | "failed"
    | "superseded";
  title: string;
  summary: string;
  occurredAt: Date;
  action?: {
    id: string;
    status: Action["status"];
    executionStatus: Action["executionStatus"];
    reviewHref: string;
    requiresApproval: boolean;
  };
  artifact?: {
    type: "communication" | "invoice_draft";
    id: string;
    status: string;
  };
  provenance: Array<{
    type: "source" | "field_revision" | "agent_run" | "user_decision";
    id: string;
    label: string;
  }>;
};
```

Projection rules:

- A field revision appears beside its field only after the current accepted revision is known. Pending intake proposals remain in the existing intake review workflow.
- A prepared communication or invoice appears as a compact inline artifact card and links to `/actions/[id]`; it does not mount a second editor.
- A failed preparation appears in the relevant next-step/artifact position with the existing idempotent retry.
- “Repd did this” attribution is shown only when a durable run/action/source link supports it. Current field revisions do not store an agent-run ID, so unlinked revisions must be described as source-backed updates, not specifically as agent-authored work.
- Completed, superseded, or stale contributions should collapse into field provenance or timeline history rather than remain as competing tasks.

### 9.2 Unified job activity item

```ts
type JobActivityItem = {
  id: string; // namespaced by source table
  jobId: string;
  occurredAt: Date;
  category: "human" | "incoming" | "agent" | "system";
  kind:
    | "business_change"
    | "source_received"
    | "action_transition"
    | "artifact_prepared"
    | "approval"
    | "handoff"
    | "delivery_confirmation"
    | "agent_operation"
    | "failure";
  summary: string;
  detail?: string;
  status?: "completed" | "pending" | "failed";
  actor?: {
    type: "user" | "repd" | "external" | "system";
    id?: string;
    label: string;
  };
  object?: {
    type: "job" | "field" | "source" | "action" | "communication" | "invoice";
    id: string;
    href?: string;
  };
  provenance?: Array<{ type: string; id: string; label: string }>;
  correlationKey?: string;
};
```

Initial projection sources:

- `activities` for summarized business changes and known human actions;
- incoming `sources` for external updates;
- `action_events` joined through `actions.job_id` for lifecycle, retry, approval, handoff, and resolution changes;
- `agent_run_events` with matching `job_id` for actual agent operations; and
- communication state events where an existing `action_event` already records the transition.

Deduplication is essential. One command can currently produce an activity, action event, agent run event, and changed artifact. The timeline projection should choose one primary item and attach the others as provenance using explicit IDs and event metadata. If stable correlation cannot be derived for important flows, backend work should add correlation metadata to the existing event records before considering a new timeline table.

### 9.3 Source-aware displayed fact

```ts
type DisplayedJobFact = {
  key: string;
  label: string;
  value: string;
  informationState: "confirmed" | "proposed" | "unconfirmed" | "missing" | "conflicting";
  confidence?: number;
  acceptedRevisionId?: string;
  source?: { id: string; label: string; capturedAt: Date };
  updatedAt: Date;
};
```

This contract should replace page-level inference for visible facts where a tracked field exists. Domain-specific facts such as booking state and hold state can remain derived from their authoritative tables.

## 10. Requirements supported by existing infrastructure

| Requirement | Existing support | UX work still needed |
| --- | --- | --- |
| Today and Jobs primary | Routes, canonical projections, current nav | Tiered sidebar and visual hierarchy |
| Calendar secondary | Existing month/agenda route and hold logic | Move to secondary nav; align styling |
| Unified Contacts | `/people` already queries both models | Canonical `/contacts`, terminology, redirects |
| Collapsible sidebar | Grid shell already supports panel reflow | Client shell state, icon rail, persistence, tests |
| Job pages as workspace | Current situation/next steps/business record | Decompose and tighten hierarchy |
| Inline prepared work | Actions link to communications/invoices | Inline contribution projection/cards |
| On-demand contextual agent | Persistent panel, pathname job context, shared `/agent` component | Shortcut, focus behavior, remove primary nav placement |
| Quiet background work | Responsibility groups and event records | Suppress routine execution detail; surface only result/exception/decision |
| Approvals/provenance/reconciliation | Existing models and commands | Preserve in new components and add regression coverage |
| Focused reviews | `/actions/[id]` and current editors | Keep as single edit surface; improve return context |

## 11. Requirements needing backend or projection work

### Required for the agreed UX

1. **Unified activity projection.** Existing events are split across four record families and are not chronologically merged or reliably deduplicated.
2. **Source-aware fact projection.** The job page currently reconstructs display facts separately from revision/provenance rows.
3. **Inline contribution projection.** Existing artifacts and actions can supply it, but the job read model needs a stable typed contract.
4. **Freshness boundary.** Deterministic, idempotent reevaluation should run after relevant mutations rather than only Today and Jobs page reads. It remains synchronous; no worker is introduced.
5. **Projection query consolidation.** The current per-job/per-objective reads should be batched before workspace size makes Today slow.

### Not supported and explicitly out of scope until separately approved

- true asynchronous background work or scheduled execution;
- inbound email/calendar/accounting sync;
- direct email delivery;
- attachment/file/OCR document ingestion;
- invoice numbering, issuance, delivery, or payment reconciliation;
- arbitrary agent mutation of job fields; and
- real-time push updates.

The UX must use honest language around these limitations.

## 12. Specific files expected to change

### Shell and navigation

- `src/app/(workspace)/layout.tsx`
- `src/components/app-nav.tsx` (replace or split)
- `src/app/globals.css`
- new `src/components/shell/*`
- `src/components/agent/agent-panel.tsx` (decompose/rename while preserving behavior)

### Routes

- `src/app/(workspace)/page.tsx`
- `src/app/(workspace)/jobs/page.tsx`
- `src/app/(workspace)/jobs/[id]/page.tsx`
- `src/app/(workspace)/calendar/page.tsx`
- `src/app/(workspace)/people/page.tsx` (redirect or compatibility wrapper)
- new `src/app/(workspace)/contacts/page.tsx`
- `src/app/(workspace)/people/[id]/page.tsx`
- `src/app/(workspace)/organizations/[id]/page.tsx`
- `src/app/(workspace)/agent/page.tsx`
- `src/app/(workspace)/actions/page.tsx`
- `src/app/(workspace)/actions/[id]/page.tsx`

### Read models and commands

- `src/lib/workspace-state.ts`
- `src/lib/workspace-state-rules.ts`
- new `src/lib/job-activity.ts` or equivalent projection module
- `src/lib/action-engine.ts`
- `src/lib/agent-workspace.ts`
- possibly `src/lib/services/intake.ts`, `src/lib/agent-actions.ts`, `src/lib/server-actions.ts`, and `src/lib/agent-business-commands.ts` only to add consistent event/correlation metadata—not to change approval semantics

### Reusable workflow components

- `src/components/agent/communication-editor.tsx`
- `src/components/agent/invoice-draft-editor.tsx`
- `src/components/agent/retry-preparation-form.tsx`
- `src/components/action-list.tsx`
- `src/components/forms.tsx`
- new `src/components/jobs/*`, `src/components/contacts/*`, and selective `src/components/ui/*`

### Tests and documentation

- `tests/workspace-state-rules.test.ts`
- new projection tests for job activity and inline contributions
- `tests/database-integration.test.ts`
- `tests/workspace-schema.test.ts` if event metadata/schema changes
- `e2e/core.spec.ts` or split UX-focused Playwright specs
- `PROJECT_STATE.md`, `IMPLEMENTATION.md`, and product docs after implementation reality changes
- a forward-only Drizzle migration only if correlation/actor fields prove necessary

## 13. Recommended implementation sequence

### Phase 0 — Lock contracts and baselines

1. Record the approved navigation, shortcut, route, sidebar, timeline, reevaluation, and notification decisions in the implementation checkpoint.
2. Capture baseline screenshots and run the existing `pnpm check`, `pnpm build`, and `pnpm test:e2e` gates against the isolated E2E database.
3. Add tests for the currently stale job anchors before changing routes.

No schema or product behavior changes in this phase.

### Phase 1 — Shell and navigation

1. Extract `WorkspaceShell`, `Sidebar`, desktop nav sections, and mobile nav.
2. Add expanded/icon-rail sidebar behavior and persisted preference.
3. Make Today and Jobs visually primary; Calendar and Contacts secondary.
4. Add `/contacts` using the current combined directory logic and redirect `/people`.
5. Remove Ask Repd from primary navigation while retaining its launcher and `/agent` fallback.
6. Remove the confirmed-inert notification button; do not leave it suggesting unsupported notifications.
7. Normalize all job anchors to `#next-steps` and add route regression tests.

### Phase 2 — Agent surface behavior

1. Decompose `AgentPanel` into surface, conversation, composer, execution details, and current outcome components.
2. Add the approved `Mod+K` keyboard shortcut for the contextual agent.
3. Add Escape-to-close, initial focus, mobile focus trap, and focus restoration.
4. Preserve the current durable thread and page-context hint.
5. Append the latest submitted turn to the live conversation presentation without waiting for a navigation refresh.
6. Keep operational detail collapsed on success and open on failure.

This phase changes presentation only; the tool registry and approval boundaries remain unchanged.

### Phase 3 — Job Workspace decomposition

1. Split the 651-line route into server-rendered sections.
2. Consolidate duplicated reads into `getJobWorkspaceState()` or a job-page view model.
3. Return source-aware displayed facts and render provenance inline.
4. Render communications and invoices as compact inline artifact cards that link to the existing action review route.
5. Keep failures and retries beside the failed artifact/work item.
6. Preserve the current situation and owner-group model, reducing repeated labels and decorative card framing.
7. Keep edit forms and deep source material progressively disclosed.

### Phase 4 — Unified activity timeline

1. Implement and unit-test `getJobActivityTimeline(workspaceId, jobId)` as a read projection.
2. Merge activities, incoming sources, action events, and agent run events.
3. Define deduplication/correlation rules for each existing command flow.
4. Render human, incoming, and Repd activity in one ordered timeline.
5. Show operational details only when expanded, failed, or materially relevant.
6. If correlation is insufficient, add minimal metadata/foreign-key columns through an additive migration and populate them for new events. Do not rewrite historical events speculatively.

### Phase 5 — Today and Jobs refinement

1. Reuse inline contribution and activity summaries to make completed Repd work visible as outcomes, not process chatter.
2. Add explicit overflow behavior when more than five attention items exist.
3. Batch workspace projection queries and measure Today latency with larger fixtures.
4. Move deterministic, idempotent reevaluation behind relevant authenticated mutations. Keep it synchronous and do not add a background worker.
5. Align Jobs density, attention language, and statuses with the new Job Workspace.

### Phase 6 — Contacts and secondary surfaces polish

1. Complete Contacts information architecture while preserving `people` and `organizations` as distinct models.
2. Align Calendar and focused action routes with the neutral component language.
3. Improve return-to-job context from action reviews.
4. Remove remaining obsolete route language and inline styling where it impedes consistency.

## 14. Validation and regression strategy

### 14.1 Automated quality gate

Run for every phase:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Use only the isolated E2E database for mutation-heavy browser tests. Do not reset or seed the retained workspace database.

### 14.2 Unit and projection tests

Add deterministic tests for:

- sidebar/nav route classification;
- canonical action ranking and owner grouping;
- inline contribution selection and supersession;
- source-aware fact state and provenance;
- timeline ordering across equal timestamps;
- timeline deduplication for one command represented by multiple events;
- actor/category inference when metadata is absent;
- stale/future-deferred/resolved event filtering; and
- source versus agent attribution rules.

### 14.3 Integration tests

Preserve or add coverage for:

- workspace authorization on every new projection;
- source acceptance creating the expected job field/revision links;
- treatment decision durability when preparation fails;
- idempotent retry and no duplicate artifact;
- one invoice draft per governing action;
- communication approval distinct from handoff and sent confirmation;
- invoice approval distinct from issuance/sent state;
- hold preference distinct from confirmation/release;
- selected date distinct from confirmed booking; and
- agent run/event links to affected records.

### 14.4 Browser acceptance scenarios

Desktop and mobile Playwright should verify:

1. sidebar expansion/collapse, persistence, active states, and keyboard navigation;
2. `Mod+K` opens the agent with current job context, Escape closes it, and focus returns to the trigger;
3. mobile agent is full-screen and does not leak focus behind the surface;
4. Today and Jobs agree on the recommended next need;
5. Contacts shows people and companies without merging their records;
6. a source-backed job update appears on the field and in the timeline with honest provenance;
7. a prepared reply appears inline, opens the focused review, and remains unsent after approval;
8. a failed preparation appears inline and retries idempotently;
9. invoice edit/approval remains internal and never changes to sent;
10. a hold preference changes neither hold nor booking status;
11. recent agent execution is collapsed on success and expanded on failure; and
12. legacy `/people` and stale saved links land on supported destinations.

### 14.5 Manual UX/accessibility review

- Check 1440 px, 1024 px, 768 px, and 390×844 layouts.
- Test long job/client names and a Today queue with more than five items.
- Test with no jobs, no sources, missing participants, failed provider configuration, and ambiguous agent context.
- Verify visible focus, logical tab order, screen-reader names, disclosure semantics, reduced motion, and contrast.
- Verify the main workspace reflows rather than being obscured by the desktop agent panel.
- Verify no UI copy implies delivery, external monitoring, booking confirmation, invoice issuance, or background processing without evidence.

## 15. Risks and constraints

### High risk

1. **Approval regression.** Combining inline artifacts with edit controls could accidentally imply approval or delivery. Mitigation: keep `/actions/[id]` as the only editor/review and preserve current commands.
2. **Duplicate truth.** The job route and projection currently compute overlapping facts. Mitigation: make the view model authoritative before restyling fields.
3. **Timeline double counting.** Existing commands emit multiple record/event types. Mitigation: define correlation and deduplication rules before rendering the unified feed.
4. **False background claims.** There is no worker or external sync. Mitigation: show durable state and completed results only; use “will check when Repd is opened/reevaluated” where applicable.
5. **PGlite deployment constraint.** Long-running work and multi-process concurrency are not supported by the current runtime architecture. Do not design real-time background UX until hosted database/worker decisions are made.

### Medium risk

1. **Monolithic CSS regression.** Global selectors and duplicate-era styles make shell changes broad. Introduce tokens and scoped component classes incrementally with screenshot coverage.
2. **Query growth.** Today performs nested job/objective reads. Batch before expecting larger workspaces.
3. **Route/link breakage.** Action lists and redirects already reference obsolete anchors. Centralize route builders or constants.
4. **Attribution gaps.** Not every field revision or activity has a direct agent run/user actor link. Never infer precise authorship without evidence.
5. **Action-history inconsistency.** `/actions` splits only on resolved status and does not use the complete canonical active-work predicate, so deferred/superseded presentation can disagree with Today.
6. **Opportunistic reevaluation.** Mutating during page reads can cause unexpected writes, request latency, and concurrency races.

### Lower risk but visible

1. The notification bell is inert.
2. The current mobile nav gives Ask Repd equal weight with core destinations.
3. Agent live messages do not fully join the visible history until refresh/navigation.
4. People/organization terminology varies among Relationships, People & organizations, organizations, and the desired Contacts/Companies language.
5. Dynamic job routes do not currently define loading UI, so server navigation can feel unresponsive as projection work grows.

## 16. Remaining non-blocking product questions

The approved architecture is sufficient to begin implementation later. These lower-level choices can be settled during visual design and acceptance without changing the architecture:

1. **Visual brand:** should Georgia remain only in the Today briefing and selected narrative summaries, or be removed entirely from workspace screens?
2. **Actions history:** should `/actions` remain a long-term user-visible history destination, or be folded into Today/Job activity after the unified timeline proves it can replace that history safely?

Until the second question is resolved, `/actions` remains available as history. Phases 1–3 require no schema migration and can reuse the current architecture. Phase 4 begins with a read projection; database fields are added only if correlation gaps are demonstrated by tests against existing workflows.
