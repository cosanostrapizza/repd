import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  JobActivityTimeline,
  JobArtifacts,
  JobHeader,
  JobNextSteps,
  JobRecord,
} from "@/components/jobs/job-workspace-sections";
import { db } from "@/db/client";
import { jobParticipants, organizations, people } from "@/db/schema";
import { requireContext } from "@/lib/auth";
import { getJobActivityTimeline } from "@/lib/job-activity";
import { getDisplayedJobFacts } from "@/lib/job-facts";
import { getJobWorkspaceState } from "@/lib/workspace-state";

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

  const [organizationsList, participants, displayedFacts, activity] =
    await Promise.all([
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
      getDisplayedJobFacts(ctx.workspaceId, id),
      getJobActivityTimeline(ctx.workspaceId, id),
    ]);

  return (
    <>
      <JobHeader job={workspaceState.job} client={workspaceState.clientName} />
      <main
        className="content job-document"
        data-agent-job-id={workspaceState.job.id}
        data-agent-job-title={workspaceState.job.title}
      >
        {justUpdated && (
          <div className="update-notice" role="status">
            <div>
              <strong>Producer update incorporated</strong>
              <span>
                Current facts, dependencies, and history have been reconciled.
              </span>
            </div>
          </div>
        )}
        <div className="job-document-grid">
          <div className="job-document-main">
            <JobNextSteps state={workspaceState} />
            <JobRecord
              state={workspaceState}
              organizations={organizationsList}
              participants={participants}
              facts={displayedFacts}
            />
          </div>
          <aside className="job-document-rail">
            <JobArtifacts state={workspaceState} />
            <JobActivityTimeline items={activity} />
          </aside>
        </div>
      </main>
    </>
  );
}
