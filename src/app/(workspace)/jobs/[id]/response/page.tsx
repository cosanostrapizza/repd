import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ResponseForm } from "@/components/agent/intake-forms";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { getAIConfiguration } from "@/lib/ai/provider";
import { requireContext } from "@/lib/auth";

export default async function JobResponsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!job) notFound();
  const configuration = getAIConfiguration();
  return (
    <div
      className="content narrow-content"
      data-workspace-current-label="Producer update"
      data-workspace-job-title={job.title}
      data-workspace-job-href={`/jobs/${job.id}`}
    >
      <div className="page-head">
        <div>
          <p className="eyebrow">Incoming information · {job.title}</p>
          <h1>What did the producer say?</h1>
          <p className="lede">
            Repd will compare this response with the current brief and propose
            changes. Confirmed information is never overwritten silently.
          </p>
        </div>
        <Link href={`/jobs/${job.id}`} className="button ghost">
          Back to job
        </Link>
      </div>
      <section className="card card-pad">
        <ResponseForm jobId={job.id} configured={configuration.configured} />
      </section>
    </div>
  );
}
