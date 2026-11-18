import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/db/client";
import { jobs, organizations } from "@/db/schema";
import { requireContext } from "@/lib/auth";
import {
  bookingLabels,
  formatMoney,
  lifecycleLabels,
  nextNeed,
} from "@/lib/domain";

export const metadata = { title: "Jobs" };
export default async function JobsPage() {
  const ctx = await requireContext();
  const rows = await db
    .select({ job: jobs, client: organizations.name })
    .from(jobs)
    .leftJoin(organizations, eq(jobs.clientOrganizationId, organizations.id))
    .where(eq(jobs.workspaceId, ctx.workspaceId))
    .orderBy(desc(jobs.updatedAt));
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Your work</p>
          <h1>Jobs</h1>
          <p className="muted">
            One evolving brief for every inquiry, hold, booking, and completed
            job.
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
      <div className="card list">
        <div
          className="list-row"
          style={{
            background: "#f8f9f4",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
          }}
        >
          <div>Job</div>
          <div>Status</div>
          <div>Fee</div>
          <div>Next need</div>
        </div>
        {rows.map(({ job, client }) => (
          <Link className="list-row" href={`/jobs/${job.id}`} key={job.id}>
            <div>
              <strong>{job.title}</strong>
              <span className="list-label" style={{ marginTop: 5 }}>
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
              <span className="list-label" style={{ marginTop: 5 }}>
                {lifecycleLabels[job.lifecycleStatus]}
              </span>
            </div>
            <div>{formatMoney(job.feeCents, job.currency)}</div>
            <div className="muted">{nextNeed(job)}</div>
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
