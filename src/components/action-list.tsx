import Link from "next/link";
import type { Action } from "@/db/schema";
import { transitionAction } from "@/lib/server-actions";
import { priorityLabels } from "@/lib/domain";

const actionLabels: Record<string, string> = {
  producer_coordination: "Review email",
  missing_information: "Review request",
  hold_conflict: "Decide holds",
  invoice: "Prepare invoice",
  job_review: "Review changes",
};

export function ActionList({
  rows,
  showResolved = false,
}: {
  rows: (Action & { jobTitle?: string | null })[];
  showResolved?: boolean;
}) {
  if (!rows.length)
    return (
      <div className="empty">
        <div className="empty-icon">✓</div>
        <h3>You’re all caught up</h3>
        <p>No actions need your attention right now.</p>
      </div>
    );
  return (
    <div>
      {rows.map((a) => (
        <article className="action-card" key={a.id}>
          <span
            className={`priority-dot ${a.priority}`}
            aria-label={`${a.priority} priority`}
          />
          <div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <h3>{a.title}</h3>
              <span className={`badge ${a.priority}`}>
                {priorityLabels[a.priority]}
              </span>
              {a.status !== "open" && (
                <span className="badge">{a.status.replace("_", " ")}</span>
              )}
            </div>
            {a.jobTitle && (
              <Link
                href={`/jobs/${a.jobId}`}
                className="eyebrow"
                style={{ display: "block", marginTop: 8 }}
              >
                {a.jobTitle} →
              </Link>
            )}
            <p>{a.explanation}</p>
            <strong style={{ fontSize: 13 }}>{a.recommendation}</strong>
            {a.preparedContent && (
              <div className="prepared-preview">
                {a.preparedContent.length > 180
                  ? `${a.preparedContent.slice(0, 180)}…`
                  : a.preparedContent}
              </div>
            )}
            {showResolved && a.resolutionReason && (
              <p style={{ fontSize: 12 }}>
                Resolved: {a.resolutionReason.replaceAll("_", " ")}
              </p>
            )}
          </div>
          {a.status !== "resolved" && (
            <div className="action-controls">
              <Link className="button small" href={`/actions/${a.id}`}>
                {actionLabels[a.kind] ?? "Open workspace"}
              </Link>
              <form action={transitionAction}>
                <input type="hidden" name="actionId" value={a.id} />
                <button
                  className="button ghost small"
                  name="transition"
                  value="defer"
                >
                  Tomorrow
                </button>
                <button
                  className="button ghost danger small"
                  name="transition"
                  value="dismiss"
                >
                  Dismiss
                </button>
              </form>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
