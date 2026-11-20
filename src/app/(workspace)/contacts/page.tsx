import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ContactForm } from "@/components/forms";
import { db } from "@/db/client";
import { organizations, people } from "@/db/schema";
import { requireContext } from "@/lib/auth";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
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
          <p className="eyebrow">Directory</p>
          <h1>Contacts</h1>
          <p className="muted">
            People and companies remain distinct records, connected by their
            shared job history.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <main>
          <section className="card section">
            <div className="card-pad section-heading">
              <p className="eyebrow">People</p>
              <h2>People</h2>
            </div>
            {persons.map((person) => (
              <Link
                href={`/people/${person.id}`}
                className="directory-row"
                key={person.id}
              >
                <div className="avatar">{person.name[0]}</div>
                <div>
                  <h3>{person.name}</h3>
                  <p>{person.email ?? "No email"}</p>
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
            <div className="card-pad section-heading">
              <p className="eyebrow">Companies</p>
              <h2>Organizations</h2>
            </div>
            {orgs.map((organization) => (
              <Link
                href={`/organizations/${organization.id}`}
                className="directory-row"
                key={organization.id}
              >
                <div className="avatar organization-avatar">
                  {organization.name[0]}
                </div>
                <div>
                  <h3>{organization.name}</h3>
                  <p>{organization.kind.replaceAll("_", " ")}</p>
                </div>
              </Link>
            ))}
            {!orgs.length && <div className="empty">No organizations yet.</div>}
          </section>
        </main>
        <aside>
          <section className="card card-pad sticky-card">
            <p className="eyebrow">New contact</p>
            <h2 className="form-section-title">Add a record</h2>
            <ContactForm />
          </section>
        </aside>
      </div>
    </div>
  );
}
