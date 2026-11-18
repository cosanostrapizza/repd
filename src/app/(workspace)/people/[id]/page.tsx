import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  affiliations,
  jobParticipants,
  jobs,
  organizations,
  people,
} from "@/db/schema";
import { requireContext } from "@/lib/auth";
import { addAffiliation, archiveRelationship } from "@/lib/server-actions";
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();
  const person = (
    await db
      .select()
      .from(people)
      .where(and(eq(people.id, id), eq(people.workspaceId, ctx.workspaceId)))
      .limit(1)
  )[0];
  if (!person) notFound();
  const [orgs, links, history] = await Promise.all([
    db
      .select()
      .from(organizations)
      .where(eq(organizations.workspaceId, ctx.workspaceId)),
    db
      .select({ affiliation: affiliations, organization: organizations })
      .from(affiliations)
      .innerJoin(
        organizations,
        eq(affiliations.organizationId, organizations.id),
      )
      .where(
        and(
          eq(affiliations.personId, id),
          eq(affiliations.workspaceId, ctx.workspaceId),
        ),
      ),
    db
      .select({ job: jobs, role: jobParticipants.role })
      .from(jobParticipants)
      .innerJoin(jobs, eq(jobParticipants.jobId, jobs.id))
      .where(
        and(
          eq(jobParticipants.personId, id),
          eq(jobParticipants.workspaceId, ctx.workspaceId),
        ),
      ),
  ]);
  const currentAffiliation =
    links.find(
      ({ affiliation }) => affiliation.isPrimary && !affiliation.endedOn,
    ) ?? links.find(({ affiliation }) => !affiliation.endedOn);
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Person</p>
          <h1>{person.name}</h1>
          <p className="muted">
            {currentAffiliation
              ? `${currentAffiliation.affiliation.title ?? "Role not set"} at ${currentAffiliation.organization.name} · `
              : ""}
            {person.email ?? "No email"}
            {person.phone ? ` · ${person.phone}` : ""}
          </p>
        </div>
        {!person.archivedAt && (
          <form action={archiveRelationship}>
            <input type="hidden" name="recordId" value={id} />
            <input type="hidden" name="recordType" value="person" />
            <button className="button secondary danger">Archive</button>
          </form>
        )}
      </div>
      <div className="grid-2">
        <main>
          {currentAffiliation && (
            <section className="card card-pad section relationship-current">
              <p className="eyebrow">Current relationship</p>
              <h2>{currentAffiliation.affiliation.title ?? "Role not set"}</h2>
              <p>{currentAffiliation.organization.name}</p>
              <span className="state-pill confirmed">Current</span>
            </section>
          )}
          <section className="card">
            <div className="card-pad">
              <p className="eyebrow">Relationship history</p>
              <h2>Jobs together</h2>
            </div>
            {history.map(({ job, role }) => (
              <Link
                href={`/jobs/${job.id}`}
                key={job.id}
                className="action-card"
                style={{ gridTemplateColumns: "1fr auto" }}
              >
                <div>
                  <h3>{job.title}</h3>
                  <p>
                    {role} · {job.lifecycleStatus.replace("_", " ")}
                  </p>
                </div>
                <span>→</span>
              </Link>
            ))}
            {!history.length && (
              <div className="empty">No jobs together yet.</div>
            )}
          </section>
        </main>
        <aside>
          <section className="card card-pad section">
            <p className="eyebrow">Organizations</p>
            <h2>Affiliations</h2>
            {links.map(({ affiliation, organization }) => (
              <div className="activity" key={affiliation.id}>
                <div>
                  <strong>{organization.name}</strong>
                  <div className="muted">
                    {affiliation.title ?? "Role not set"}
                    {affiliation.endedOn
                      ? ` · until ${affiliation.endedOn}`
                      : " · current"}
                  </div>
                </div>
              </div>
            ))}
            <details style={{ marginTop: 15 }}>
              <summary style={{ fontWeight: 700, cursor: "pointer" }}>
                Add affiliation
              </summary>
              <form action={addAffiliation} style={{ marginTop: 14 }}>
                <input type="hidden" name="personId" value={id} />
                <div className="field">
                  <label>Organization</label>
                  <select name="organizationId" required>
                    {orgs.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Title</label>
                  <input name="title" />
                </div>
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Started</label>
                  <input type="date" name="startedOn" />
                </div>
                <button className="button secondary" style={{ marginTop: 12 }}>
                  Save affiliation
                </button>
              </form>
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}
