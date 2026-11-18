import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Pencil,
  UserRound,
} from "lucide-react";
import { ActionList } from "@/components/action-list";
import { ObjectiveDecisionForm } from "@/components/agent/objective-decision-form";
import { HoldForm, JobForm, ParticipantForm } from "@/components/forms";
import { db } from "@/db/client";
import {
  actions,
  activities,
  communications,
  coordinationDateOptions,
  coordinationDependencies,
  coordinationObjectives,
  holds,
  jobFieldRevisions,
  jobFields,
  jobParticipants,
  jobs,
  organizations,
  people,
  questions,
  sources,
} from "@/db/schema";
import { requireContext } from "@/lib/auth";
import {
  bookingLabels,
  formatMoney,
  lifecycleLabels,
  nextNeed,
} from "@/lib/domain";
import { transitionHold } from "@/lib/server-actions";

const display = (input: unknown) =>
  input == null || input === "" ? "Not known" : String(input);

export default async function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const [result] = await db
    .select({ job: jobs, client: organizations.name })
    .from(jobs)
    .leftJoin(organizations, eq(jobs.clientOrganizationId, organizations.id))
    .where(and(eq(jobs.id, id), eq(jobs.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!result) notFound();
  const { job, client } = result;
  const [
    orgs,
    participants,
    jobHolds,
    actionRows,
    history,
    fieldRows,
    openQuestions,
    documents,
    messages,
    objectives,
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
      .from(actions)
      .where(
        and(
          eq(actions.jobId, id),
          eq(actions.workspaceId, ctx.workspaceId),
          ne(actions.status, "resolved"),
        ),
      ),
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
      .limit(12),
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
          ne(questions.status, "answered"),
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
      .orderBy(desc(communications.createdAt)),
    db
      .select()
      .from(coordinationObjectives)
      .where(
        and(
          eq(coordinationObjectives.jobId, id),
          eq(coordinationObjectives.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(coordinationObjectives.updatedAt)),
  ]);
  const objective = objectives.find((item) => item.kind === "advance_inquiry");
  const [objectiveDependencies, objectiveDates] = objective
    ? await Promise.all([
        db
          .select()
          .from(coordinationDependencies)
          .where(
            and(
              eq(coordinationDependencies.objectiveId, objective.id),
              eq(coordinationDependencies.workspaceId, ctx.workspaceId),
            ),
          ),
        db
          .select()
          .from(coordinationDateOptions)
          .where(
            and(
              eq(coordinationDateOptions.objectiveId, objective.id),
              eq(coordinationDateOptions.workspaceId, ctx.workspaceId),
            ),
          ),
      ])
    : [[], []];
  const missing = fieldRows.filter(
    ({ field, revision }) =>
      field.requirementState === "required_now" &&
      (!revision || revision.informationState === "missing"),
  );
  const requestedDateRevision = fieldRows.find(
    ({ field }) => field.key === "requestedDates",
  )?.revision?.value;
  const requestedDates = Array.isArray(requestedDateRevision)
    ? requestedDateRevision.filter(
        (item): item is { label: string; relationship: string } =>
          typeof item === "object" &&
          item !== null &&
          "label" in item &&
          typeof item.label === "string",
      )
    : [];
  const coordination = actionRows.find(
    (item) => item.kind === "producer_coordination",
  );
  const sentMessage = messages.find((message) => message.status === "sent");
  const assessment = objective
    ? objective.summary
    : job.lifecycleStatus === "completed" && job.invoiceStatus === "not_ready"
      ? "The work is complete and the invoice still needs to be prepared."
      : sentMessage && openQuestions.length
        ? `You’re waiting on a producer response to ${openQuestions.length === 1 ? "one open question" : `${openQuestions.length} open questions`}.`
        : coordination
          ? coordination.explanation
          : requestedDates.length && !job.shootStart
            ? `${requestedDates.map((date) => date.label).join(" or ")} ${requestedDates.length === 1 ? "is a proposed date" : "are alternative proposed dates"}; neither is confirmed or held.`
            : missing.length
              ? `${missing.map(({ field }) => field.label ?? field.key).join(" and ")} ${missing.length === 1 ? "is" : "are"} still unresolved. ${nextNeed(job)} is the next useful step.`
              : `${job.title} is ${bookingLabels[job.bookingStatus].toLowerCase()} and ${nextNeed(job).toLowerCase()}.`;
  const overview = [
    {
      label: "Shoot",
      value: job.shootStart
        ? job.shootStart.toLocaleDateString("en-US", {
            weekday: "short",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : requestedDates.length
          ? requestedDates.map((date) => date.label).join(" or ")
          : "Not known",
      state: job.shootStart
        ? "confirmed"
        : requestedDates.length
          ? "unconfirmed"
          : "missing",
    },
    {
      label: "Creative fee",
      value: formatMoney(job.feeCents, job.currency),
      state: job.feeCents ? job.feeState : "missing",
    },
    {
      label: "Indicative budget",
      value:
        job.proposedBudgetMinCents != null && job.proposedBudgetMaxCents != null
          ? `${formatMoney(job.proposedBudgetMinCents, job.currency)}–${formatMoney(job.proposedBudgetMaxCents, job.currency)}`
          : "Not known",
      state: job.proposedBudgetMinCents != null ? "proposed" : "missing",
    },
    {
      label: "Usage",
      value: display(job.usageTerms),
      state: job.usageTerms ? "proposed" : "missing",
    },
    {
      label: "Location",
      value: display(job.location),
      state: job.location ? "proposed" : "missing",
    },
    {
      label: "Deliverables",
      value: display(job.deliverables),
      state: job.deliverables ? "proposed" : "missing",
    },
    {
      label: "Payment terms",
      value: display(job.paymentTerms),
      state: job.paymentTerms ? "proposed" : "missing",
    },
  ];
  return (
    <>
      <header className="detail-head">
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
                {job.titleSource === "generated" && (
                  <span className="badge">Provisional title</span>
                )}
              </div>
            </div>
            <div className="job-head-actions">
              <Link
                href={`/jobs/${job.id}/response`}
                className="button secondary"
              >
                Add producer response
              </Link>
              {actionRows[0] && (
                <Link href={`/actions/${actionRows[0].id}`} className="button">
                  Review next action
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="content">
        <section className="manager-assessment card">
          <div className="manager-icon">R</div>
          <div>
            <p className="eyebrow">Repd’s assessment</p>
            <h2>{assessment}</h2>
            <p>
              {actionRows[0]?.recommendation ??
                "No prepared decision is waiting right now."}
            </p>
          </div>
        </section>
        <div className="living-brief">
          <main>
            {objective && (
              <section className="section card objective-workspace">
                <div className="objective-head">
                  <div>
                    <p className="eyebrow">Active coordination objective</p>
                    <h2>{objective.title}</h2>
                    <p>{objective.outcome}</p>
                  </div>
                  <span className={`state-pill ${objective.state}`}>
                    {objective.state.replaceAll("_", " ")}
                  </span>
                </div>
                <div
                  className="objective-progress"
                  aria-label="Objective progress"
                >
                  {["Understand", "Check", "Decide", "Prepare", "Wait"].map(
                    (step, index) => (
                      <span
                        key={step}
                        className={
                          index <
                          (objective.state === "awaiting_decisions"
                            ? 2
                            : objective.state === "preparing_response"
                              ? 3
                              : objective.state === "awaiting_approval"
                                ? 4
                                : 5)
                            ? "done"
                            : ""
                        }
                      >
                        {step}
                      </span>
                    ),
                  )}
                </div>
                <div className="objective-checks">
                  <p className="eyebrow">Repd has checked</p>
                  {objectiveDependencies
                    .filter((dependency) => dependency.owner === "repd")
                    .map((dependency) => (
                      <article key={dependency.id}>
                        <CheckCircle2 size={18} />
                        <div>
                          <strong>{dependency.label}</strong>
                          <p>{dependency.result}</p>
                          <span className={`state-pill ${dependency.status}`}>
                            {dependency.status.replaceAll("_", " ")}
                          </span>
                        </div>
                      </article>
                    ))}
                </div>
                {(objective.state === "awaiting_decisions" ||
                  objective.state === "needs_attention") && (
                  <div className="objective-questionnaire">
                    <p className="eyebrow">A few decisions before I reply</p>
                    <ObjectiveDecisionForm
                      objectiveId={objective.id}
                      askCategoryConflict={objectiveDependencies.some(
                        (dependency) => dependency.key === "category_conflicts",
                      )}
                      dateOptions={objectiveDates.map((option) => ({
                        id: option.id,
                        label: option.label,
                        holdRequested: option.holdRequested,
                        holdPriority: option.holdPriority,
                        holdState: option.holdState,
                        decision: option.decision,
                        checkResult:
                          objectiveDependencies.find(
                            (dependency) =>
                              dependency.key === `availability:${option.id}`,
                          )?.result ?? "Not checked",
                      }))}
                    />
                  </div>
                )}
                {!["awaiting_decisions", "needs_attention"].includes(
                  objective.state,
                ) && (
                  <div className="objective-next">
                    <p className="eyebrow">Next appropriate action</p>
                    <strong>{objective.nextAction}</strong>
                  </div>
                )}
              </section>
            )}
            {actionRows.length > 0 && (
              <section className="section card">
                <div className="card-pad section-title">
                  <div>
                    <p className="eyebrow">What needs to happen next</p>
                    <h2>
                      {objective ? "Prepared work" : "Prepared decisions"}
                    </h2>
                  </div>
                </div>
                <ActionList rows={actionRows} />
              </section>
            )}
            <section className="section">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Living brief</p>
                  <h2>Overview</h2>
                </div>
                <span className="muted">
                  Updated {job.updatedAt.toLocaleDateString()}
                </span>
              </div>
              <div className="brief-grid">
                {overview.map((item) => (
                  <article className="brief-field card" key={item.label}>
                    <div>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <span className={`state-pill ${item.state}`}>
                      {item.state}
                    </span>
                  </article>
                ))}
              </div>
              {fieldRows.length > 0 && (
                <details className="card card-pad evidence-register">
                  <summary>View field evidence and confidence</summary>
                  {fieldRows.map(({ field, revision }) => (
                    <div className="evidence-row" key={field.id}>
                      <div>
                        <strong>{field.label ?? field.key}</strong>
                        <p>
                          {field.requirementReason ??
                            "Stored as part of the job brief."}
                        </p>
                      </div>
                      <div>
                        <span
                          className={`state-pill ${revision?.informationState ?? "missing"}`}
                        >
                          {revision?.informationState ?? "missing"}
                        </span>
                        {revision?.confidence != null && (
                          <small>{revision.confidence}% confidence</small>
                        )}
                      </div>
                    </div>
                  ))}
                </details>
              )}
            </section>
            <section className="section">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Decisions and coordination</p>
                  <h2>Open questions</h2>
                </div>
              </div>
              <div className="card">
                {openQuestions.map((question) => (
                  <article className="question-brief" key={question.id}>
                    <AlertCircle size={18} />
                    <div>
                      <h3>{question.question}</h3>
                      <p>{question.whyItMatters}</p>
                      <span className={`state-pill ${question.status}`}>
                        {question.status}
                      </span>
                    </div>
                  </article>
                ))}
                {!openQuestions.length && (
                  <div className="empty compact">
                    <CheckCircle2 />
                    <h3>No unanswered questions</h3>
                    <p>
                      Repd will surface meaningful gaps as the brief changes.
                    </p>
                  </div>
                )}
              </div>
            </section>
            <section className="section card card-pad">
              <p className="eyebrow">What changed</p>
              <h2>Activity</h2>
              {messages.map((message) => (
                <div className="activity" key={message.id}>
                  <div>
                    <strong>
                      {message.status === "sent"
                        ? "Communication marked sent"
                        : "Email draft prepared"}
                    </strong>
                    <div className="muted">
                      {message.subject} · revision {message.revision}
                    </div>
                  </div>
                </div>
              ))}
              {history.map((item) => (
                <div className="activity" key={item.id}>
                  <div>
                    <strong>{item.summary}</strong>
                    <div className="muted">
                      {item.createdAt.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {!history.length && !messages.length && (
                <p className="muted">No activity recorded yet.</p>
              )}
            </section>
            <section className="section card card-pad">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Source material</p>
                  <h2>Documents</h2>
                </div>
              </div>
              {documents.map((source) => (
                <details className="source-document" key={source.id}>
                  <summary>
                    <FileText size={16} />
                    <span>
                      {source.subject ?? source.type.replaceAll("_", " ")}
                    </span>
                    <small>{source.capturedAt.toLocaleDateString()}</small>
                  </summary>
                  <pre>
                    {source.content ?? "This source has no text preview."}
                  </pre>
                </details>
              ))}
              {!documents.length && (
                <p className="muted">No source documents have been attached.</p>
              )}
            </section>
          </main>
          <aside>
            <section className="section card card-pad">
              <p className="eyebrow">People</p>
              <h2>Relationships</h2>
              {participants.map(({ participant, person, organization }) => (
                <Link
                  href={person ? `/people/${person.id}` : "#"}
                  className="relationship-row"
                  key={participant.id}
                >
                  <div className="avatar">
                    <UserRound size={16} />
                  </div>
                  <div>
                    <strong>{participant.displayNameSnapshot}</strong>
                    <span>
                      {participant.role}
                      {organization ? ` · ${organization}` : ""}
                    </span>
                    {person?.email && <small>{person.email}</small>}
                  </div>
                </Link>
              ))}
              {!participants.length && (
                <p className="muted">No relationships linked yet.</p>
              )}
              <details className="edit-panel">
                <summary>Add a person</summary>
                <ParticipantForm jobId={job.id} />
              </details>
            </section>
            <section className="section card card-pad">
              <p className="eyebrow">Schedule</p>
              <h2>Holds</h2>
              {jobHolds.map((hold) => (
                <div className="hold-row" key={hold.id}>
                  <div>
                    <strong>
                      {hold.kind === "confirmed"
                        ? "Confirmed"
                        : `${hold.kind} hold`}
                    </strong>
                    <span>
                      {hold.startsAt.toLocaleDateString()} · {hold.status}
                    </span>
                  </div>
                  {hold.status === "active" && (
                    <form action={transitionHold}>
                      <input type="hidden" name="holdId" value={hold.id} />
                      {hold.kind !== "confirmed" && (
                        <button
                          className="button small"
                          name="transition"
                          value="confirm"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        className="button ghost danger small"
                        name="transition"
                        value="release"
                      >
                        Release
                      </button>
                    </form>
                  )}
                </div>
              ))}
              <details className="edit-panel">
                <summary>Add a hold</summary>
                <HoldForm
                  jobId={job.id}
                  start={job.shootStart}
                  end={job.shootEnd}
                />
              </details>
            </section>
            <details className="section card card-pad edit-panel">
              <summary>
                <Pencil size={15} /> Edit job details
              </summary>
              <p className="muted">
                Use explicit edit mode when the source-backed brief needs a
                manual correction.
              </p>
              <JobForm organizations={orgs} job={job} />
            </details>
          </aside>
        </div>
      </div>
    </>
  );
}
