import { eq } from "drizzle-orm";
import { JobForm } from "@/components/forms";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireContext } from "@/lib/auth";
export const metadata = { title: "New job" };
export default async function NewJobPage() {
  const ctx = await requireContext();
  const orgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.workspaceId, ctx.workspaceId));
  return (
    <div className="content" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>New opportunity</h1>
          <p className="muted">
            Start with what you know. Missing information will stay visible.
          </p>
        </div>
      </div>
      <div className="card card-pad">
        <JobForm organizations={orgs} />
      </div>
    </div>
  );
}
