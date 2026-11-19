import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Plus,
  Sparkles,
} from "lucide-react";
import { RetryPreparationForm } from "@/components/agent/retry-preparation-form";
import { reevaluateWorkspace } from "@/lib/action-engine";
import { requireContext } from "@/lib/auth";
import {
  getWorkspaceTodayState,
  type WorkspaceWorkItem,
} from "@/lib/workspace-state";

function actionLabel(item: WorkspaceWorkItem) {
  if (item.action?.executionStatus === "failed") return "Retry preparation";
  if (item.action?.status === "pending_approval")
    return item.kind === "invoice" ? "Review invoice" : "Review reply";
  if (item.kind === "treatment_commitment") return "Decide treatment";
  if (item.kind === "producer_coordination") return "Review reply";
  return "Review next step";
}

export default async function TodayPage() {
  const ctx = await requireContext();
  await reevaluateWorkspace(ctx.workspaceId);
  const today = await getWorkspaceTodayState(ctx.workspaceId);
  const first = ctx.user.name.split(" ")[0];
  const backgroundCount = today.repdHandling.length + today.waiting.length;
  const lead = today.attention.length
    ? `${today.attention.length === 1 ? "One thing needs" : `${today.attention.length} things need`} you today.${backgroundCount ? ` Repd is keeping track of ${backgroundCount} other ${backgroundCount === 1 ? "item" : "items"}.` : ""}`
    : today.jobs.length
      ? `Nothing needs your attention right now.${backgroundCount ? ` Repd is keeping track of ${backgroundCount} ${backgroundCount === 1 ? "item" : "items"} in the background.` : ""}`
      : "There is no active work yet. Add an inquiry and Repd will build the business brief.";

  return (
    <div className="content today-page">
      <section className="daily-briefing">
        <div>
          <p className="eyebrow">Today</p>
          <h1>
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {first}.
          </h1>
          <p>{lead}</p>
        </div>
        <Link href="/inquiries/new" className="button accent">
          <Plus size={17} /> Add inquiry
        </Link>
      </section>

      <main className="today-stack">
        <section className="attention-section" aria-labelledby="attention-title">
          <div className="compact-section-head">
            <div>
              <p className="eyebrow">Needs you</p>
              <h2 id="attention-title">Your decisions and reviews</h2>
            </div>
            <Link href="/actions" className="quiet-link">
              View history <ArrowRight size={14} />
            </Link>
          </div>
          {today.attention.length ? (
            <div className="attention-list">
              {today.attention.slice(0, 5).map((item) => (
                <article className="attention-item" key={`${item.source}:${item.id}`}>
                  <div className={`attention-icon ${item.state}`}>
                    {item.state === "preparation_failed" ? (
                      <AlertTriangle size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}
                  </div>
                  <div className="attention-copy">
                    <span>{item.jobTitle}</span>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  {item.action?.executionStatus === "failed" ? (
                    <RetryPreparationForm actionId={item.action.id} compact />
                  ) : (
                    <Link className="button secondary small" href={item.href}>
                      {actionLabel(item)}
                    </Link>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="attention-clear">
              <CheckCircle2 size={22} />
              <div>
                <strong>You’re caught up.</strong>
                <p>Repd will bring decisions and approvals here when they need you.</p>
              </div>
            </div>
          )}
        </section>

        {(today.repdHandling.length > 0 || today.waiting.length > 0) && (
          <section className="background-section" aria-labelledby="background-title">
            <div className="compact-section-head">
              <div>
                <p className="eyebrow">Background work</p>
                <h2 id="background-title">Repd is keeping things moving</h2>
              </div>
            </div>
            <div className="background-columns">
              {today.repdHandling.length > 0 && <div>
                <h3><Sparkles size={15} /> Repd is handling</h3>
                {today.repdHandling.map((item) => (
                  <Link href={item.href} className="background-row" key={item.id}>
                    <span>{item.jobTitle}</span><strong>{item.title}</strong>
                  </Link>
                ))}
              </div>}
              {today.waiting.length > 0 && <div>
                <h3><Clock3 size={15} /> Waiting on others</h3>
                {today.waiting.map((item) => (
                  <Link href={item.href} className="background-row" key={item.id}>
                    <span>{item.jobTitle}</span><strong>{item.title}</strong>
                  </Link>
                ))}
              </div>}
            </div>
          </section>
        )}

        <details className="recent-summary">
          <summary>
            <span><CheckCircle2 size={16} /> Recent changes</span>
            <small>{today.recent.length ? `${today.recent.length} updates` : "No updates"}</small>
          </summary>
          <div className="recent-list">
            {today.recent.map(({ activity, jobTitle }) => (
              <div className="recent-row" key={activity.id}>
                <span>{activity.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <div><strong>{activity.summary}</strong><small>{jobTitle}</small></div>
              </div>
            ))}
          </div>
        </details>

        {!today.jobs.length && (
          <div className="empty card">
            <BriefcaseBusiness />
            <h3>No active work yet</h3>
            <p>Paste a producer inquiry to let Repd build the brief.</p>
          </div>
        )}
      </main>
    </div>
  );
}
