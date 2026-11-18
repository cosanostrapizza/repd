# Repd Implementation Checkpoint

Last updated: 2026-11-17
Checkpoint: Milestone 1 complete

The product brief remains at `docs/repd-mvp-product-brief.md`. This file records what is implemented at the Milestone 1 checkpoint, the decisions that shape the code, verification results, and current limitations. It does not describe future work as shipped.

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

### 7. AI-native inquiry and coordination workflow

- Immutable-by-convention pasted sources stored before model execution with a content hash and source metadata.
- Intake review states for new job, job update, and producer response flows.
- OpenAI Responses API adapter with structured Zod parsing, configurable model, two SDK retries, 45-second timeout, and server-only credentials.
- Tracked model runs with provider, model, purpose, schema version, request ID, input hash, output or failure, duration, and timestamps.
- Extraction review with evidence, confidence, visible conflicts, correction, per-field rejection, and deliberate create/merge choice.
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

Verified at the checkpoint:

- `pnpm typecheck` — passed.
- `pnpm lint` — passed without warnings.
- `pnpm test` — 16 tests passed across six files, including structured-output validation, requirement policy, schema invariants, database migrations, approval/execution separation, workspace scoping, and database URL normalization.
- `pnpm test:e2e` — 12 journeys passed across desktop and mobile Chromium, including authentication, cross-workspace denial, inquiry review, producer email approval semantics, producer response reconciliation, living-brief editing, and scheduling conflicts.
- `pnpm build` — optimized production build passed.
- `pnpm db:migrate` — forward migrations were current and idempotent against the preserved local database.
- The exact `DATABASE_URL=file:./.repd/repd.db` form was verified after URL normalization was added.

Live OpenAI execution is implemented and can be configured locally, but it was not part of the automated verification record. Automated model-dependent journeys use a test-only deterministic provider guarded by `AI_FIXTURE_MODE=test` plus a non-production or explicit Playwright flag.

## Known limitations and technical debt

- `src/db/client.ts` always constructs PGlite. A hosted PostgreSQL driver/provider path is not wired.
- RLS policies exist, but the embedded owner connection bypasses normal RLS enforcement. Hosted use requires a non-owner role and transaction-level `app.workspace_id`; application-level workspace predicates are the active local boundary.
- The credential auth implementation has no password reset, email verification, invitation flow, rate limiting, session revocation UI, or production account recovery. The development session secret fallback must not be used in production.
- Existing-job match candidates use local title/client word overlap. There is no embedding index or model-based duplicate classifier.
- The extraction schema includes agency data, but acceptance currently persists the client organization and producer relationship; agency relationship persistence is incomplete.
- Source immutability is an application convention and metadata flag, not a database trigger or write-once permission.
- Per-field rejection prevents an overwrite but does not create a separate rejected `job_field_revision`; accepted non-null values receive revisions.
- Contextual requirement policy covers only five fields and a small set of job-type/stage rules.
- Action supersession columns exist, but an end-to-end supersede workflow is not implemented. Most obsolete work is represented as resolved with `condition_satisfied`.
- Action reevaluation scans all jobs and actions in a workspace; there is no dependency index, queue, or background worker.
- AI coordination preparation failures are recorded in `ai_runs`, but the accepted intake can complete without producing a coordination action.
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
