# Repd Project State

Agent-native workspace redesign — 2026-11-18

## Product interaction coherence checkpoint

- Ask Repd preserves historical messages and adds one current-outcome card per
  linked operation, so a past failure can coexist with a reply that is now
  ready, approved, handed off, sent, or still failed.
- Prepared communications stay compact in Job Workspace and open the existing
  action-backed focused review. Dirty edits block approval and warn on exit.
- Shared hold conflicts can record an internal priority preference without
  changing either hold, booking status, or an external record. Confirmation
  and release remain separate explicit commands.
- Invoice review is one editable surface. Saving and internal approval persist;
  numbering, issuance, sending, and payment remain outside those actions.
- Job situations use a short summary plus compact source-aware facts.
- New relative-date instructions are anchored to the durable instruction
  timestamp and stored with the treatment dependency/action. Historical records
  without sufficient context are not rewritten.
- Isolated database reset now honors `DATABASE_URL` while refusing non-E2E or
  out-of-`.repd` targets. The retained live database was not reset, reseeded,
  migrated, or mutated during this milestone.

## Product reality

Repd is a job-centric operating workspace for independent commercial
creatives. Structured pages and the universal agent are two interfaces over the
same jobs, actions, objectives, dependencies, sources, approvals, and command
services.

Primary navigation is Today, Jobs, Calendar, Relationships, and Ask Repd.
Actions remain a durable domain primitive and a history surface, but are no
longer the product’s organizing metaphor.

## Implemented architecture

- Next.js 16 App Router, React 19, TypeScript, Drizzle, and PGlite.
- Workspace-scoped credential auth and relational business records.
- Canonical projections in `src/lib/workspace-state.ts` power Today, Job
  Workspace, Jobs, and agent answers. Resolved, dependency-satisfied, superseded,
  future-deferred, answered, and obsolete work is excluded from active
  projections, including retained legacy action shapes.
- Jobs support multiple concurrent objectives, dependencies, actions,
  approvals, failures, and external waiting conditions. A deterministic rank
  selects the recommended next action without hiding secondary workstreams.
- Actions have stable meanings and optional objective ownership. Later steps
  create or reuse separate deduplicated actions instead of mutating an existing
  action’s kind.
- Inquiry and producer-response intake preserve source evidence, proposed vs.
  confirmed values, calendar-date semantics, alternatives, hold intent, and
  deliberate reconciliation.
- Treatment decisions persist transactionally before reply generation. A
  drafting failure becomes an explicit failed preparation action with an
  idempotent retry; the resolved decision form does not reappear. Retry reloads
  the exact saved condition rather than reconstructing a new decision.
- Retry operations atomically claim the failed preparation action, expose a
  client pending/result state, and classify provider, configuration, artifact
  validation, and command/state failures. Transient provider work retries once
  automatically; all retry paths reuse the same action and communication.
- Active overlapping holds produce one shared conflict action keyed by the
  participating hold records. Today deduplicates it, both Job Workspaces and
  Calendar resolve to it, and only explicit hold commands alter business state.
- Completed jobs with an agreed fee, billing client, and payment terms receive
  one source-backed internal invoice draft automatically. A unique draft/action
  index prevents duplicates. Review is required; issuance and delivery are not
  automated. Missing inputs are named instead of invented.
- Client-selected dates remain distinct from booking confirmation. Unselected
  requested/granted alternatives project as released current state while the
  original request stays in history and evidence.
- The universal agent persists threads, messages, runs, and operational events.
  It resolves job context across the workspace, asks when ambiguous, reads the
  canonical projections, and uses the same treatment command as the structured
  UI. Its event stream exposes searches, checks, mutations, artifact
  preparation, approvals, failures, and completion—not private reasoning.
- Consequential external actions retain approval boundaries. Approving a
  communication never implies delivery; sending requires explicit user
  confirmation.
- Today is a concise attention briefing with separate background work and
  compressed changes. Job Workspace exposes current situation, next steps by
  owner, and progressively disclosed job details.
- Ask Repd docks beside and reflows desktop content, uses a full-screen mobile
  presentation, preserves the durable conversation across navigation, and
  shares its implementation with the expanded `/agent` workspace.

## Key files

- `docs/repd-mvp-product-brief.md` — authoritative product contract
- `docs/agent-native-architecture.md` — IA, domain, projection, command, and
  agent architecture
- `src/lib/workspace-state.ts` — canonical Job/Today projections
- `src/lib/services/intake.ts` — shared intake, decision, reconciliation, and
  preparation commands
- `src/lib/agent-workspace.ts` — durable conversational orchestration and
  context resolution
- `src/app/(workspace)/page.tsx` — Today
- `src/app/(workspace)/jobs/[id]/page.tsx` — job workspace
- `src/components/agent/agent-panel.tsx` and `src/app/(workspace)/agent` —
  contextual panel and expanded agent workspace
- `drizzle/0003_calendar_date_semantics.sql` and
  `drizzle/0004_agent_native_workspace.sql` — additive forward migrations
- `drizzle/0005_execution_reliability.sql` — one-draft-per-action invariant
- `src/db/recover-pglite.ts` — explicit source-to-new-target logical recovery
  with row equality and foreign-key verification

## State and safety boundaries

- Action status and execution status remain separate.
- Objective, dependency, action, communication, and run events are durable and
  workspace-scoped.
- Requested holds do not imply granted holds; selected dates do not imply a
  confirmed booking.
- Proposed budgets remain separate from accepted fees.
- External calendar, inbox, contract, and accounting claims are never invented.
- Agent failures preserve the accepted source and any already-recorded user
  decision.
- Automatic model recovery is limited to two service-level attempts; content
  validation and command/state failures are not retried automatically.

## Current limitations

- Email delivery and inbound sync remain manual; communications are prepared,
  approved, handed off, and explicitly confirmed as sent.
- External calendar, contract, file/OCR, accounting, payment, and background
  job integrations are not connected.
- The conversational command set now composes workspace/job reads, evidence
  inspection, treatment commitments, producer-draft preparation, dated
  follow-ups, and eligible invoice preparation. Arbitrary record mutation and
  direct deadline rewriting remain unsupported; consequential ambiguity stops
  for clarification.
- Cross-job matching is deterministic lexical matching over job, client, and
  participant names. Equal candidates require clarification.
- PGlite is the runtime database; hosted PostgreSQL and production RLS context
  wiring remain deferred.
- Recovery candidate v3 is active at `.repd/repd.db`. The byte-identical
  unreadable original, verified backup, and a pre-activation candidate snapshot
  remain isolated under the recovery directory.

## PGlite recovery checkpoint

Recovery artifacts are isolated under
`.repd/recovery/2026-11-18T-recovery/`.

- The original is a PostgreSQL 17/PGlite directory, not SQLite. PGlite failed
  before Drizzle with `invalid resource manager ID in checkpoint record` and
  could not locate a checkpoint at `0/774B48`.
- PostgreSQL 17 tooling showed that `global/pg_control` pointed at `0/774B48`,
  which is a valid WAL `Heap2 PRUNE_ON_ACCESS` record but not a checkpoint.
  Earlier shutdown checkpoints and WAL through `0/77C770` were readable. The
  probable application trigger was immediate `process.exit()` in the migration
  and seed CLIs, which could bypass `PGlite.close()` and a clean checkpoint.
- The original was never opened for repair. A backup at
  `.repd/recovery/2026-11-18T-recovery/backup/repd.db` matches all 1,108 files,
  modes, sizes, mtimes, and SHA-256 values. The SHA-256 manifest digest is
  `f4d2522cdec1d85d7e5ed321e04d53bb2f9f2bffee9abf4f61b6b8a8bcafbb5b`.
  A final post-validation check produced the same digest for the original.
- `pg_resetwal` was used only on `resetwal-source.db`, a backup copy. The
  recovery command migrated a new target, copied every public table with
  original identifiers, compared canonical row content table by table, and
  found no foreign-key violations, invalid/not-ready indexes, unvalidated
  constraints, or duplicate action/invoice uniqueness keys.
- The recovered baseline contains 5 jobs, 21 job fields, 35 field revisions,
  5 participants, 6 actions, 6 action events, 6 activities, 12 dependencies,
  2 date options, 1 objective, 2 communications, 11 AI runs, 1 agent thread,
  2 agent messages, 1 agent run, and 5 agent-run events. All 27 public tables
  matched the export source. Six migrations, including `0005`, are applied.
- Candidate v3 was activated at `.repd/repd.db` on 2026-11-18. Its immutable
  pre-activation snapshot is
  `.repd/recovery/2026-11-18T-recovery/recovered-candidate-v3-preactivation.db`.
  Live validation added the expected New Balance retry records: one successful
  AI run, one draft communication, action/event state transitions, and the
  objective transition to awaiting approval. Workspace reevaluation also
  created the expected single internal Acme invoice draft. The New Balance
  draft is unapproved and unsent (`approved_at`, `sent_at`, and provider message
  ID are null).
- The live draft contains the immutable sentence: “I can meet the 2026-11-23
  treatment deadline provided that the promised deck arrives tomorrow and can
  be reviewed.” Today, Jobs, the job workspace, and Ask Repd remain coherent;
  the candidate also reopened after a clean app restart.

Residual risk: `pg_resetwal` necessarily discards recovery history after the
last usable checkpoint. Logical equality is proven between the opened recovery
source and the clean candidate, but the corrupt original cannot provide an
independent SQL-level snapshot. Keep both the original-aside directory and the
verified backup until the activated candidate has passed a user acceptance
window.

## Interaction-coherence validation — 2026-11-18

- `pnpm check`: passed (45 tests across 12 files).
- `pnpm build`: passed on Next.js 16.4.6.
- `pnpm test:e2e`: passed 26/26 desktop and mobile scenarios.
- Hands-on QA against the retained workspace confirmed the original New
  Balance failure remains visible beside the current “Reply ready for review”
  outcome and focused review. No retained-record mutation was performed.

## Composable agent checkpoint

On 2026-11-18 Ask Repd gained a typed, workspace-authorized tool registry and a
bounded model-directed execution loop. Each model turn selects at most one
tool; observations feed the next turn. Durable agent-run events describe actual
searches, checks, preparations, internal writes, approval boundaries, failures,
and completion.

The New Balance acceptance flow executes real record search, job projection and
evidence reads, an idempotent approval-gated producer draft preserving “If the
usage includes paid social, we’ll need to revisit the licensing fee,” and one
linked Friday follow-up. The follow-up is a deferred canonical action. Once due,
workspace reevaluation distinguishes an unsent draft from a sent communication
and checks only later incoming sources recorded in Repd.

The implementation adds no tables and does not migrate, reset, seed, or write
to the retained `.repd/repd.db` during automated validation. Browser tests use
the isolated `.repd/e2e.db` store.

## Validation checkpoint

On 2026-11-18:

- `pnpm check` passed: typecheck, lint, 40 tests in 10 files.
- `pnpm db:migrate` passed twice against candidate v3, proving the six applied
  migrations are current and idempotent.
- `pnpm build` passed on Next.js 16.4.6.
- `pnpm test:e2e` passed: 20/20 desktop and mobile scenarios, including the
  New Balance mixed-mode decision, selected-versus-confirmed date semantics,
  shared conflict, automatic invoice draft, released alternative hold, agent
  execution disclosure, and communication approval boundary.
- The automated browser suite uses an isolated database. Candidate v3 also
  passed a real-provider New Balance retry on desktop and at 390×844 mobile
  size; no approval or delivery action was taken.
- After activation, the normal `pnpm dev` startup used the default
  `file://.repd/repd.db` path. Today, Jobs, the New Balance Job Workspace, and
  Ask Repd loaded successfully. `pnpm check`, the production build, and all
  20 desktop/mobile Playwright scenarios passed again.

## Activation and rollback

Activation was explicitly approved and completed on 2026-11-18 using these
reversible directory moves:

```bash
mv .repd/repd.db .repd/recovery/2026-11-18T-recovery/original-activated-aside.db
mv .repd/recovery/2026-11-18T-recovery/recovered-candidate-v3.db .repd/repd.db
DATABASE_URL=file://.repd/repd.db pnpm db:migrate
pnpm dev
```

The activated store is healthy. If a later rollback is required, stop the
application first. This procedure preserves the active store and restores the
forensic original (which is known not to open):

```bash
mv .repd/repd.db .repd/recovery/2026-11-18T-recovery/failed-activated-candidate.db
mv .repd/recovery/2026-11-18T-recovery/original-activated-aside.db .repd/repd.db
```

To restore the known-good pre-activation candidate snapshot instead, copy it to
a new empty `.repd/repd.db` path after preserving the current active store. Do
not overwrite either recovery snapshot in place.

## Run commands

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Do not run `pnpm db:test:reset` against the normal workspace database.
