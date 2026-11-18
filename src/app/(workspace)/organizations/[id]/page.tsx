import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { affiliations, jobs, organizations, people } from "@/db/schema";
import { requireContext } from "@/lib/auth";
import { archiveRelationship } from "@/lib/server-actions";
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const org = (
    await db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.id, id),
          eq(organizations.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!org) notFound();
  const [members, history] = await Promise.all([
    db
      .select({ person: people, affiliation: affiliations })
      .from(affiliations)
      .innerJoin(people, eq(affiliations.personId, people.id))
      .where(
        and(
          eq(affiliations.organizationId, id),
          eq(affiliations.workspaceId, ctx.workspaceId),
        ),
      ),
    db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.clientOrganizationId, id),
          eq(jobs.workspaceId, ctx.workspaceId),
        ),
      ),
  ]);
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">{org.kind.replaceAll("_", " ")}</p>
          <h1>{org.name}</h1>
          <p className="muted">{org.website ?? "No website"}</p>
        </div>
        {!org.archivedAt && (
          <form action={archiveRelationship}>
            <input type="hidden" name="recordId" value={id} />
            <input type="hidden" name="recordType" value="organization" />
            <button className="button secondary danger">Archive</button>
          </form>
        )}
      </div>
      <div className="grid-2">
        <main className="card">
          <div className="card-pad">
            <p className="eyebrow">History</p>
            <h2>Jobs</h2>
          </div>
          {history.map((job) => (
            <Link
              className="action-card"
              style={{ gridTemplateColumns: "1fr auto" }}
              href={`/jobs/${job.id}`}
              key={job.id}
            >
              <div>
                <h3>{job.title}</h3>
                <p>{job.lifecycleStatus.replace("_", " ")}</p>
              </div>
              <span>→</span>
            </Link>
          ))}
          {!history.length && (
            <div className="empty">No jobs for this organization yet.</div>
          )}
        </main>
        <aside className="card card-pad">
          <p className="eyebrow">Network</p>
          <h2>People</h2>
          {members.map(({ person, affiliation }) => (
            <Link
              className="activity"
              href={`/people/${person.id}`}
              key={affiliation.id}
            >
              <div className="avatar">{person.name[0]}</div>
              <div>
                <strong>{person.name}</strong>
                <div className="muted">
                  {affiliation.title ?? "Role not set"}
                </div>
              </div>
            </Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
