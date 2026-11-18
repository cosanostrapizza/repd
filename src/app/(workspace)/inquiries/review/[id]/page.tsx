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
              ? `Review changes to ${target.title}`
              : "Review the new job"}
          </h1>
          <p className="lede">
            Correct anything Repd misunderstood. Accepting creates proposed,
            source-backed information—not unquestioned facts.
          </p>
        </div>
        <span className="badge routine">Awaiting your review</span>
      </div>
      <div className="review-layout">
        <main>
          <section className="card card-pad section">
            <div className="assessment">
              <p className="eyebrow">What Repd understood</p>
              <p>{extraction.summary}</p>
            </div>
            <ReviewAcceptanceForm
              reviewId={row.review.id}
              targetJobId={target?.id}
              fields={fields}
              candidates={row.review.matchCandidates}
            />
          </section>
          {row.review.matchCandidates.length > 0 && (
            <section className="card card-pad">
              <p className="eyebrow">Possible existing jobs</p>
              <h2>Potential matches</h2>
              {row.review.matchCandidates.map((candidate) => (
                <div className="match-row" key={candidate.jobId}>
                  <div>
                    <strong>{candidate.title}</strong>
                    <p>{candidate.reason}</p>
                  </div>
                  <span>
                    {Math.round(candidate.confidence * 100)}% similarity
                  </span>
                </div>
              ))}
            </section>
          )}
        </main>
        <aside>
          <section className="card card-pad sticky-card">
            <p className="eyebrow">Original source · immutable</p>
            <h2>Producer message</h2>
            <pre className="source-copy">{row.source.content}</pre>
            <p className="trust-note">
              Evidence quotes shown beside fields come from this source.
            </p>
          </section>
          <form action={rejectReview} className="form-actions">
            <input type="hidden" name="reviewId" value={row.review.id} />
            <button className="button ghost danger">
              Reject this proposal
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
