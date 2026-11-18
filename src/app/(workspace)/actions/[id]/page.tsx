import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CommunicationEditor } from "@/components/agent/communication-editor";
import { InvoiceDraftEditor } from "@/components/agent/invoice-draft-editor";
import { db } from "@/db/client";
import {
  actions,
  communications,
  holds,
  invoiceDrafts,
  jobs,
  people,
  questions,
  sources,
} from "@/db/schema";
import { prepareInvoice } from "@/lib/agent-actions";
import { requireContext } from "@/lib/auth";
import { bookingLabels, formatMoney } from "@/lib/domain";
import { transitionAction, transitionHold } from "@/lib/server-actions";

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
  const header = (
    <header className="detail-head">
      <div className="detail-head-inner">
        <div className="action-workspace-head">
          <div>
            <p className="eyebrow">
              Prepared work · {action.kind.replaceAll("_", " ")}
            </p>
            <h1>{action.title}</h1>
            <p className="lede">{action.explanation}</p>
          </div>
          <div>
            <span className={`badge ${action.priority}`}>
              {action.status.replaceAll("_", " ")}
            </span>
            {job && (
              <Link href={`/jobs/${job.id}`} className="button ghost">
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
      .limit(1);
    const relatedQuestions = job
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
    const cards = [...mine.map((hold) => ({ hold, job })), ...conflicts];
    return (
      <>
        {header}
        <div className="content">
          <div className="decision-grid">
            <main>
              <section className="card card-pad section">
                <p className="eyebrow">Scheduling decision</p>
                <h2>Competing work</h2>
                {cards.map((item) => (
                  <article className="hold-decision" key={item.hold.id}>
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
                        {formatMoney(item.job.feeCents, item.job.currency)} ·{" "}
                        {bookingLabels[item.job.bookingStatus]}
                      </p>
                    </div>
                    <form action={transitionHold} className="action-controls">
                      <input type="hidden" name="holdId" value={item.hold.id} />
                      {item.hold.kind !== "confirmed" && (
                        <button
                          className="button small"
                          name="transition"
                          value="confirm"
                        >
                          Keep and confirm
                        </button>
                      )}
                      <button
                        className="button secondary small"
                        name="transition"
                        value="release"
                      >
                        Release this hold
                      </button>
                    </form>
                  </article>
                ))}
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
                <p className="eyebrow">Invoice preparation</p>
                <h2>{job.title}</h2>
                <div className="invoice-preview">
                  <div>
                    <span>Bill to</span>
                    <strong>{draft?.billingName ?? "Missing"}</strong>
                  </div>
                  <div>
                    <span>Creative fee</span>
                    <strong>{formatMoney(job.feeCents, job.currency)}</strong>
                  </div>
                  <div>
                    <span>Payment terms</span>
                    <strong>{job.paymentTerms ?? "Missing"}</strong>
                  </div>
                  <div>
                    <span>Preparation status</span>
                    <strong>{draft?.status ?? "Not prepared"}</strong>
                  </div>
                </div>
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
                  <>
                    <p className="trust-note">
                      This is an editable internal preview. It has no invoice
                      number and has not been issued or sent.
                    </p>
                    <InvoiceDraftEditor
                      draft={draft}
                      fallbackDescription={`Creative fee — ${job.title}`}
                      currency={job.currency}
                    />
                  </>
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
