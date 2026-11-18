# Repd Implementation Checkpoint

Last updated: 2026-11-17
Checkpoint: Coordination-intelligence iteration complete

The product brief remains at `docs/repd-mvp-product-brief.md` for product vision and domain context. The Milestone 2 redesign supersedes conflicting interaction specifications: intake is briefing-first, job pages are living business briefs, and actions use purpose-built workspaces. This file preserves the original Milestone 1 history below and records the Milestone 2 evolution without retroactively redefining that checkpoint.

## Coordination-intelligence iteration

- Added a small persistent objective model for `advance_inquiry`: one objective per job, owned dependencies, evidence/result states, normalized date options, progress, completed steps, and a next action. This is deliberately not a generic workflow engine.
- Added forward migration `0002_coordination_intelligence.sql`, workspace predicates, RLS policies, and unique keys that prevent duplicate objectives, dependencies, date options, and inquiry actions.
- Preserved proposed budget minimum/maximum separately from `fee_cents`; added generated/source-confirmed/manual title provenance.
- Persisted accepted agency identity as an organization, job participant, and producer affiliation.
- Replaced empty-final-field action generation for objective-owned inquiries. Alternative dates no longer create “Confirm shoot date,” and one objective action groups the dependencies.
- Added deterministic checks for each date, active holds, and client history. Results distinguish verified checks, no record found, and unavailable external calendar/contract evidence.
- Added a contextual job workspace for interest, per-date requested-hold choices, and category-conflict judgment. Active holds are created only for dates explicitly authorized by the creative.
- Delayed communication generation until decisions exist. The draft receives the job facts, proposed budget, exact date decisions, internal checks, conflict qualification, and only remaining external questions.
- Extended reconciliation so accepted producer replies resolve matching dependencies/questions, preserve earlier decisions, record a before/after review, and advance the same objective/action.
- Added identical-source retry prevention and durable AI failure behavior; sources and saved decisions survive provider failures.

## Milestone 2 product evolution

- Replaced mandatory field-by-field inquiry acceptance with a structured opportunity briefing: understanding, opportunity facts, assessment, prioritized next moves, and an editable prepared response.
- Moved fields, confidence, exact evidence, corrections, rejected interpretations, and match selection into optional progressive disclosure.
- Extended the validated inquiry output with producer requests, relevant missing information, risks, recommendations, a suggested workflow state, requested-date semantics, hold-request intent, and a response draft.
- Enforced the distinction between extraction acceptance and business confirmation. A requested first/second hold is persisted as unconfirmed request intent and deterministically remains `unbooked`; date alternatives remain separate and do not populate a continuous shoot range.
- Persisted briefing analysis, source-backed request revisions, accepted-update activity, durable questions, actions, and communications so reloads retain the workflow.
- Reworked response reconciliation around a coherent summary and changed facts, with granular correction remaining optional.
- Reordered Job Detail around the current situation and prepared decisions. Alternative requested dates appear in the living brief without being represented as confirmed shoot dates.
- Added a truthful Home “Waiting on” section for asked producer questions and removed unsupported “everything is on track” language.
- Retained the specialized producer and hold workspaces and expanded invoice preparation into an editable internal preview. Saving a draft does not issue or send an invoice.

## Milestone history

Milestone 1 established the functional local foundation described in the shipped increments below. Those increments remain historically accurate and continue to underpin Milestone 2.

## Shipped increments

### 1. Application foundation

- Next.js 16 App Router, React 19, strict TypeScript, ESLint, Prettier, Vitest, and Playwright.
- Responsive application shell with editorial typography, dark green/neutral palette, desktop sidebar, and mobile navigation.
- PGlite persistence through Drizzle ORM, forward SQL migrations, idempotent representative seed data, and a health endpoint.

### 2. Identity and workspace isolation

- Email/password signup and login with bcrypt password hashes.
- Signed, HTTP-only, same-site JWT session cookie with a 14-day lifetime.
- Workspaces, memberships, and owner/member roles.
- Workspace predicates on application reads and mutations, cross-workspace not-found behavior, and RLS policies in migrations.

### 3. Jobs and living briefs

- One Job entity across inquiry, tentative, confirmed, completed, and cancelled work.
- Separate lifecycle and booking status with domain validation.
- Manual creation and explicit editing, client, job type, dates, location, proposed/confirmed fee, currency, usage, deliverables, payment terms, invoice status, notes, participants, and activity.
- Read-first Job Detail with Repd assessment, overview states, evidence register, open questions, prepared actions, activity, relationships, source documents, holds, and collapsed edit mode.

### 4. Relationships

- Independent people and organizations with workspace-scoped duplicate checks and archive timestamps.
- Temporal affiliations, primary/current organization display, reusable job participants, role snapshots, and shared-job history.

### 5. Holds and calendar

- First hold, second hold, and confirmed booking records with retained released/converted history.
- Hold confirmation and release update the same Job.
- Overlap detection, deterministic conflict actions, month navigation, Today, month/agenda views, and responsive calendar presentation.
- Legacy midnight values display as all-day rather than fabricated call times.

### 6. Durable action system

- Workspace-unique deduplication keys, structured resolution conditions, payload/schema version fields, optional idempotency keys, priorities, status, execution status, approval metadata, resolution metadata, and action events.
- Deterministic rules for hold conflicts, missing commercial usage, missing shoot date, and completed/uninvoiced work.
- Reevaluation after relevant job, hold, and accepted-source changes.
- Specialized UI dispatch for producer coordination, hold conflicts, invoice preparation, and fallback review actions.
- Producer coordination resolves when referenced questions are answered or obsolete; deterministic actions resolve when their underlying condition disappears.

### 7. AI-native inquiry and coordination workflow (Milestone 1 foundation)

- Immutable-by-convention pasted sources stored before model execution with a content hash and source metadata.
- Intake review states for new job, job update, and producer response flows.
- OpenAI Responses API adapter with structured Zod parsing, configurable model, two SDK retries, 45-second timeout, and server-only credentials.
- Tracked model runs with provider, model, purpose, schema version, request ID, input hash, output or failure, duration, and timestamps.
- Source-backed extraction with evidence, confidence, visible conflicts, correction, per-field rejection, and deliberate create/merge choice. Milestone 2 retains these capabilities behind progressive disclosure instead of making them the default gate.
- Accepted field revisions and contextual requirements for shoot date, commercial usage, location, fee, and payment terms.
- Durable questions, prepared producer email, editing, model-assisted revision/tone change, approval, copy/`mailto:` handoff, explicit sent confirmation, and pasted-response reconciliation.

### 8. Business-manager experience

- Grounded Home briefing based on stored actions and jobs, with prepared work prioritized over metrics.
- Action previews with contextual calls to action rather than generic Resolve as the primary control.
- Internal invoice draft based on stored fee and payment terms.
- Responsive desktop and mobile review/approval journeys, semantic form labels, visible state text, empty states, and error states.

## Binding implementation decisions

- Deterministic logic owns authorization, status validation, requirements, conflict detection, deduplication, and resolution. The model produces proposals and drafts.
- The database is the source of truth. Model output passes Zod validation and user review before accepted values update a Job.
- One Job persists throughout the opportunity lifecycle. Inquiry and booking are states, not separate entities.
- Approval, handoff, execution, and resolution are distinct. Copying or opening an email does not imply delivery.
- Original pasted text is stored before the model call so provider failures do not lose source material.
- People and organizations are independent reusable records; job participation preserves role context.
- Local development uses PGlite. PostgreSQL migrations and RLS policies are retained as the intended hosted contract, but hosted connection wiring is not implemented.
- The application uses straightforward services and server actions rather than an agent framework or generic chatbot.

## Verification record

Verified for the coordination-intelligence iteration:

- `pnpm typecheck` — passed.
- `pnpm lint` — passed without warnings.
- `pnpm test` — 18 tests passed across six files, including alternative-date requirements, requested-versus-granted holds, dependency ownership, proposed budget ranges, schema invariants, forward migrations, approval/execution separation, workspace scoping, and database URL normalization.
- `pnpm test:e2e` — 16 journeys passed across desktop and mobile Chromium, including the complete New Balance coordination flow, explicit hold authorization, decision-conditioned drafting, provider failure/source preservation, declines, authentication, cross-workspace denial, response reconciliation, living-brief editing, and scheduling conflicts.
- `pnpm build` — optimized production build passed.
- `pnpm db:migrate` — forward migrations were current and idempotent against the preserved local database.
- The exact `DATABASE_URL=file:./.repd/repd.db` form was verified after URL normalization was added.

Live OpenAI execution is implemented and can be configured locally, but it was not part of the automated verification record. Automated model-dependent journeys use a test-only deterministic provider guarded by `AI_FIXTURE_MODE=test` plus a non-production or explicit Playwright flag.

## Known limitations and technical debt

- `src/db/client.ts` always constructs PGlite. A hosted PostgreSQL driver/provider path is not wired.
- RLS policies exist, but the embedded owner connection bypasses normal RLS enforcement. Hosted use requires a non-owner role and transaction-level `app.workspace_id`; application-level workspace predicates are the active local boundary.
- The credential auth implementation has no password reset, email verification, invitation flow, rate limiting, session revocation UI, or production account recovery. The development session secret fallback must not be used in production.
- Existing-job match candidates use local title/client word overlap. There is no embedding index or model-based duplicate classifier.
- Requested schedule alternatives and hold intent are normalized for new-inquiry objectives and also retain accepted source provenance. Only creative-authorized holds enter the `holds` table.
- Agency identity is persisted for accepted new inquiries; richer agency history reconciliation and role changes are not modeled.
- Source immutability is an application convention and metadata flag, not a database trigger or write-once permission.
- Per-field rejection prevents an overwrite but does not create a separate rejected `job_field_revision`; accepted non-null values receive revisions.
- Contextual requirement policy covers only five fields and a small set of job-type/stage rules.
- Action supersession columns exist, but an end-to-end supersede workflow is not implemented. Most obsolete work is represented as resolved with `condition_satisfied`.
- Action reevaluation scans all jobs and actions in a workspace; there is no dependency index, queue, or background worker.
- AI communication failures are recorded in `ai_runs`; the objective enters `needs_attention` while saved decisions remain available for retry.
- Home briefing prose is deterministic. There is no live LLM-generated daily summary.
- Email uses copy and `mailto:`. “Sent” is an explicit user assertion, not provider-confirmed delivery.
- Calendar records do not store temporal precision. Midnight is inferred as all-day for presentation.
- Invoice drafts do not support invoice numbers, taxes, discounts, PDFs, delivery, accounting sync, or payments.
- There is no file upload, object storage, OCR, attachment ingestion, Gmail sync, external calendar sync, background processing, or observability service.

## Deferred work

- Real email provider and inbox ingestion.
- Hosted PostgreSQL adapter and production RLS transaction context.
- Richer reconciliation and complete organization/agency persistence.
- Typed action payload registry and broader resolution/supersession workflows.
- File/document ingestion and source management.
- Invoice document generation and accounting/payment integrations.
- Background jobs, retry orchestration, monitoring, and operational auth controls.

## Checkpoint note

The local database URL compatibility issue was fixed by normalizing both `file:./.repd/repd.db` and `file://.repd/repd.db`, deriving local parent directories consistently, and clearing a rejected migration promise so development retries are possible after transient failures or hot reloads.
