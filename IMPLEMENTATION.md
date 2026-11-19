# Repd Agent-Native Redesign — Implementation Plan

**Updated:** 2026-11-18
**Status:** Implemented and validated

## Architecture decisions

1. Preserve the relational business model and source/revision evidence system.
2. Generalize objectives/dependencies for concurrent job workstreams without a
   generic workflow engine.
3. Keep actions as the only durable work/proposal primitive. Give each a stable
   meaning and use completion/supersession for later steps.
4. Add canonical job and Today projections consumed by UI and agent read tools.
5. Add shared command services used by structured and conversational modes.
6. Persist conversations and real operational run events, not model reasoning.
7. Keep external communication, hold changes, invoice issuance, and delivery
   behind explicit authorization.

## Safe migration approach

- Use forward-only additive schema changes for action/objective links and agent
  conversation/run records.
- Retain action, source, revision, communication, and objective data.
- Make new foreign keys nullable for legacy records.
- Interpret legacy work through the canonical projection.
- Redirect or embed legacy workflow destinations rather than deleting data.

## Implementation sequence

1. Reliability: canonical filtering/priorities, concurrent projections, stable
   actions, treatment failure/retry, dependency updates, obsolete filtering.
2. Workspace UI: Today, Job Workspace active work, inline producer updates,
   simplified navigation, and explicit failure/waiting states.
3. Universal agent: durable threads/runs/events, contextual panel, cross-job
   resolver, grounded answers, shared commands, and result links.
4. Acceptance: New Balance mixed mode, cross-job resolution, Today priority,
   concurrent work, failure recovery, routine inquiry, and existing safeguards.

## Product-coherence refinement

- Today now uses the canonical responsibility split: needs you, Repd is
  handling, waiting on others, and collapsed recent changes. It no longer
  repeats a generated list of action titles or explains the product philosophy
  in an everyday dashboard card.
- Job Workspace is organized around current situation, next steps by owner,
  and progressively disclosed job details. Generic objective state and
  duplicate action/workstream sections are not primary UI.
- Treatment retries reload the saved dependency decision and condition, resolve
  every matching decision action, and reuse the same preparation action and
  communication artifact. For retained legacy dependencies missing only the
  condition, a retry may fill it from the trusted action payload when the saved
  and requested decisions match.
- Date-option reconciliation releases unselected requested/granted holds after
  a client selection. The canonical projection also derives this state for
  retained legacy records, preserving historical requests without presenting
  them as current obligations.
- Ask Repd is docked on desktop, full-screen on mobile, shares durable history
  with /agent, defaults to concise outcomes, and keeps execution details
  inspectable.

## Execution reliability and proactive preparation

- Retry preparation is a stateful client form with an immediate pending state,
  duplicate-click prevention, and a visible success or failure result. The
  command atomically claims the existing failed action and never records a
  second treatment decision.
- The retained New Balance provider calls succeeded technically but returned
  drafts that weakened the conditional commitment into a future decision.
  The artifact guard rejected them. Generation now names that forbidden
  weakening explicitly, copies an immutable commitment sentence verbatim, and
  validates the saved arrival timing before persisting a draft.
- Transient provider failures receive one bounded automatic retry. Provider,
  configuration, artifact-validation, and command/state failures are persisted
  as distinct categories with attempt metadata.
- Jobs now consumes the canonical workspace projection. Attention labels use
  the same ranked work as Today, Job Workspace, and agent answers.
- Overlapping active holds produce one shared conflict action keyed by the hold
  identities. It appears in both job projections and Calendar but only once on
  Today; no hold is changed without the existing explicit command.
- Completed jobs with a confirmed fee, billing client, and payment terms get
  one internal invoice draft during workspace reevaluation. A unique
  action-to-draft index and conflict-safe insert prevent duplicates. Drafts
  remain pending review and are never issued or sent automatically.
- Empty Repd-handling and external-waiting owner groups are omitted.

## Verification gate

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm db:migrate
```

Inspect desktop and mobile Today, a New Balance Job Workspace, the universal
agent, failure recovery, and communication approval.

### 2026-11-18 reliability and recovery result

- `pnpm check`: passed (40 tests across 10 files)
- `pnpm build`: passed
- `pnpm test:e2e`: passed (20/20 across desktop and mobile)
- The original PGlite cluster has a corrupt checkpoint pointer. It remains
  byte-identical and is backed up; all repair and export work occurred on
  copies. Candidate v3 was rebuilt as a clean cluster, all 27 table contents
  matched the opened recovery source, no foreign-key violations were found,
  and migration `0005` is applied.
- Migration and seed CLIs now close PGlite in `finally` rather than terminating
  with `process.exit()`. A lifecycle test closes, reopens, and verifies the
  migrated file-backed database.
- Candidate v3 passed the retained New Balance workflow with the real provider.
  The result is a reviewable, unapproved, unsent draft that preserves the full
  deck-arrival condition. Today, Jobs, Job Workspace, and Ask Repd agree, and
  desktop/mobile layouts plus a clean application restart were inspected.
- Browser QA runs against the migrated E2E database and covers Today, Jobs,
  shared conflicts, automatic invoice review, New Balance mixed mode, and
  desktop/mobile layouts.
- Activation was explicitly approved and completed on 2026-11-18. Normal Repd
  startup now uses candidate v3 at `.repd/repd.db`; the forensic original,
  verified backup, and pre-activation candidate snapshot remain preserved.
  Post-activation checks, production build, and 20/20 desktop/mobile browser
  scenarios passed. Exact rollback commands are recorded in `PROJECT_STATE.md`.

## Documentation ownership

- `docs/repd-mvp-product-brief.md`: product contract
- `docs/agent-native-architecture.md`: UX/domain/agent architecture
- `IMPLEMENTATION.md`: implementation decisions and acceptance gate
- `PROJECT_STATE.md`: implemented reality, limitations, next priorities

## Composable agent milestone — 2026-11-18

- Added a typed registry of nine domain tools over canonical projections and
  authoritative commands. Tools carry read, internal-write, or
  prepare-for-approval classifications and validate model inputs with Zod.
- Replaced the hardcoded conversational intent branches with a model-directed,
  one-tool-per-observation loop bounded by step and serialized-context limits.
- Added idempotent producer-draft, conditional-follow-up, and batch invoice
  preparation commands. Consequential artifacts remain unapproved and unsent.
- Conditional text is required verbatim in prepared producer messages. The
  existing treatment command retains its stronger domain-specific semantic
  validation.
- Follow-ups reuse actions, surface after their deadline during normal
  workspace reevaluation, survive restarts, and distinguish unsent handoff
  from a sent message awaiting a recorded reply.
- Added planner-contract unit coverage and a desktop/mobile browser acceptance
  scenario for search → evidence check → draft → Friday follow-up.

No schema change was needed: actions, communications, invoice drafts, agent
runs, and run events already represent the required durable state.
