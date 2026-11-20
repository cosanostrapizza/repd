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
      row.review.kind !== "producer_response" &&
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
    <div
      className="content"
      data-workspace-current-label={
        target
          ? `${extraction.producerName.value ?? "The producer"} replied`
          : (extraction.jobTitle.value ?? "Review inquiry")
      }
      data-workspace-job-title={target?.title}
      data-workspace-job-href={target ? `/jobs/${target.id}` : undefined}
    >
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {target ? "Producer update" : "New inquiry"}
          </p>
          <h1>
            {target
              ? `${extraction.producerName.value ?? "The producer"} replied`
              : (extraction.jobTitle.value ?? "New opportunity")}
          </h1>
          <p className="lede">
            {target
              ? target.title
              : [extraction.producerName.value, extraction.agencyName.value]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
      </div>
      <div className="compressed-review">
        <section className="card briefing-card">
          <ReviewAcceptanceForm
            reviewId={row.review.id}
            targetJobId={target?.id}
            kind={row.review.kind}
            summary={extraction.summary}
            assessment={extraction.assessment}
            recommendations={extraction.recommendations}
            producerRequests={extraction.producerRequests}
            operationalObligations={extraction.operationalObligations}
            requestedDates={extraction.requestedDates}
            holdRequest={extraction.holdRequest}
            budgetRange={extraction.budgetRange}
            fields={fields}
            candidates={row.review.matchCandidates}
          />
        </section>
        <details className="source-document review-source">
          <summary>Details & source</summary>
          <pre className="source-copy">{row.source.content}</pre>
        </details>
        <div className="review-reject">
          <form action={rejectReview} className="form-actions">
            <input type="hidden" name="reviewId" value={row.review.id} />
            <button className="button ghost danger">Dismiss</button>
          </form>
        </div>
      </div>
    </div>
  );
}
