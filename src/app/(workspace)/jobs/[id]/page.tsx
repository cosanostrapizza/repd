import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Pencil,
  Sparkles,
  UserRound,
} from "lucide-react";
import { RetryPreparationForm } from "@/components/agent/retry-preparation-form";
import { TreatmentDecisionForm } from "@/components/agent/treatment-decision-form";
import { HoldForm, JobForm, ParticipantForm } from "@/components/forms";
import { db } from "@/db/client";
import {
  activities,
  communications,
  holds,
  jobFieldRevisions,
  jobFields,
  jobParticipants,
  organizations,
  people,
  questions,
  sources,
} from "@/db/schema";
import { requireContext } from "@/lib/auth";
import { formatCalendarDate } from "@/lib/calendar-date";
import { bookingLabels, formatMoney, lifecycleLabels } from "@/lib/domain";
import { transitionHold } from "@/lib/server-actions";
import {
  getJobWorkspaceState,
  type WorkspaceWorkItem,
} from "@/lib/workspace-state";

const display = (input: unknown) =>
  input == null || input === "" ? "Not known" : String(input);

function workLabel(item: WorkspaceWorkItem) {
  if (item.action?.executionStatus === "failed") return "Failed — retry";
  if (item.action?.status === "pending_approval") return "Ready for review";
  if (item.action?.status === "approved") return "Approved for handoff";
  if (item.responsibility === "repd") return "Repd is working";
  if (item.responsibility === "external") return "Waiting";
  return "Needs your attention";
}

function workAction(item: WorkspaceWorkItem) {
  if (["pending_approval", "approved"].includes(item.action?.status ?? ""))
    return item.kind === "invoice" ? "Review invoice" : "Review reply";
  if (item.kind === "treatment_commitment") return "Decide treatment";
  return "Review";
}

export default async function JobDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
}) {
  const { id } = await params;
  const justUpdated = (await searchParams).updated === "1";
  const ctx = await requireContext();
  const workspaceState = await getJobWorkspaceState(ctx.workspaceId, id);
  if (!workspaceState) notFound();
  const { job, clientName: client } = workspaceState;

  const [
    orgs,
    participants,
    jobHolds,
    history,
    fieldRows,
    openQuestions,
    documents,
    messages,
  ] = await Promise.all([
    db
      .select()
      .from(organizations)
      .where(eq(organizations.workspaceId, ctx.workspaceId)),
    db
      .select({
        participant: jobParticipants,
        person: people,
        organization: organizations.name,
      })
      .from(jobParticipants)
      .leftJoin(people, eq(jobParticipants.personId, people.id))
      .leftJoin(
        organizations,
        eq(jobParticipants.organizationId, organizations.id),
      )
      .where(
        and(
          eq(jobParticipants.jobId, id),
          eq(jobParticipants.workspaceId, ctx.workspaceId),
        ),
      ),
    db
      .select()
      .from(holds)
      .where(and(eq(holds.jobId, id), eq(holds.workspaceId, ctx.workspaceId)))
      .orderBy(desc(holds.createdAt)),
    db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.jobId, id),
          eq(activities.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(16),
    db
      .select({ field: jobFields, revision: jobFieldRevisions })
      .from(jobFields)
      .leftJoin(
        jobFieldRevisions,
        eq(jobFields.acceptedRevisionId, jobFieldRevisions.id),
      )
      .where(
        and(
          eq(jobFields.jobId, id),
          eq(jobFields.workspaceId, ctx.workspaceId),
        ),
      ),
    db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.jobId, id),
          eq(questions.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(questions.createdAt)),
    db
      .select()
      .from(sources)
      .where(
        and(eq(sources.jobId, id), eq(sources.workspaceId, ctx.workspaceId)),
      )
      .orderBy(desc(sources.capturedAt)),
    db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.jobId, id),
          eq(communications.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(communications.updatedAt)),
  ]);

  const activeObjective = workspaceState.activeObjectives[0];
  const dependencies = activeObjective?.dependencies ?? [];
  const treatmentDecision = dependencies.find(
    (dependency) =>
      dependency.key === "treatment_deadline" &&
      dependency.status === "needs_decision",
  );
  const treatmentValue = treatmentDecision?.value as {
    dueDate?: string | null;
    prerequisite?: string | null;
  } | null;
  const failureItem = workspaceState.failures[0];
  const primary = workspaceState.primary;
  const activeQuestions = openQuestions.filter((question) =>
    ["draft", "asked"].includes(question.status),
  );

  const overview = [
    {
      label: "Shoot",
      value: job.shootDate
        ? formatCalendarDate(job.shootDate, { weekday: "short" })
        : job.shootStart
          ? job.shootStart.toLocaleDateString("en-US", {
              weekday: "short",
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          : "Not known",
      note:
        job.bookingStatus === "confirmed"
          ? "Confirmed booking"
          : bookingLabels[job.bookingStatus],
    },
    {
      label: "Creative fee",
      value: formatMoney(job.feeCents, job.currency),
      note: job.feeState,
    },
    {
      label: "Indicative budget",
      value:
        job.proposedBudgetMinCents != null && job.proposedBudgetMaxCents != null
          ? `${formatMoney(job.proposedBudgetMinCents, job.currency)}–${formatMoney(job.proposedBudgetMaxCents, job.currency)}`
          : "Not known",
      note: "Proposed",
    },
    {
      label: "Usage & licensing",
      value: display(job.usageTerms),
      note: job.usageTerms ? "Current terms" : "Missing",
    },
    {
      label: "Deliverables",
      value: display(job.deliverables),
      note: job.deliverables ? "Current terms" : "Missing",
    },
    {
      label: "Payment terms",
      value: display(job.paymentTerms),
      note: job.paymentTerms ? "Current terms" : "Missing",
    },
  ];

  return (
    <>
      <header className="detail-head compact-job-head">
        <div className="detail-head-inner">
          <div className="job-title-row">
            <div>
              <p className="eyebrow">
                {client ?? "Client not identified"} · {job.jobType}
              </p>
              <h1>{job.title}</h1>
              <div className="detail-meta">
                <span className="badge">
                  {lifecycleLabels[job.lifecycleStatus]}
                </span>
                <span
                  className={`badge ${job.bookingStatus === "confirmed" ? "confirmed" : ""}`}
                >
                  {bookingLabels[job.bookingStatus]}
                </span>
              </div>
            </div>
            <div className="job-head-actions">
              <Link
                href={`/jobs/${job.id}/response`}
                className="button secondary"
              >
                Add producer update
              </Link>
              {primary && (
                <Link href="#next-steps" className="button">
                  {workAction(primary)}
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="content job-workspace">
        {justUpdated && (
          <section className="update-notice" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Producer update incorporated</strong>
              <span>
                Current facts, dependencies, and history have been reconciled.
              </span>
            </div>
          </section>
        )}

        <section
          className="situation-panel"
          aria-labelledby="situation-heading"
        >
          <div>
            <p className="eyebrow">Current situation</p>
            <h2 id="situation-heading">Where things stand</h2>
          </div>
          <div className="situation-content">
            <p className="situation-summary">
              {workspaceState.situationSummary}
            </p>
            <div className="situation-facts">
              {workspaceState.situationFacts.map((fact) => (
                <div key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                  <small>{fact.note}</small>
                </div>
              ))}
            </div>
          </div>
          {workspaceState.treatmentCommitment && (
            <div className="recorded-commitment">
              <CheckCircle2 size={17} />
              <div>
                <strong>Conditional treatment commitment recorded</strong>
                <span>
                  {workspaceState.treatmentCommitment.result.replace(
                    /^Alex /,
                    "You ",
                  )}
                </span>
              </div>
            </div>
          )}
        </section>

        <section
          id="next-steps"
          className="next-steps-panel"
          aria-labelledby="next-steps-heading"
        >
          <div className="compact-section-head">
            <div>
              <p className="eyebrow">Next steps</p>
              <h2 id="next-steps-heading">Who has the next move</h2>
            </div>
          </div>

          <div className="owner-groups">
            <div className="owner-group">
              <h3>
                <Sparkles size={16} /> Needs you{" "}
                <span>{workspaceState.needsYou.length}</span>
              </h3>
              {workspaceState.needsYou.map((item) => (
                <article
                  className={`work-item ${item.state}`}
                  key={`${item.source}:${item.id}`}
                >
                  <div>
                    <small>{workLabel(item)}</small>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  {item.action?.executionStatus === "failed" ? (
                    <RetryPreparationForm actionId={item.action.id} compact />
                  ) : (
                    <Link className="button secondary small" href={item.href}>
                      {workAction(item)}
                    </Link>
                  )}
                </article>
              ))}
              {!workspaceState.needsYou.length && (
                <p className="owner-empty">
                  <CheckCircle2 size={15} /> Nothing needs your decision right
                  now.
                </p>
              )}
              {treatmentDecision && activeObjective && (
                <div className="contextual-control">
                  <TreatmentDecisionForm
                    objectiveId={activeObjective.objective.id}
                    deadline={treatmentValue?.dueDate ?? null}
                    prerequisite={treatmentValue?.prerequisite ?? null}
                  />
                </div>
              )}
              {failureItem?.action && (
                <p className="trust-line">
                  The saved decision is unchanged. Retrying only prepares the
                  reply and cannot create a duplicate decision.
                </p>
              )}
            </div>

            {workspaceState.repdHandling.length > 0 && (
              <div className="owner-group">
                <h3>
                  <Sparkles size={16} /> Repd is handling{" "}
                  <span>{workspaceState.repdHandling.length}</span>
                </h3>
                {workspaceState.repdHandling.map((item) => (
                  <Link
                    href={item.href}
                    className="work-item compact"
                    key={item.id}
                  >
                    <div>
                      <small>{workLabel(item)}</small>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {workspaceState.waitingOnOthers.length > 0 && (
              <div className="owner-group">
                <h3>
                  <Clock3 size={16} /> Waiting on others{" "}
                  <span>{workspaceState.waitingOnOthers.length}</span>
                </h3>
                {workspaceState.waitingOnOthers.map((item) => (
                  <article className="work-item compact waiting" key={item.id}>
                    <div>
                      <small>Waiting</small>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <Link
                      href={`/jobs/${job.id}/response`}
                      className="quiet-link"
                    >
                      Add update
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section
          className="job-details-panel"
          aria-labelledby="job-details-heading"
        >
          <div className="compact-section-head">
            <div>
              <p className="eyebrow">Job details</p>
              <h2 id="job-details-heading">Business record</h2>
            </div>
            <span className="muted">
              Updated {job.updatedAt.toLocaleDateString()}
            </span>
          </div>
          <div className="fact-grid">
            {overview.map((item) => (
              <div className="fact-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </div>
            ))}
          </div>

          <div className="detail-disclosures">
            <details open>
              <summary>Dates and holds</summary>
              <div className="disclosure-body">
                {workspaceState.dateOptions.map((option) => (
                  <div className="record-row" key={option.id}>
                    <div>
                      <strong>{option.label}</strong>
                      <span>
                        {option.clientSelected
                          ? "Selected date"
                          : "Historical option"}
                        {option.holdRequested
                          ? ` · ${option.holdPriority ?? "unspecified"} hold`
                          : ""}
                      </span>
                    </div>
                    <small className={`record-state ${option.holdState}`}>
                      {option.holdState === "released"
                        ? "Released"
                        : option.holdState === "granted"
                          ? "Active hold"
                          : option.holdState.replaceAll("_", " ")}
                    </small>
                  </div>
                ))}
                {workspaceState.dateOptions.some(
                  (option) => option.clientSelected,
                ) && (
                  <p className="trust-line">
                    A selected date is not a confirmed booking.
                  </p>
                )}
                {jobHolds.map((hold) => (
                  <div className="record-row" key={hold.id}>
                    <div>
                      <strong>
                        {hold.kind === "confirmed"
                          ? "Confirmed booking"
                          : `${hold.kind} hold`}
                      </strong>
                      <span>{hold.startsAt.toLocaleDateString()}</span>
                    </div>
                    <div className="record-actions">
                      <small className={`record-state ${hold.status}`}>
                        {hold.status}
                      </small>
                      {hold.status === "active" && (
                        <form action={transitionHold}>
                          <input type="hidden" name="holdId" value={hold.id} />
                          {hold.kind !== "confirmed" && (
                            <button
                              className="quiet-button"
                              name="transition"
                              value="confirm"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            className="quiet-button danger"
                            name="transition"
                            value="release"
                          >
                            Release
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
                <details className="nested-edit">
                  <summary>Add a hold</summary>
                  <HoldForm
                    jobId={job.id}
                    start={job.shootStart}
                    end={job.shootEnd}
                  />
                </details>
              </div>
            </details>

            <details>
              <summary>People and organizations</summary>
              <div className="disclosure-body">
                {participants.map(({ participant, person, organization }) => (
                  <Link
                    href={person ? `/people/${person.id}` : "#"}
                    className="record-row"
                    key={participant.id}
                  >
                    <div className="person-record">
                      <span className="avatar small-avatar">
                        <UserRound size={15} />
                      </span>
                      <span>
                        <strong>{participant.displayNameSnapshot}</strong>
                        <small>
                          {participant.role}
                          {organization ? ` · ${organization}` : ""}
                        </small>
                      </span>
                    </div>
                  </Link>
                ))}
                <details className="nested-edit">
                  <summary>Add a person</summary>
                  <ParticipantForm jobId={job.id} />
                </details>
              </div>
            </details>

            <details>
              <summary>Questions, communications, and artifacts</summary>
              <div className="disclosure-body">
                {activeQuestions.map((question) => (
                  <div className="record-row" key={question.id}>
                    <div>
                      <strong>{question.question}</strong>
                      <span>{question.whyItMatters}</span>
                    </div>
                    <small className="record-state">{question.status}</small>
                  </div>
                ))}
                {messages.map((message) => (
                  <div className="record-row" key={message.id}>
                    <div>
                      <strong>{message.subject}</strong>
                      <span>Communication · revision {message.revision}</span>
                    </div>
                    <small className={`record-state ${message.status}`}>
                      {message.status}
                    </small>
                  </div>
                ))}
                {!activeQuestions.length && !messages.length && (
                  <p className="muted">
                    No current questions or communications.
                  </p>
                )}
              </div>
            </details>

            <details>
              <summary>Activity and sources</summary>
              <div className="disclosure-body">
                {history.map((item) => (
                  <div className="record-row" key={item.id}>
                    <div>
                      <strong>{item.summary}</strong>
                      <span>{item.createdAt.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {documents.map((source) => (
                  <details
                    className="source-document compact-source"
                    key={source.id}
                  >
                    <summary>
                      <FileText size={15} />{" "}
                      {source.subject ?? source.type.replaceAll("_", " ")}
                    </summary>
                    <pre>
                      {source.content ?? "This source has no text preview."}
                    </pre>
                  </details>
                ))}
              </div>
            </details>

            <details>
              <summary>Sources and confidence</summary>
              <div className="disclosure-body">
                {fieldRows.map(({ field, revision }) => (
                  <div className="record-row" key={field.id}>
                    <div>
                      <strong>{field.label ?? field.key}</strong>
                      <span>
                        {field.requirementReason ?? "Stored in the job brief."}
                      </span>
                    </div>
                    <small className="record-state">
                      {revision?.informationState ?? "missing"}
                      {revision?.confidence != null
                        ? ` · ${revision.confidence}%`
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
            </details>

            <details>
              <summary>
                <Pencil size={15} /> Edit job details
              </summary>
              <div className="disclosure-body">
                <JobForm organizations={orgs} job={job} />
              </div>
            </details>
          </div>
        </section>
      </div>
    </>
  );
}
