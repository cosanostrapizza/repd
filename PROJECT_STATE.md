# Repd Project State

Milestone 2 checkpoint — 2026-11-17

## 1. Product vision and UX principles

Repd is an AI-native business manager for independent commercial creatives. It should understand incoming work, maintain a living view of each job, identify meaningful exceptions, prepare concrete work, and let the creative supervise decisions.

Current UX principles:

- Agent-first and structured-interface-first; there is no generic chatbot.
- Users review decisions and prepared work by default, not database fields.
- Prepared drafts and decisions instead of generic tasks.
- Read-first living briefs with explicit edit mode.
- Contextual action workspaces for communication, scheduling, finance, and review.
- Visible evidence, confidence, proposed/confirmed states, and missing information.
- User approval before consequential action; approval is not execution.
- Grounded, exception-driven briefing with no invented external events.

## 2. Architecture and key files

- Next.js 16 App Router and React 19 modular monolith.
- Server Components for reads and Server Actions for mutations.
- TypeScript, Drizzle ORM, and local PGlite persistence.
- Credential auth using bcrypt, signed JWT cookies, workspaces, and memberships.
- OpenAI Responses API behind a small structured-output adapter.
- Deterministic action and requirement services; no agent framework.

Key files:

- `src/db/schema.ts` — complete relational schema and state enums.
- `src/db/client.ts` / `src/db/database-url.ts` — lazy PGlite client, migrations, URL normalization.
- `drizzle/` — forward SQL migrations and RLS policies.
- `src/lib/auth.ts` — sessions and required workspace context.
- `src/lib/server-actions.ts` — auth, jobs, relationships, and holds mutations.
- `src/lib/agent-actions.ts` — intake review, communication, approval/handoff, and invoice mutations.
- `src/lib/action-engine.ts` — deterministic action generation and reevaluation.
- `src/lib/services/intake.ts` — source persistence, tracked AI calls, reconciliation, and coordination preparation.
- `src/lib/services/requirements.ts` — contextual missing-information policy.
- `src/lib/ai/provider.ts`, `schemas.ts`, `prompts.ts` — provider adapter, Zod contracts, and prompts.
- `src/app/(workspace)/page.tsx` — grounded Home briefing.
- `src/app/(workspace)/jobs/[id]/page.tsx` — living job brief.
- `src/app/(workspace)/inquiries/` — intake and review flow.
- `src/app/(workspace)/actions/[id]/page.tsx` — action-kind workspace dispatch.
- `tests/` and `e2e/core.spec.ts` — unit, integration, isolation, desktop, and mobile coverage.

## 3. Implemented features and limitations

Implemented:

- Signup/login, signed sessions, workspace membership, scoped reads/mutations.
- One Job model with lifecycle, booking, fee, invoice, schedule, scope, participants, and activity.
- Reusable people, organizations, affiliations, job roles, archive behavior, and shared-job history.
- First/second holds, confirmed bookings, release/conversion history, conflicts, month/agenda calendar.
- Durable actions with deduplication, resolution conditions, approval/execution separation, and events.
- Pasted inquiry and producer-response sources, structured business briefing, optional correction/rejection, and deliberate merge.
- Opportunity summaries, producer requests, relevant gaps, grounded risks, prioritized recommendations, suggested workflow state, and prepared responses in one validated intake result.
- Explicit requested-date alternatives and hold-request intent. Alternative dates do not become ranges; requested holds do not become active holds.
- Accepted source-backed field revisions and contextual requirements.
- Prepared producer emails with editing, AI revision, approval, copy/`mailto:`, explicit sent confirmation, and question tracking.
- Specialized hold-conflict and invoice-preparation workspaces.
- Editable internal invoice previews with billing details, line item, payment terms, and notes.
- Grounded daily briefing and read-first living job briefs.

Limits:

- No provider-backed email delivery or inbound sync; responses are pasted manually.
- Invoice output is an internal draft/status, not a document or accounting workflow.
- Existing-job matching is lexical title/client overlap.
- Agency extraction is not fully persisted into relationship records.
- Requirements and deterministic actions cover a deliberately small field/rule set.
- No uploads, attachments, OCR, background jobs, hosted DB adapter, or operational monitoring.

## 4. Database schema and state transitions

Core identity: `users`, `workspaces`, `workspace_members`.

Business records: `jobs`, `people`, `organizations`, `affiliations`, `job_participants`, `holds`, `activities`.

Understanding/provenance: `sources`, `intake_reviews`, `job_fields`, `job_field_revisions`, `ai_runs`.

Prepared work: `actions`, `action_events`, `questions`, `communications`, `invoice_drafts`.

Important transitions:

- Job lifecycle states are `inquiry`, `preproduction`, `in_production`, `completed`, and `cancelled`. The UI permits explicit state changes; valid combinations with booking status are enforced in `src/lib/domain.ts`, but directional transitions are not modeled as a state machine.
- Booking: `unbooked → first_hold|second_hold → confirmed`; release sets `released`.
- Hold: `active → released`, or an active first/second hold becomes `converted` while a new active confirmed hold is created.
- Intake review: `processing → ready → accepted|rejected`; provider/validation errors produce `failed`.
- Action supports `open`, `deferred`, `pending_approval`, `approved`, `executing`, and `resolved`. Current user flows defer, dismiss/resolve, or approve actions; no workflow currently advances an action status into `executing`. `execution_status` separately supports `not_requested`, `ready`, `executing`, `succeeded`, and `failed`.
- Question: `draft → asked → answered`; it may instead become `obsolete`.
- Communication: `draft → approved → copied|opened_in_client → sent`; `sent` requires explicit user confirmation in the current implementation.
- Invoice: completed job with `invoice_status=not_ready` creates an action; preparation creates/marks an internal draft `ready`, sets the job invoice `ready`, and resolves the action.
- AI run: `running → succeeded|failed` with durable diagnostic metadata.

All business tables carry `workspace_id`. Application queries enforce it; migrations add RLS policies for deployment defense in depth.

## 5. AI integration and configuration

Configure `.env`:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-6.2-astra
```

`OpenAIProvider` calls `responses.parse` with Zod structured-output schemas, `store: false`, two SDK retries, and a 45-second timeout. Inquiry analysis now returns the briefing and source-backed extraction together so the prepared response and recommendation use the same grounded understanding. Tracked runs persist purpose, provider/model, schema version, request ID, duration, input hash, output, and failures.

AI currently supports opportunity/update briefings, source-backed extraction, missing-information analysis, producer email drafting, and draft revision. Candidate scoring, requirement classification, conflicts, hold creation, action resolution, authorization, and persistence decisions remain deterministic.

Automated tests use `FixtureAIProvider` only when `AI_FIXTURE_MODE=test` and the process is non-production or explicitly marked `PLAYWRIGHT_TEST=true`. Missing credentials never activate the fixture in normal use.

## 6. Known bugs, debt, and deferred work

- No known blocking test failure at checkpoint.
- PGlite is the only wired runtime database client; hosted PostgreSQL is deferred.
- RLS transaction context is not active under the local owner connection.
- Rejected extracted fields do not receive standalone rejected revision records.
- Requested-date alternatives are preserved in the provenance layer rather than a dedicated normalized scheduling-request table.
- Source immutability is conventional, not database-enforced.
- Supersession fields exist without a complete supersede workflow.
- Workspace action reevaluation is a full scan.
- Date-only precision is inferred from midnight.
- Auth lacks recovery, verification, invitations, revocation UI, and rate limiting.
- External email, inbox/calendar sync, files, OCR, invoicing providers, payments, and background processing are deferred.

## 7. Run and test commands

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm check
```

Database utilities:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Do not run `pnpm db:test:reset` against the normal workspace; it is intended for the isolated Playwright database flow.
