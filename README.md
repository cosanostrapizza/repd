# Repd

Repd is an AI-native business manager for independent commercial creatives. The current application turns pasted producer inquiries into source-grounded opportunity briefings, explains what matters, prepares the next move, and keeps consequential changes and outbound communication under the user’s control.

Milestone 2 is a functional local application. It preserves the Milestone 1 foundation—authentication, workspace isolation, jobs, relationships, holds, calendar, provenance, and deterministic rules—while replacing field-by-field intake with an agent-first briefing and optional correction model.

See [PROJECT_STATE.md](PROJECT_STATE.md) for the implementation handoff and [IMPLEMENTATION.md](IMPLEMENTATION.md) for the checkpoint record and architectural decisions.

## Requirements

- Node.js 20 or newer
- pnpm
- An OpenAI API key for AI extraction and drafting

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`. The idempotent demo seed creates:

```text
alex@repd.demo
creativelife
```

The default database is PGlite at `.repd/repd.db`. Both `file://.repd/repd.db` and `file:./.repd/repd.db` are normalized correctly. Migrations are forward-only; normal setup and seed commands do not reset existing data.

## Environment

```bash
DATABASE_URL=file://.repd/repd.db
SESSION_SECRET=replace-with-at-least-32-random-characters
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-6.2-astra
```

`OPENAI_MODEL` is optional and defaults to `gpt-6.2-astra`. The API key is read only on the server. `SESSION_SECRET` has a development fallback but must be explicitly configured for any deployed environment.

If AI is not configured or a provider request fails, Repd preserves the pasted source and records a failed review/model run. It does not substitute fabricated extraction or drafting output.

## Implemented workflow

1. Paste an inquiry or create a job manually.
2. Repd stores the original text, calls OpenAI with a Zod-validated business-briefing schema, and presents a natural-language understanding, compact opportunity facts, assessment, prioritized recommendations, and an editable response.
3. The user can create the job from one coherent review. Field corrections, evidence, confidence, conflicts, and existing-job matching are available through progressive disclosure.
4. Accepted information updates one durable Job and records source-backed field revisions without converting proposed terms into confirmed business facts.
5. Requested date alternatives and hold requests remain explicit request intent. They do not create a shoot range or grant a hold. Contextual rules identify important missing information and prepare durable questions and coordination work.
6. The user can approve, copy, or open the draft in their email client. Repd records delivery only after the user explicitly confirms that it was sent.
7. A pasted producer response is shown as a coherent update with changed facts and remaining ambiguity. Accepted answers update the job, answer durable questions, and allow obsolete actions to resolve.

Home is a deterministic, grounded briefing assembled from stored jobs, actions, waiting questions, and activity. Job Detail leads with the current situation and prepared decisions. Producer coordination, hold conflicts, and invoice preparation have purpose-specific workspaces; invoice drafts now have an editable internal preview.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm db:migrate
```

`pnpm check` runs type checking, linting, and Vitest together.

The current checkpoint has 16 passing unit/schema/database-integration tests and 12 passing Playwright journeys across desktop Chromium and an iPhone-sized mobile viewport. The inquiry journey uses the Adidas scenario and verifies that alternative dates remain alternatives and a requested hold remains ungranted. Playwright uses the isolated `.repd/e2e.db` database and port 3100; it does not reset the normal local workspace.

## Current boundaries

- There is no email delivery provider, inbox sync, calendar sync, payment provider, object storage, or background worker.
- Email execution is copy/`mailto:` plus explicit user confirmation; approval is not delivery.
- Invoice preparation creates an internal draft and status only. It does not generate a numbered tax document, send an invoice, or reconcile payment.
- Producer responses are pasted manually; attachments are not ingested.
- The runtime database client is PGlite. The schema and migrations are PostgreSQL-oriented, but hosted PostgreSQL connection wiring is not implemented.
- Automated AI tests use a guarded deterministic test provider. A live provider call is not part of the automated suite.
