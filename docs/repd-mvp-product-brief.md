# Repd — MVP Product Brief

**Version:** 0.2
**Status:** Ready for prototype development
**Initial market:** Independent commercial photographers and other paid-shoot creatives in NYC/LA
**Product:** AI-native business management and coordination

---

## 1. Product vision

Every creative deserves a business manager.

Repd is an AI business manager for independent creatives. It understands their jobs, gathers missing information, coordinates with the people involved, manages bookings, and helps them get paid.

Over time, Repd becomes increasingly autonomous, eventually helping creatives manage professional relationships, find opportunities, and grow their careers.

**Tagline:** You create. We handle the rest.

### Product philosophy

Repd is not traditional project-management software with an AI chatbot attached.

It is an agent-native workspace where AI performs coordination work and the user supervises important decisions.

The product should feel like having a competent, proactive business manager who knows what’s happening, understands what’s missing, and prepares the next action.

### The coordination loop

Every meaningful agent workflow follows the same pattern:

**Understand → Identify → Prepare → Approve → Act → Monitor → Repeat**

1. **Understand:** Gather information from available sources and establish the current state of a job.
2. **Identify:** Detect missing information, conflicts, obligations, deadlines, and opportunities.
3. **Prepare:** Recommend and prepare the appropriate next action.
4. **Approve:** Request user approval when necessary.
5. **Act:** Execute the authorized action and record the result.
6. **Monitor:** Track responses, changes, and outcomes, then determine whether further action is needed.

This loop is the foundational product and architectural concept.

---

## 2. Target user

The initial customer is an independent commercial photographer working on paid editorial, advertising, fashion, or brand shoots.

Typical characteristics:

- Works with producers, agencies, brands, and other creatives.
- Manages multiple inquiries, tentative holds, and confirmed jobs.
- Receives incomplete and evolving production information.
- Negotiates fees, scope, and usage rights.
- Manages invoicing and payment follow-ups personally.
- Has no dedicated business manager or administrative support.

The underlying product should support adjacent creative professions, including videographers, directors, stylists, and makeup artists, without requiring profession-specific workflows in V1.

---

## 3. The core problem

Creative work generates substantial administrative overhead.

Job details are fragmented across conversations, documents, calendars, and people’s memories.

Users must continually determine:

- What jobs am I being considered for?
- Which dates are on hold or confirmed?
- What do I know about each job?
- What information am I missing?
- Who should I contact next?
- What needs to happen today?
- Which jobs have not been invoiced?
- Who owes me money?

Existing tools store fragments of this information but do not actively coordinate the work.

Repd’s job is to maintain an accurate understanding of the user’s business and move outstanding work toward completion.

The deeper value is psychological as well as operational. Independent creatives often have to negotiate, advocate for themselves, request information, and chase payment personally.

Repd provides professional judgment, preparation, and eventually representation—without requiring the creative to employ a human manager.

---

## 4. MVP objective

Build a functional, polished web application that demonstrates the complete lifecycle of one creative job:

**Inquiry → Job review → Missing information → Producer communication → Response → Job update → Confirmation → Completion → Invoice preparation**

The first release does not need to automate every stage.

It must demonstrate that Repd can understand a job, identify what needs attention, prepare the next action, and track its outcome.

### Primary success criterion

A user can take a messy, incomplete job inquiry and turn it into a structured, actionable job record, then prepare and approve a professional request for missing information.

### Secondary success criteria

- Users can manage tentative holds and confirmed bookings.
- Users can see outstanding actions across jobs.
- Users can track whether completed jobs have been invoiced.
- Users can maintain reusable people and organization records.
- Users can receive and reconcile new information without manually updating every job field.

---

## 5. Core product surfaces

### A. Home — Agent Briefing and Action Queue

The application’s default screen.

It should answer:

**What needs my attention?**

The home experience has two complementary components.

#### Agent briefing

A concise, personalized summary of what matters today.

Example:

> Good morning. Three things need your attention.
>
> - Nike campaign: Usage rights and shoot location are missing. I’ve prepared a reply to the producer.
> - Acme Studio: Yesterday’s shoot is complete. Your $2,800 invoice is ready for review.
> - Editorial shoot: You have competing holds for Thursday.

The briefing should feel like a competent business manager checking in.

It is not a generic dashboard or a long AI-generated essay.

#### Action queue

A persistent, prioritized list of outstanding actions.

Each action includes:

- Related job and contact
- Explanation of the issue
- Recommended next step
- Prepared action, where applicable
- Priority
- Status
- Primary action button
- Options to approve, edit, defer, dismiss, or reject

Actions remain accessible until resolved, dismissed, or otherwise completed.

The briefing is a summary. The action queue is the durable system of record.

#### Attention prioritization

Actions should be classified into four categories:

| Priority | Meaning | Example |
| --- | --- | --- |
| Urgent | Time-sensitive, immediate consequences | A competing hold needs a response |
| Blocking | Prevents progress on a job | Usage rights missing before estimate |
| Routine | Necessary administrative work | Completed job awaiting invoice |
| Optional | Useful but not required | Reconnect with a producer |

The home screen should surface only a small number of high-value actions by default.

All unresolved actions remain available in the full queue and relevant job pages.

Avoid notifying users about every email or minor update.

### B. Jobs

A structured workspace for all paid work.

Supported job statuses:

- Inquiry
- Tentative / On hold
- Confirmed
- In production
- Completed
- Cancelled

Each job includes:

- Job title
- Client / brand
- Producer and other contacts
- Shoot dates
- Locations
- Fee and expenses
- Usage / licensing terms
- Deliverables
- Payment terms
- Related communications and documents
- Holds and booking status
- Outstanding questions
- Tasks and next actions
- Invoice and payment status

The job page is the primary source of truth.

#### Information states

Every important field must distinguish between:

| State | Meaning |
| --- | --- |
| Confirmed | Explicitly established by an authoritative source or user |
| Proposed | Suggested but not agreed |
| Unconfirmed | Mentioned but insufficiently established |
| Missing | No usable information |
| Conflicting | Sources disagree |

Model extraction confidence must be separate from business confirmation.

For example, Repd may be highly confident that a producer proposed a $3,500 fee, but that does not mean the fee was agreed.

Each field should retain its source, evidence, timestamp, and change history.

Users can inspect sources and correct information.

AI-generated updates must not silently overwrite confirmed information.

### C. Calendar / Holds

A calendar designed for commercial creative bookings.

Support:

- First holds
- Second holds
- Confirmed bookings
- Multiple inquiries on the same date
- Conflicts
- Hold expiration or challenge reminders where applicable

Holds should be attached to jobs rather than stored as disconnected calendar events.

V1 can use an internal calendar. External calendar synchronization is optional for the first prototype.

### D. People and Organizations

Maintain independent records for:

**People:** Producers, art directors, creative directors, agents, assistants, collaborators, and clients.

**Organizations:** Brands, agencies, production companies, studios, and publications.

A person may work across multiple organizations and jobs.

A job may involve multiple people and organizations, each with a different role.

Display relationship history, including previous jobs and communications.

A producer who works with a creative on three shoots for different brands should appear as one person with three associated jobs.

This relationship graph is foundational for the future career-development agent.

### E. Money

V1 should support lightweight financial operations:

- Job fees and expenses
- Estimate creation
- Invoice drafts
- Invoice status
- Due dates
- Payment tracking
- Outstanding receivables
- Reminders for completed but uninvoiced jobs

Distinguish between earned, invoiced, and received revenue.

Full accounting, tax preparation, bank synchronization, and payment reconciliation are outside the initial scope.

---

## 6. Unified job intake and review

Users should be able to introduce a job to Repd through multiple channels:

- Manual entry
- Pasting an email or conversation
- Forwarding an inquiry
- Uploading a brief
- Connected email, when available
- Producer-facing intake form

No single input method should be required.

All paths converge on the same New Job Review experience.

### New Job Review workflow

1. Repd identifies a potential job from incoming information.
2. Repd extracts available job details.
3. Repd attempts to associate the information with an existing job.
4. If a possible duplicate exists, Repd presents the match for review.
5. Repd displays extracted fields and their information states.
6. The user can confirm, correct, or reject the proposed job.
7. Once accepted, Repd creates or updates the persistent job record.
8. Repd identifies missing information and recommends next actions.

### Example

**Repd found a possible job**

Editorial shoot · New York

| Field | Value | State |
| --- | --- | --- |
| Client | Acme Magazine | Confirmed |
| Shoot date | November 24 | Proposed |
| Creative fee | $2,500 | Proposed |
| Location | Not provided | Missing |

Actions:

- Review and create job
- Merge with existing job
- Not a job

Repd must avoid creating duplicate jobs from multiple emails about the same project.

A job is not considered confirmed merely because an inquiry was received.

---

## 7. Flagship AI workflow — Active coordination

This is the defining MVP interaction.

### Scenario

A photographer receives an inquiry for a campaign shoot.

The initial message includes the client, tentative shoot date, and proposed fee, but omits usage rights and final location.

### Step 1 — Understand the job

Repd extracts known information and establishes a structured job record.

It preserves the original communication and identifies which fields are confirmed, proposed, missing, or conflicting.

### Step 2 — Identify missing information

Repd compares the available information against a configurable checklist of details typically required for the job type.

Example:

**Missing information**

- Usage rights: territory, duration, media, exclusivity
- Final shoot location

**Recommended action**

- Ask the producer to confirm usage rights and location before finalizing the estimate.

### Step 3 — Determine who should answer

Repd should distinguish between information the creative must decide and information an external party must provide.

| Information | Appropriate next step |
| --- | --- |
| Shoot location | Ask producer |
| Call time | Ask producer |
| Creative’s desired rate | Ask creative |
| Client’s proposed budget | Ask producer |
| Usage terms | Clarify with producer; flag implications |
| Payment received | Ask user or check connected payment source |
| Conflicting dates | Surface evidence and request confirmation |

Not every unknown should trigger a producer questionnaire.

Repd should recognize when something is a negotiation or decision rather than a missing fact.

### Step 4 — Prepare communication

The user can choose between:

**Draft email:** Repd writes a natural reply in the creative’s preferred tone.

**Shareable questions:** Repd generates a lightweight, prefilled form or questionnaire that the producer can complete without creating an account.

Both options should be editable.

Questions should be contextual, concise, and appropriate to the stage of the job.

Do not ask for information already available or demand a complete intake form when only two details are missing.

### Step 5 — Review and approve

Display a review interface containing:

- Recipient
- Subject
- Proposed message
- Questions being asked
- Related job
- Explanation of why the information is needed

Actions:

- Edit
- Regenerate
- Approve and send
- Save draft
- Cancel

For V1, no external message should be sent without explicit user approval.

If sending integration is unavailable, allow copying the draft or opening it in the user’s email client.

### Step 6 — Track outstanding questions

After sending, Repd records the questions as awaiting response.

When an answer is received or manually entered:

- Update the relevant job fields.
- Preserve the original communication.
- Record the source of the new information.
- Resolve completed questions.
- Flag conflicts for review.
- Recommend the next action.

The user should not have to manually recreate the information in the job record.

### Step 7 — Monitor and follow up

Repd tracks unresolved questions and response deadlines.

If a producer has not replied, Repd may recommend a follow-up.

The recommendation should consider:

- Urgency of the job
- Time since the previous message
- Whether the missing information blocks progress
- Relationship sensitivity
- User communication preferences

Routine follow-ups should initially require approval.

---

## 8. Producer-facing experience

Producers should be able to interact with Repd without creating an account.

### Lightweight intake form

A producer may receive a link containing a small number of questions relevant to a specific job.

Example:

**A few details about your shoot**

Alex is reviewing the campaign inquiry and needs two details before confirming.

**Where will the images be used?**

- Digital / social
- Print
- Both
- Still being determined

**Where is the shoot taking place?**

- Free-text location or TBD

**Submit details**

### Design requirements

- No account required.
- Mobile-friendly.
- Short and contextual.
- Prefilled with known information where appropriate.
- Clearly identifies the creative and job.
- Supports partial answers and TBD values.
- Does not expose private business information.
- Submissions update the relevant job through a controlled reconciliation process.

The producer-facing experience should feel like a helpful coordination tool, not an enterprise onboarding portal.

A full producer dashboard is deferred.

---

## 9. UX principles

### UI-first, chat-second

Use structured interfaces for jobs, calendars, contacts, financial records, and approvals.

Use conversational interaction for open-ended requests, questions, and commands.

Chat should not be the primary navigation system.

### Agent briefing, not generic dashboard

The home screen should feel like a business manager presenting what matters.

Avoid vanity metrics, excessive widgets, and long lists of low-value information.

### Exception-driven interaction

Prioritize unresolved issues, decisions, and prepared actions.

A job with no outstanding issues should require very little user interaction.

### Progressive delegation

Support four conceptual levels:

1. **Inform:** Explain what is happening.
2. **Recommend:** Suggest an action.
3. **Prepare:** Draft an action for approval.
4. **Execute:** Perform an authorized action autonomously.

V1 focuses on levels 1–3.

Autonomous external communication is deferred.

### Transparent AI

Users must understand:

- What Repd knows.
- What Repd inferred.
- What remains unconfirmed.
- Where information came from.
- What Repd is proposing to do.
- Whether an action has actually occurred.

AI-generated output should never silently overwrite confirmed information.

### Professional communication

Repd communicates on behalf of someone whose reputation and relationships matter.

Default tone: warm, direct, concise, professional.

Avoid robotic language, unnecessary questions, aggressive collections, or invented commitments.

### Mobile-friendly

The web application must work well on phones.

Prioritize quick review, approvals, calendar access, job status, and expense capture.

Detailed editing can be optimized for desktop.

---

## 10. Navigation and information architecture

Recommended primary navigation:

1. **Home** — Agent briefing and action queue
2. **Jobs** — All inquiries, holds, and bookings
3. **Calendar** — Availability and scheduling
4. **People** — Contacts and organizations
5. **Money** — Estimates, invoices, receivables

A persistent Repd assistant can be available contextually throughout the application.

Example commands:

- “What’s happening with the Nike shoot?”
- “What do I need to follow up on?”
- “Prepare an email asking for usage details.”
- “Which jobs haven’t been invoiced?”
- “Show me everything I’ve done with this producer.”

For the initial prototype, only commands supported by actual product capabilities need to work.

Do not create a decorative chatbot that implies unsupported actions.

---

## 11. Core data model

Use a relational database with first-class entities.

### Core entities

#### User / Creative

- Identity
- Business profile
- Communication preferences
- Default rates and policies

#### Person

- Name
- Contact information
- Professional roles
- Notes

#### Organization

- Name
- Type
- Associated people

#### PersonOrganizationRelationship

- Person
- Organization
- Role
- Start and end dates, where known

#### Job

- Title
- Lifecycle status
- Booking status
- Dates
- Financial terms
- Production details

#### JobParticipant

- Job
- Person or organization
- Role

#### Hold

- Job
- Date range
- Priority
- Status

#### JobField

- Field name
- Value
- Information state
- Source
- Last updated
- Confirmation history

#### Source

- Email, document, manual entry, or external response
- Original content or reference
- Timestamps

#### Question

- Job
- Requested information
- Intended recipient
- Status
- Related source

#### Action

- Job
- Recommended operation
- Priority
- Status
- Approval requirement
- Execution history

#### Communication

- Sender
- Recipients
- Content
- Job association
- Draft/sent/received status

#### Estimate / Invoice / Payment

- Job association
- Amounts
- Due dates
- Status

### Design requirements

- People and organizations must exist independently of jobs.
- Jobs can have multiple participants and sources.
- Source-backed fields must retain provenance.
- Preserve historical changes rather than silently replacing them.
- Support manual correction of AI-extracted information.
- Support duplicate detection and job reconciliation.
- Structure data for future relationship intelligence.
- Actions must have explicit lifecycle and execution states.

---

## 12. Technical approach

### Recommended stack

- Next.js + React + TypeScript
- Tailwind CSS + shadcn/ui
- PostgreSQL
- Prisma or Drizzle ORM
- Server-side AI integration using Claude or OpenAI
- Object storage for uploaded documents
- Authentication with user-level data isolation

Use a modular monolith for V1.

Do not introduce microservices, complex multi-agent systems, or distributed orchestration prematurely.

### AI capabilities

Implement focused services for:

1. Extracting job information from unstructured content.
2. Classifying information states and identifying conflicts.
3. Detecting missing details.
4. Determining the appropriate person to ask.
5. Generating contextual clarification questions.
6. Drafting professional communications.
7. Recommending next actions.
8. Reconciling incoming answers with existing job records.

Require structured model outputs validated against application schemas.

The database is the source of truth; model responses are proposals until validated and persisted.

### Action and approval system

Every proposed action should include:

- Action type
- Related job and entities
- Triggering reason
- Supporting sources
- Priority
- Approval requirement
- Current status
- Execution result
- Timestamps

Suggested action states:

- Proposed
- Prepared
- Awaiting approval
- Approved
- Executing
- Completed
- Failed
- Deferred
- Dismissed

Never mark an external action completed until its execution has been confirmed.

### Background processing

Use a lightweight job queue for asynchronous operations when needed.

The architecture should eventually support:

- Incoming message events
- Scheduled reminders
- Follow-up monitoring
- Payment deadlines
- Agent workflows that pause for approval

A full agent orchestration framework is not required initially.

### Integrations

Design interfaces for email and calendar providers, but keep the initial application usable without them.

Manual input, pasted text, and uploaded documents must remain supported.

Use mocked integrations where appropriate during prototype development.

Never simulate an external action as successfully completed.

---

## 13. Initial implementation milestones

### Milestone 1 — Functional workspace

Build:

- Authentication
- Application shell and navigation
- Home / action inbox
- Jobs list
- Job detail page
- Manual job creation
- People and organizations
- Basic calendar with holds

**Definition of done:** A user can create, inspect, and update jobs, contacts, and holds.

### Milestone 2 — Job intelligence

Build:

- Paste inquiry flow
- Structured AI extraction
- Source-backed fields
- Information states
- Missing-information detection
- Conflict indicators
- Manual corrections
- New Job Review interface
- Duplicate-job detection and reconciliation

**Definition of done:** A messy inquiry becomes a usable job record, with clear distinctions between known, proposed, and missing information.

### Milestone 3 — Agent coordination

Build:

- Recommended questions
- Identification of the appropriate recipient
- Draft email generation
- Editable approval interface
- Save draft / copy / send via configured integration
- Producer-facing questionnaire
- Outstanding-question tracking
- Manual and form-based response capture
- Job updates from new answers

**Definition of done:** A user can go from incomplete inquiry to approved clarification request and receive answers that update the job.

### Milestone 4 — Financial workflows

Build:

- Estimate drafts
- Invoice drafts
- Completed-but-uninvoiced detection
- Payment status
- Due dates
- Reminder suggestions
- Outstanding receivables dashboard

**Definition of done:** The system reliably identifies completed jobs that require invoicing and payments requiring attention.

### Milestone 5 — Proactive assistant

Build:

- Prioritized daily briefing
- Persistent action queue
- Scheduled checks
- Follow-up recommendations
- Contextual assistant interface
- Notification preferences

**Definition of done:** Repd can identify useful next actions without waiting for the user to ask.

---

## 14. Explicit non-goals

Do not build these in the initial version:

- Professional marketplace
- Automated client acquisition
- Social networking
- Full accounting or tax software
- Bank account integration
- Complex production logistics
- Autonomous rate negotiation
- Autonomous outbound communication
- Multi-agent architecture
- Native mobile application
- Industry-wide rate benchmarking
- Advanced analytics dashboards
- Full producer accounts or dashboards

These may be future capabilities but should not determine the MVP’s scope.

---

## 15. Quality and acceptance criteria

### Functional correctness

- Jobs, holds, people, and organizations persist correctly.
- Important actions have clear statuses.
- Users can correct extracted data.
- Source information remains accessible.
- Duplicate jobs are not silently created.

### AI reliability

- Missing fields are not fabricated.
- Proposed terms are not presented as confirmed.
- Conflicts are surfaced rather than silently resolved.
- Draft communications are grounded in job information.
- AI failures do not corrupt existing records.
- User corrections take precedence over subsequent unverified extraction.

### User control

- External communications require approval.
- Users can edit or discard proposed actions.
- Failed operations are distinguishable from completed operations.
- Users can inspect why an action was recommended.

### Usability

- Primary workflows are discoverable without chat.
- Job status and next actions are understandable at a glance.
- Mobile layouts remain functional.
- The interface feels calm, focused, and professional.
- The home screen surfaces the most important actions without overwhelming users.

### Security

- User data is isolated.
- Sensitive information is handled server-side.
- External integrations use least-privilege access.
- Outbound actions are logged.
- Private job details are not exposed through public forms.
- Producer-facing links use secure, scoped access.

---

## 16. Product design direction

Repd should feel like a modern creative-industry product, not enterprise CRM software.

Visual direction:

- Editorial, minimal, confident.
- Dark neutral palette with restrained violet accents.
- Strong typography and clear hierarchy.
- Dense information where useful, but no unnecessary dashboards.
- Minimal decorative AI elements.
- Polished empty, loading, and error states.

The aesthetic should complement the work of photographers, stylists, and directors without competing with it.

### UX benchmark

A user should be able to open Repd and understand within five seconds:

1. What jobs are active.
2. What requires attention.
3. What money is outstanding.
4. What Repd recommends doing next.

---

## 17. Future vision

### Phase 2 — Autonomous business manager

Repd monitors communications, coordinates with producers, manages routine follow-ups, and handles permitted administrative actions with configurable approvals.

### Phase 3 — Career agent

Repd understands the creative’s professional history, relationships, collaborators, portfolio, credits, and career goals.

It identifies relevant opportunities, suggests relationship-building actions, prepares outreach, and helps the user make better career decisions.

The relationship graph accumulated through job management becomes the foundation for these capabilities.

### Potential network evolution

Producers may eventually coordinate with multiple creatives through Repd.

The system could support availability requests, booking coordination, and agent-to-agent interactions.

This is a long-term possibility, not an MVP requirement.

---

## 18. Guiding principle

Repd should reduce the amount of work required to manage a creative career, not create another system the user has to maintain.

Every feature should answer one of three questions:

- Does it help Repd understand the user’s business?
- Does it help Repd move work forward?
- Does it help the creative make better decisions or earn more money?

If not, it probably doesn’t belong in the MVP.

**First build target:** A complete, polished inquiry-to-clarification workflow inside a persistent job-management workspace.

**Long-term ambition:** An AI agency for independent creative talent.
