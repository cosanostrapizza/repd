import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { CommunicationEditor } from "@/components/agent/communication-editor";
import { InvoiceDraftEditor } from "@/components/agent/invoice-draft-editor";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { db } from "@/db/client";
import {
  actions,
  communications,
  coordinationDependencies,
  holds,
  invoiceDrafts,
  jobs,
  people,
  questions,
  sources,
} from "@/db/schema";
import { prepareInvoice } from "@/lib/agent-actions";
import { requireContext } from "@/lib/auth";
import { formatCalendarDate } from "@/lib/calendar-date";
import { bookingLabels, formatMoney } from "@/lib/domain";
import {
  recordHoldPreference,
  transitionAction,
  transitionHold,
} from "@/lib/server-actions";

export default async function ActionWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const [row] = await db
    .select({ action: actions, job: jobs, person: people })
    .from(actions)
    .leftJoin(jobs, eq(actions.jobId, jobs.id))
    .leftJoin(people, eq(actions.personId, people.id))
    .where(and(eq(actions.id, id), eq(actions.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) notFound();
  const { action, job, person } = row;
  if (job && ["advance_inquiry", "treatment_commitment"].includes(action.kind))
    redirect(`/jobs/${job.id}#next-steps`);
  const pageTitle =
    action.kind === "invoice" && action.status !== "open"
      ? "Review invoice draft"
      : action.title;
  const header = (
    <header
      className="detail-head"
      data-workspace-current-label={pageTitle}
      data-workspace-job-title={job?.title}
      data-workspace-job-href={job ? `/jobs/${job.id}` : undefined}
    >
      <div className="detail-head-inner">
        <div className="action-workspace-head">
          <div>
            <h1>{pageTitle}</h1>
            {job && (
              <p className="review-job-context">
                <Link href={`/jobs/${job.id}`}>{job.title}</Link>
                {person?.name ? ` · ${person.name}` : ""}
              </p>
            )}
          </div>
          <div>
            {job && (
              <Link href={`/jobs/${job.id}#next-steps`} className="quiet-link">
                Back to job →
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );

  if (
    action.kind === "producer_coordination" ||
    action.kind === "missing_information"
  ) {
    const [communication] = await db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.actionId, action.id),
          eq(communications.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(communications.createdAt))
      .limit(1);
    const allJobQuestions = job
      ? await db
          .select()
          .from(questions)
          .where(
            and(
              eq(questions.jobId, job.id),
              eq(questions.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(questions.createdAt)
      : [];
    const payload = action.payload as { questionIds?: string[] };
    const relatedQuestions = payload.questionIds?.length
      ? allJobQuestions.filter((question) =>
          payload.questionIds!.includes(question.id),
        )
      : allJobQuestions;
    const evidence = job
      ? await db
          .select()
          .from(sources)
          .where(
            and(
              eq(sources.jobId, job.id),
              eq(sources.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(desc(sources.capturedAt))
          .limit(3)
      : [];
    const treatmentPayload = action.payload as {
      treatmentCondition?: string;
      conditionResolvedDate?: string;
      instructionAt?: string;
    };
    const objectiveDependencies = action.objectiveId
      ? await db
          .select()
          .from(coordinationDependencies)
          .where(
            and(
              eq(coordinationDependencies.workspaceId, ctx.workspaceId),
              eq(coordinationDependencies.objectiveId, action.objectiveId),
            ),
          )
      : [];
    const treatmentDependency = objectiveDependencies.find(
      (dependency) => dependency.key === "treatment_deadline",
    );
    const deckDependency = objectiveDependencies.find(
      (dependency) => dependency.key === "deck_arrival",
    );
    const dependencyValue = treatmentDependency?.value as {
      dueDate?: string | null;
      conditionResolvedDate?: string | null;
    } | null;
    const resolvedConditionDate =
      treatmentPayload.conditionResolvedDate ??
      dependencyValue?.conditionResolvedDate ??
      (deckDependency?.value as { dueDate?: string | null } | null)?.dueDate ??
      null;
    return (
      <>
        {header}
        <div className="content review-content">
          <div className="review-recipient-line">
            <span>To</span>
            <strong>{person?.name ?? "Producer not identified"}</strong>
            <span aria-hidden="true">·</span>
            <span>
              {communication?.toEmail ?? person?.email ?? "Email missing"}
            </span>
            <span className={`state-pill ${communication?.status ?? "draft"}`}>
              {communication?.status === "sent"
                ? "Sent confirmed"
                : (communication?.status ?? "draft").replaceAll("_", " ")}
            </span>
          </div>
          {(treatmentPayload.treatmentCondition ||
            dependencyValue?.dueDate) && (
            <section
              className="review-commitments"
              aria-label="Critical commitments and conditions"
            >
              <div>
                <span>Treatment deadline</span>
                <strong>
                  {dependencyValue?.dueDate
                    ? formatCalendarDate(dependencyValue.dueDate)
                    : "Recorded in the job"}
                </strong>
              </div>
              <div>
                <span>Condition</span>
                <strong>
                  {treatmentPayload.treatmentCondition ??
                    "Review the promised deck"}
                </strong>
                {resolvedConditionDate && (
                  <small>
                    “Tomorrow” was anchored to{" "}
                    {formatCalendarDate(resolvedConditionDate)} from the
                    original instruction.
                  </small>
                )}
              </div>
            </section>
          )}
          {communication ? (
            <CommunicationEditor
              communication={communication}
              actionId={action.id}
              questions={relatedQuestions}
            />
          ) : (
            <section className="card card-pad">
              <p className="eyebrow">Prepared note</p>
              <h2>Communication needs recipient details</h2>
              <p>{action.preparedContent ?? action.recommendation}</p>
              <p className="muted">
                This older recommendation has no structured email draft. Add the
                producer to the job, then paste or compose the message in your
                email client.
              </p>
            </section>
          )}
          <details className="review-supporting-details">
            <summary>Reasoning and supporting evidence</summary>
            <div className="review-supporting-body">
              <div>
                <strong>Why this reply</strong>
                <p>{action.recommendation}</p>
                <p className="muted">
                  Approval records your decision only. Opening or copying the
                  draft does not prove delivery.
                </p>
              </div>
              {evidence.length > 0 && (
                <div className="review-evidence">
                  <strong>Sources Repd used</strong>
                  {evidence.map((source) => (
                    <details className="source-document" key={source.id}>
                      <summary>
                        {source.subject ?? source.type.replaceAll("_", " ")} ·{" "}
                        {source.capturedAt.toLocaleDateString()}
                      </summary>
                      <pre>
                        {source.content ?? "Source content is not available."}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </>
    );
  }

  if (action.kind === "hold_conflict" && job) {
    const mine = await db
      .select()
      .from(holds)
      .where(
        and(
          eq(holds.jobId, job.id),
          eq(holds.workspaceId, ctx.workspaceId),
          eq(holds.status, "active"),
        ),
      );
    const all = await db
      .select({ hold: holds, job: jobs })
      .from(holds)
      .innerJoin(jobs, eq(holds.jobId, jobs.id))
      .where(
        and(
          eq(holds.workspaceId, ctx.workspaceId),
          eq(holds.status, "active"),
          ne(holds.jobId, job.id),
        ),
      );
    const conflicts = all.filter((other) =>
      mine.some(
        (own) =>
          own.startsAt < other.hold.endsAt && own.endsAt > other.hold.startsAt,
      ),
    );
    const conflictPayload = action.payload as {
      holdIds?: string[];
      preferenceHoldId?: string;
      preferenceRecordedAt?: string;
    };
    const cards = conflictPayload.holdIds?.length
      ? [
          ...mine
            .filter((hold) => conflictPayload.holdIds!.includes(hold.id))
            .map((hold) => ({ hold, job })),
          ...all.filter((item) =>
            conflictPayload.holdIds!.includes(item.hold.id),
          ),
        ].filter(
          (item, index, rows) =>
            rows.findIndex(
              (candidate) => candidate.hold.id === item.hold.id,
            ) === index,
        )
      : [...mine.map((hold) => ({ hold, job })), ...conflicts];
    return (
      <>
        {header}
        <div className="content review-content">
          <section className="hold-comparison-section">
            <div className="hold-comparison-heading">
              <div>
                <h2>Which job should take priority?</h2>
                <p>
                  Compare competing holds, choose a preference, or explicitly
                  release one.
                </p>
              </div>
              <span className="trust-note">
                A preference changes no booking.
              </span>
            </div>
            <div className="hold-comparison-grid">
              {cards.map((item) => (
                <article
                  className={`hold-decision ${conflictPayload.preferenceHoldId === item.hold.id ? "preferred" : ""}`}
                  key={item.hold.id}
                >
                  <div>
                    <span className={`hold-rank ${item.hold.kind}`}>
                      {item.hold.kind === "confirmed"
                        ? "Confirmed"
                        : `${item.hold.kind} hold`}
                    </span>
                    <h3>{item.job.title}</h3>
                    <p className="hold-dates">
                      {item.hold.startsAt.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      –{" "}
                      {item.hold.endsAt.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <dl className="hold-facts">
                      <div>
                        <dt>Fee</dt>
                        <dd>
                          {formatMoney(item.job.feeCents, item.job.currency)}{" "}
                          <small>{item.job.feeState}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Booking</dt>
                        <dd>{bookingLabels[item.job.bookingStatus]}</dd>
                      </div>
                    </dl>
                    {conflictPayload.preferenceHoldId === item.hold.id && (
                      <span className="preference-note">
                        Current priority preference
                      </span>
                    )}
                  </div>
                  <div className="action-controls conflict-actions">
                    <form action={recordHoldPreference}>
                      <input type="hidden" name="actionId" value={action.id} />
                      <input type="hidden" name="holdId" value={item.hold.id} />
                      <button
                        className="button small"
                        disabled={
                          conflictPayload.preferenceHoldId === item.hold.id
                        }
                      >
                        {conflictPayload.preferenceHoldId === item.hold.id
                          ? "Priority recorded"
                          : `Prefer ${item.job.title}`}
                      </button>
                    </form>
                    <form action={transitionHold}>
                      <input type="hidden" name="holdId" value={item.hold.id} />
                      <ConfirmSubmitButton
                        className="button secondary small"
                        name="transition"
                        value="release"
                        confirmation={`Release the hold for ${item.job.title}? This updates the job's booking status.`}
                      >
                        Release this hold
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </article>
              ))}
            </div>
            <p className="trust-note">
              No booking has been confirmed by recording a preference.
              Confirming still requires producer confirmation or an explicit
              booking record; releasing a hold requires confirmation.
            </p>
          </section>
          <details className="review-supporting-details">
            <summary>Repd’s assessment</summary>
            <div className="review-supporting-body">
              <p>{action.recommendation}</p>
            </div>
          </details>
        </div>
      </>
    );
  }

  if (action.kind === "invoice" && job) {
    const [draft] = await db
      .select()
      .from(invoiceDrafts)
      .where(
        and(
          eq(invoiceDrafts.actionId, action.id),
          eq(invoiceDrafts.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1);
    const missing = [
      !job.feeCents && "fee",
      !job.paymentTerms && "payment terms",
      !job.clientOrganizationId && "billing client",
    ].filter(Boolean);
    const evidence = await db
      .select()
      .from(sources)
      .where(
        and(
          eq(sources.jobId, job.id),
          eq(sources.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(sources.capturedAt))
      .limit(3);
    return (
      <>
        {header}
        <div className="content review-content">
          <section className="card card-pad invoice-review-card">
            {missing.length > 0 ? (
              <div className="form-message error">
                Missing before a complete invoice: {missing.join(", ")}.
              </div>
            ) : (
              <p className="trust-note">
                Internal draft · not numbered, issued, sent, or paid.
              </p>
            )}
            {!draft && (
              <form action={prepareInvoice}>
                <input type="hidden" name="actionId" value={action.id} />
                <button className="button" disabled={missing.length > 0}>
                  Prepare invoice draft
                </button>
              </form>
            )}
            {draft && (
              <InvoiceDraftEditor
                draft={draft}
                fallbackDescription={`Creative fee — ${job.title}`}
                currency={job.currency}
                actionId={action.id}
              />
            )}
          </section>
          <details className="review-supporting-details">
            <summary>Reasoning and supporting evidence</summary>
            <div className="review-supporting-body">
              <div>
                <strong>Why this draft</strong>
                <p>{action.recommendation}</p>
              </div>
              {evidence.length > 0 && (
                <div className="review-evidence">
                  <strong>Recent job sources</strong>
                  {evidence.map((source) => (
                    <details className="source-document" key={source.id}>
                      <summary>
                        {source.subject ?? source.type.replaceAll("_", " ")} ·{" "}
                        {source.capturedAt.toLocaleDateString()}
                      </summary>
                      <pre>
                        {source.content ?? "Source content is not available."}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="content">
        <div className="decision-grid">
          <section className="card card-pad">
            <p className="eyebrow">Decision required</p>
            <h2>Review the proposed information</h2>
            <p>{action.recommendation}</p>
            <div className="proposal-box">
              <span>Existing information remains unchanged</span>
              <strong>
                Accept, correct, or reject source-backed changes from the job
                review.
              </strong>
            </div>
            {job && (
              <Link className="button" href={`/jobs/${job.id}`}>
                Open job brief
              </Link>
            )}
          </section>
          <aside className="card card-pad">
            <p className="eyebrow">Action history</p>
            <p>Status: {action.status.replaceAll("_", " ")}</p>
            {action.status !== "resolved" && (
              <form action={transitionAction}>
                <input type="hidden" name="actionId" value={action.id} />
                <button
                  className="button ghost danger"
                  name="transition"
                  value="dismiss"
                >
                  Dismiss recommendation
                </button>
              </form>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
