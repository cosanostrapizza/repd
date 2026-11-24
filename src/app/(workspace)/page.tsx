import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Plus,
} from "lucide-react";
import { RetryPreparationForm } from "@/components/agent/retry-preparation-form";
import { requireContext } from "@/lib/auth";
import {
  getWorkspaceTodayState,
  type WorkspaceWorkItem,
} from "@/lib/workspace-state";

function actionLabel(item: WorkspaceWorkItem) {
  if (item.action?.executionStatus === "failed") return "Retry preparation";
  if (item.action?.status === "pending_approval")
    return item.kind === "invoice" ? "Review invoice" : "Review reply";
  if (item.kind === "hold_conflict") return "Review conflict";
  if (item.kind === "treatment_commitment") return "Decide treatment";
  if (item.kind === "producer_coordination") return "Review reply";
  return "Review next step";
}

function attentionGroup(item: WorkspaceWorkItem) {
  if (item.rank <= 10) return "Ready for review";
  if (item.rank <= 25) return "Decision required";
  return "Needs attention";
}

function priorityLabel(item: WorkspaceWorkItem) {
  if (item.state === "preparation_failed") return "Preparation failed";
  if (item.rank <= 10) return "Review ready";
  if (item.priority === "urgent") return "Urgent";
  if (item.priority === "blocking") return "Blocking";
  return "Action needed";
}

function compactContext(
  item: WorkspaceWorkItem,
  jobState:
    | Awaited<ReturnType<typeof getWorkspaceTodayState>>["jobs"][number]
    | undefined,
) {
  const job = jobState?.job;
  const payload = item.action?.payload as
    { dueDate?: string; jobIds?: string[] } | undefined;
  const parts: string[] = [];
  if (item.kind === "hold_conflict") {
    parts.push(item.detail);
  } else if (item.kind === "invoice") {
    if (job?.feeCents)
      parts.push(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: job.currency,
          maximumFractionDigits: 0,
        }).format(job.feeCents / 100),
      );
    if (job?.paymentTerms) parts.push(job.paymentTerms);
  } else {
    if (payload?.dueDate)
      parts.push(
        new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${payload.dueDate}T00:00:00Z`)),
      );
    else if (job?.shootDate)
      parts.push(
        new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${job.shootDate}T00:00:00Z`)),
      );
    else if (job?.shootStart)
      parts.push(
        job.shootStart.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      );
  }
  return parts.join(" · ") || item.detail;
}

export default async function TodayPage() {
  const ctx = await requireContext();
  const today = await getWorkspaceTodayState(ctx.workspaceId);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const lead = today.attention.length
    ? `${today.attention.length === 1 ? "One item needs" : `${today.attention.length} items need`} your judgment.`
    : today.jobs.length
      ? "Nothing needs your attention right now."
      : "Add an inquiry and Repd will build the first business brief.";
  const groupedAttention = today.attention.reduce<
    Array<{ label: string; items: typeof today.attention }>
  >((groups, item) => {
    const label = attentionGroup(item);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
  const jobsById = new Map(today.jobs.map((state) => [state.job.id, state]));

  return (
    <div className="content today-page">
      <header className="today-header">
        <div>
          <p className="today-date">{dateLabel}</p>
          <h1>Today</h1>
          <p className="today-lead">{lead}</p>
        </div>
        <Link href="/inquiries/new" className="button secondary">
          <Plus size={15} /> Add inquiry
        </Link>
      </header>

      <main className="today-stack">
        <section
          className="attention-section"
          aria-labelledby="attention-title"
        >
          <div className="today-section-head">
            <div>
              <div className="today-section-kicker">
                <span className="attention-marker" aria-hidden="true" />
                <span>Needs you</span>
                {today.attention.length > 0 && (
                  <span className="count-badge">{today.attention.length}</span>
                )}
              </div>
              <h2 id="attention-title">Decisions and reviews</h2>
            </div>
            <Link href="/actions" className="quiet-link">
              Action history <ArrowRight size={13} />
            </Link>
          </div>

          {groupedAttention.length ? (
            <div className="attention-list">
              {groupedAttention.map((group) => (
                <div className="attention-group" key={group.label}>
                  <div className="attention-group-label">{group.label}</div>
                  {group.items.map((item) => (
                    <article
                      className="attention-item"
                      key={`${item.source}:${item.id}`}
                    >
                      <div className={`attention-status ${item.state}`}>
                        {item.state === "preparation_failed" ? (
                          <AlertTriangle size={15} />
                        ) : (
                          <CircleDot size={15} />
                        )}
                      </div>
                      <div className="attention-copy">
                        <div className="attention-meta">
                          <span>{item.jobTitle}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`attention-priority ${item.priority}`}
                          >
                            {priorityLabel(item)}
                          </span>
                        </div>
                        <h3>
                          <Link href={item.href}>{item.title}</Link>
                        </h3>
                        <p className="attention-context">
                          {compactContext(item, jobsById.get(item.jobId))}
                        </p>
                      </div>
                      <div className="attention-action">
                        {item.action?.executionStatus === "failed" ? (
                          <RetryPreparationForm
                            actionId={item.action.id}
                            compact
                          />
                        ) : (
                          <Link
                            className="button secondary small"
                            href={item.href}
                          >
                            {actionLabel(item)} <ChevronRight size={13} />
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="attention-clear">
              <CheckCircle2 size={20} />
              <div>
                <strong>
                  {today.jobs.length
                    ? "You’re caught up."
                    : "No active work yet."}
                </strong>
                <p>
                  {today.jobs.length
                    ? "There are no decisions, approvals, or interventions waiting on you."
                    : "When you add an inquiry, work that needs judgment will stay here until it is resolved."}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="handled-section" aria-labelledby="handled-title">
          <div className="today-section-head">
            <div>
              <div className="today-section-kicker quiet">
                <Check size={14} aria-hidden="true" />
                <span>Handled by Repd</span>
              </div>
              <h2 id="handled-title">Meaningful work already completed</h2>
            </div>
            <span className="handled-window">Past 7 days</span>
          </div>
          {today.handled.length ? (
            <div className="handled-list">
              {today.handled.map((item) => (
                <Link
                  href={item.href}
                  className="handled-row"
                  key={`${item.source}:${item.id}`}
                >
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <div>
                    <div className="handled-meta">
                      <span>{item.jobTitle}</span>
                      <time dateTime={item.createdAt.toISOString()}>
                        {item.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="handled-empty">
              No meaningful completed work to report in the past seven days.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
