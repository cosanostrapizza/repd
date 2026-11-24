import Link from "next/link";
import { Plus } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { reevaluateWorkspace } from "@/lib/action-engine";
import { bookingLabels, formatMoney, lifecycleLabels } from "@/lib/domain";
import { getWorkspaceTodayState } from "@/lib/workspace-state";

export const metadata = { title: "Jobs" };
export default async function JobsPage() {
  const ctx = await requireContext();
  await reevaluateWorkspace(ctx.workspaceId);
  const { jobs: rows } = await getWorkspaceTodayState(ctx.workspaceId);
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p className="muted">
            {rows.length} active {rows.length === 1 ? "job" : "jobs"}
          </p>
        </div>
        <div className="job-head-actions">
          <Link href="/jobs/new" className="button secondary">
            Create manually
          </Link>
          <Link href="/inquiries/new" className="button">
            <Plus size={17} />
            Add inquiry
          </Link>
        </div>
      </div>
      <div className="card list jobs-list">
        <div className="list-row jobs-list-head">
          <div>Job</div>
          <div>Status</div>
          <div>Fee</div>
          <div>Next need</div>
        </div>
        {rows.map(({ job, clientName: client, attention }) => (
          <Link className="list-row" href={`/jobs/${job.id}`} key={job.id}>
            <div>
              <strong>{job.title}</strong>
              <span className="list-label">
                {client ?? "Client not set"}
                {job.shootStart
                  ? ` · ${job.shootStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : ""}
              </span>
            </div>
            <div>
              <span
                className={`badge ${job.bookingStatus === "confirmed" ? "confirmed" : ""}`}
              >
                {bookingLabels[job.bookingStatus]}
              </span>
              <span className="list-label">
                {lifecycleLabels[job.lifecycleStatus]}
              </span>
            </div>
            <div>{formatMoney(job.feeCents, job.currency)}</div>
            <div className="muted">{attention.label}</div>
          </Link>
        ))}
        {!rows.length && (
          <div className="empty">
            <h3>No jobs yet</h3>
            <p>Paste an inquiry and let Repd prepare the first brief.</p>
            <Link className="button" href="/inquiries/new">
              Add your first inquiry
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
