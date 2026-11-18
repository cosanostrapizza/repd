import { desc, eq } from "drizzle-orm";
import { ActionList } from "@/components/action-list";
import { db } from "@/db/client";
import { actions, jobs } from "@/db/schema";
import { reevaluateWorkspace } from "@/lib/action-engine";
import { requireContext } from "@/lib/auth";
export const metadata = { title: "Action inbox" };
export default async function ActionsPage() {
  const ctx = await requireContext();
  await reevaluateWorkspace(ctx.workspaceId);
  const rows = await db
    .select({ action: actions, jobTitle: jobs.title })
    .from(actions)
    .leftJoin(jobs, eq(actions.jobId, jobs.id))
    .where(eq(actions.workspaceId, ctx.workspaceId))
    .orderBy(desc(actions.createdAt));
  const open = rows.filter((r) => r.action.status !== "resolved"),
    resolved = rows.filter((r) => r.action.status === "resolved");
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Durable recommendations</p>
          <h1>Action inbox</h1>
          <p className="muted">
            Prepared next steps stay here until their underlying need is
            resolved.
          </p>
        </div>
      </div>
      <section className="card section">
        <div className="card-pad">
          <p className="eyebrow">Open · {open.length}</p>
          <h2>Needs attention</h2>
        </div>
        <ActionList
          rows={open.map((r) => ({ ...r.action, jobTitle: r.jobTitle }))}
        />
      </section>
      {resolved.length > 0 && (
        <details className="card">
          <summary
            className="card-pad"
            style={{ cursor: "pointer", fontWeight: 700 }}
          >
            Resolved actions · {resolved.length}
          </summary>
          <ActionList
            showResolved
            rows={resolved.map((r) => ({ ...r.action, jobTitle: r.jobTitle }))}
          />
        </details>
      )}
    </div>
  );
}
