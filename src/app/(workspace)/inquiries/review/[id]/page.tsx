import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ReviewAcceptanceForm } from "@/components/agent/intake-forms";
import { db } from "@/db/client";
import { intakeReviews, jobs, sources } from "@/db/schema";
import { rejectReview } from "@/lib/agent-actions";
import { inquiryExtractionSchema } from "@/lib/ai/schemas";
import { requireContext } from "@/lib/auth";
import { extractionFields } from "@/lib/services/intake";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const [row] = await db
    .select({ review: intakeReviews, source: sources })
    .from(intakeReviews)
    .innerJoin(sources, eq(intakeReviews.sourceId, sources.id))
    .where(
      and(
        eq(intakeReviews.id, id),
        eq(intakeReviews.workspaceId, ctx.workspaceId),
        eq(sources.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const [target] = row.review.targetJobId
    ? await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, row.review.targetJobId),
            eq(jobs.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1)
    : [];
  if (row.review.status === "failed")
    return (
      <div className="content narrow-content">
        <div className="page-head">
          <div>
            <p className="eyebrow">Source preserved</p>
            <h1>Repd couldn’t analyze this yet.</h1>
            <p className="lede">
              The original message is safely stored. No job information was
              changed.
            </p>
          </div>
        </div>
        <div className="card card-pad">
          <div className="form-message error">
            {row.review.errorMessage ?? "AI analysis is unavailable."}
          </div>
          <details className="source-document">
            <summary>View original message</summary>
            <pre>{row.source.content}</pre>
          </details>
          <div className="form-actions">
            <Link href="/jobs/new" className="button secondary">
              Create manually
            </Link>
            <Link href="/inquiries/new" className="button">
              Try another inquiry
            </Link>
          </div>
        </div>
      </div>
    );
  if (row.review.status !== "ready" || !row.review.proposedData)
    return (
      <div className="content">
        <div className="empty">
          <h1>Review {row.review.status}</h1>
          <p>This source has already been handled.</p>
          <Link
            className="button"
            href={
              row.review.targetJobId
                ? `/jobs/${row.review.targetJobId}`
                : "/jobs"
            }
          >
            Continue
          </Link>
        </div>
      </div>
    );
  const extraction = inquiryExtractionSchema.parse(row.review.proposedData);
  const fields = extractionFields(extraction).map((field) => {
    const existing = target?.[field.key as keyof typeof target];
    const conflict =
      existing !== undefined &&
      existing !== null &&
      field.value !== null &&
      String(existing) !== String(field.value);
    return {
      ...field,
      existing,
      state: conflict ? "conflicting" : field.state,
    };
  });
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Repd’s proposed understanding</p>
          <h1>
            {target
              ? `What changed for ${target.title}`
              : (extraction.jobTitle.value ?? "New opportunity")}
          </h1>
          <p className="lede">
            {target
              ? "Review the update as a whole. Correct a detail only when Repd misunderstood it."
              : "Repd has read the message, assessed the opportunity, and prepared the next move."}
          </p>
        </div>
        <span className="badge routine">Awaiting your review</span>
      </div>
      <div className="review-layout">
        <main>
          <section className="card briefing-card section">
            <ReviewAcceptanceForm
              reviewId={row.review.id}
              targetJobId={target?.id}
              kind={row.review.kind}
              summary={extraction.summary}
              assessment={extraction.assessment}
              recommendations={extraction.recommendations}
              producerRequests={extraction.producerRequests}
              requestedDates={extraction.requestedDates}
              holdRequest={extraction.holdRequest}
              budgetRange={extraction.budgetRange}
              fields={fields}
              candidates={row.review.matchCandidates}
            />
          </section>
        </main>
        <aside>
          <section className="card card-pad sticky-card">
            <p className="eyebrow">Original source · immutable</p>
            <h2>Source message</h2>
            <details className="source-document" open={false}>
              <summary>View original message</summary>
              <pre className="source-copy">{row.source.content}</pre>
            </details>
            <p className="trust-note">
              The source is preserved. Accepting the briefing records Repd’s
              interpretation as proposed or unconfirmed information.
            </p>
          </section>
          <form action={rejectReview} className="form-actions">
            <input type="hidden" name="reviewId" value={row.review.id} />
            <button className="button ghost danger">Reject inquiry</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
