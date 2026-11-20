import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { CommunicationEditor } from "@/components/agent/communication-editor";
import { InvoiceDraftEditor } from "@/components/agent/invoice-draft-editor";
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
  const pageExplanation =
    action.kind === "invoice" && action.status !== "open"
      ? "Repd prepared this internal invoice draft from the recorded job terms. Review its actual contents below; it has not been issued or sent."
      : action.explanation;
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
            <p className="eyebrow">
              Prepared work · {action.kind.replaceAll("_", " ")}
            </p>
            <h1>{pageTitle}</h1>
            <p className="lede">{pageExplanation}</p>
          </div>
          <div>
            <span className={`badge ${action.priority}`}>
              {action.status.replaceAll("_", " ")}
            </span>
            {job && (
              <Link
                href={`/jobs/${job.id}#next-steps`}
                className="button ghost"
              >
                View {job.title} →
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
        <div className="content">
          <section className="context-strip">
            <div>
              <span>Job</span>
              <strong>{job?.title ?? "Workspace"}</strong>
            </div>
            <div>
              <span>Recipient</span>
              <strong>{person?.name ?? "Producer not identified"}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>
                {communication?.toEmail ?? person?.email ?? "Missing"}
              </strong>
            </div>
            <div>
              <span>External status</span>
              <strong>
                {communication?.status === "sent"
                  ? "User confirmed sent"
                  : "Not confirmed sent"}
              </strong>
            </div>
          </section>
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
          <section className="card card-pad recommendation">
            <p className="eyebrow">Repd’s recommendation</p>
            <h2>{action.recommendation}</h2>
            <p>
              Approval records your decision only. Copying or opening the draft
              does not prove delivery.
            </p>
          </section>
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
          {evidence.length > 0 && (
            <section className="card card-pad section">
              <p className="eyebrow">Supporting evidence</p>
              <h2>Sources Repd used</h2>
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
            </section>
          )}
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
        <div className="content">
          <div className="decision-grid">
            <main>
              <section className="card card-pad section">
                <p className="eyebrow">Scheduling decision</p>
                <h2>Which job should take priority?</h2>
                <p>
                  Record a scheduling preference without confirming a booking or
                  releasing either hold.
                </p>
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
                      <p>
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
                      <p>
                        {item.job.feeState === "confirmed"
                          ? "Agreed"
                          : "Proposed"}{" "}
                        fee {formatMoney(item.job.feeCents, item.job.currency)}
                      </p>
                      <p>
                        Booking status: {bookingLabels[item.job.bookingStatus]}
                      </p>
                      {conflictPayload.preferenceHoldId === item.hold.id && (
                        <span className="preference-note">
                          Current priority preference
                        </span>
                      )}
                    </div>
                    <div className="action-controls conflict-actions">
                      <form action={recordHoldPreference}>
                        <input
                          type="hidden"
                          name="actionId"
                          value={action.id}
                        />
                        <input
                          type="hidden"
                          name="holdId"
                          value={item.hold.id}
                        />
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
                        <input
                          type="hidden"
                          name="holdId"
                          value={item.hold.id}
                        />
                        <button
                          className="button secondary small"
                          name="transition"
                          value="release"
                        >
                          Release this hold
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
                <p className="trust-note">
                  A preference is internal. Confirming a booking requires actual
                  producer confirmation or an explicit booking record.
                </p>
              </section>
            </main>
            <aside>
              <section className="card card-pad recommendation">
                <p className="eyebrow">Repd’s assessment</p>
                <h2>{action.recommendation}</h2>
                <p>
                  Compare rank, certainty, fee, dates, and producer
                  relationship. Repd will never release a hold without your
                  explicit choice.
                </p>
              </section>
            </aside>
          </div>
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
    return (
      <>
        {header}
        <div className="content">
          <div className="decision-grid">
            <main>
              <section className="card card-pad">
                <p className="eyebrow">Invoice review</p>
                <h2>{job.title}</h2>
                {missing.length > 0 ? (
                  <div className="form-message error">
                    Missing before a complete invoice: {missing.join(", ")}.
                  </div>
                ) : (
                  <p className="trust-note">
                    This prepares an internal invoice draft only. It does not
                    assign an invoice number, send a bill, or record payment.
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
            </main>
            <aside>
              <section className="card card-pad recommendation">
                <p className="eyebrow">Repd’s recommendation</p>
                <h2>{action.recommendation}</h2>
                <p>
                  Review the source fee and client billing details before
                  exporting to an invoicing provider.
                </p>
              </section>
            </aside>
          </div>
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
