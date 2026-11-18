import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ContactForm } from "@/components/forms";
import { db } from "@/db/client";
import { organizations, people } from "@/db/schema";
import { requireContext } from "@/lib/auth";
export const metadata = { title: "People & organizations" };
export default async function PeoplePage() {
  const ctx = await requireContext();
  const [persons, orgs] = await Promise.all([
    db
      .select()
      .from(people)
      .where(
        and(eq(people.workspaceId, ctx.workspaceId), isNull(people.archivedAt)),
      )
      .orderBy(asc(people.name)),
    db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.workspaceId, ctx.workspaceId),
          isNull(organizations.archivedAt),
        ),
      )
      .orderBy(asc(organizations.name)),
  ]);
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Relationships</p>
          <h1>People & organizations</h1>
          <p className="muted">
            Reusable contacts with a shared history across every job.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <main>
          <section className="card section">
            <div className="card-pad">
              <p className="eyebrow">Directory</p>
              <h2>People</h2>
            </div>
            {persons.map((p) => (
              <Link
                href={`/people/${p.id}`}
                className="action-card"
                style={{ gridTemplateColumns: "auto 1fr" }}
                key={p.id}
              >
                <div className="avatar">{p.name[0]}</div>
                <div>
                  <h3>{p.name}</h3>
                  <p style={{ margin: "4px 0" }}>{p.email ?? "No email"}</p>
                </div>
              </Link>
            ))}
            {!persons.length && (
              <div className="empty">
                No people yet. Add one here or from a job.
              </div>
            )}
          </section>
          <section className="card section">
            <div className="card-pad">
              <p className="eyebrow">Clients & partners</p>
              <h2>Organizations</h2>
            </div>
            {orgs.map((o) => (
              <Link
                href={`/organizations/${o.id}`}
                className="action-card"
                style={{ gridTemplateColumns: "auto 1fr" }}
                key={o.id}
              >
                <div
                  className="avatar"
                  style={{ borderRadius: 10, background: "#dce7ed" }}
                >
                  {o.name[0]}
                </div>
                <div>
                  <h3>{o.name}</h3>
                  <p style={{ margin: "4px 0" }}>
                    {o.kind.replaceAll("_", " ")}
                  </p>
                </div>
              </Link>
            ))}
          </section>
        </main>
        <aside>
          <section
            className="card card-pad"
            style={{ position: "sticky", top: 90 }}
          >
            <p className="eyebrow">New relationship</p>
            <h2 style={{ marginBottom: 18 }}>Add a record</h2>
            <ContactForm />
          </section>
        </aside>
      </div>
    </div>
  );
}
