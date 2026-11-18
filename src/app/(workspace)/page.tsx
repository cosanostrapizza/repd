import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArrowRight, BriefcaseBusiness, Plus } from "lucide-react";
import { ActionList } from "@/components/action-list";
import { db } from "@/db/client";
import { actions, activities, jobs, questions } from "@/db/schema";
import { reevaluateWorkspace } from "@/lib/action-engine";
import { requireContext } from "@/lib/auth";
import { bookingLabels, nextNeed } from "@/lib/domain";

function groundedSentence(
  action: typeof actions.$inferSelect,
  jobTitle: string | null,
) {
  const subject = jobTitle ?? "A workspace item";
  if (action.kind === "producer_coordination")
    return `${subject} still needs information, and I’ve prepared a producer note for your review.`;
  if (action.kind === "hold_conflict")
    return `${subject} overlaps another active hold, so a scheduling decision is waiting.`;
  if (action.kind === "invoice")
    return `${subject} is complete, and its invoice is ready for preparation.`;
  return `${subject} needs attention: ${action.explanation}`;
}

export default async function HomePage() {
  const ctx = await requireContext();
  await reevaluateWorkspace(ctx.workspaceId);
  const [actionRows, activeJobs, recent, waiting] = await Promise.all([
    db
      .select({ action: actions, jobTitle: jobs.title })
      .from(actions)
      .leftJoin(jobs, eq(actions.jobId, jobs.id))
      .where(
        and(
          eq(actions.workspaceId, ctx.workspaceId),
          ne(actions.status, "resolved"),
        ),
      )
      .orderBy(actions.priority, actions.createdAt)
      .limit(6),
    db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, ctx.workspaceId),
          ne(jobs.lifecycleStatus, "cancelled"),
        ),
      )
      .orderBy(desc(jobs.updatedAt)),
    db
      .select({ activity: activities, jobTitle: jobs.title })
      .from(activities)
      .leftJoin(jobs, eq(activities.jobId, jobs.id))
      .where(eq(activities.workspaceId, ctx.workspaceId))
      .orderBy(desc(activities.createdAt))
      .limit(5),
    db
      .select({ question: questions, jobTitle: jobs.title })
      .from(questions)
      .innerJoin(jobs, eq(questions.jobId, jobs.id))
      .where(
        and(
          eq(questions.workspaceId, ctx.workspaceId),
          eq(questions.status, "asked"),
          eq(jobs.workspaceId, ctx.workspaceId),
        ),
      )
      .orderBy(desc(questions.askedAt))
      .limit(4),
  ]);
  const first = ctx.user.name.split(" ")[0];
  const lead = actionRows
    .slice(0, 2)
    .map(({ action, jobTitle }) => groundedSentence(action, jobTitle))
    .join(" ");
  return (
    <div className="content">
      <section className="daily-briefing">
        <div>
          <p className="eyebrow">Today’s briefing</p>
          <h1>
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {first}
            .
          </h1>
          <p>
            {lead ||
              (activeJobs.length
                ? "No prepared decision is waiting right now. I’m monitoring the active briefs and will surface a concrete next move when stored facts change."
                : "There is no active work yet. Add an inquiry and I’ll turn the source into a decision-ready brief.")}
          </p>
        </div>
        <Link href="/inquiries/new" className="button accent">
          <Plus size={17} /> Add inquiry
        </Link>
      </section>
      <div className="briefing-layout">
        <main>
          <section className="section">
            <div className="section-title">
              <div>
                <p className="eyebrow">Prepared for you</p>
                <h2>Decisions and work to review</h2>
              </div>
              <Link href="/actions" className="button ghost">
                Full inbox <ArrowRight size={16} />
              </Link>
            </div>
            <div className="card">
              <ActionList
                rows={actionRows.map((row) => ({
                  ...row.action,
                  jobTitle: row.jobTitle,
                }))}
              />
            </div>
          </section>
          <section className="section card card-pad">
            <div className="section-title">
              <div>
                <p className="eyebrow">What changed</p>
                <h2>Recent activity</h2>
              </div>
            </div>
            {recent.map(({ activity, jobTitle }) => (
              <div className="activity change-row" key={activity.id}>
                <span>
                  {activity.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <div>
                  <strong>{activity.summary}</strong>
                  {jobTitle && <p>{jobTitle}</p>}
                </div>
              </div>
            ))}
            {!recent.length && (
              <p className="muted">
                No material changes have been recorded yet.
              </p>
            )}
          </section>
        </main>
        <aside>
          {waiting.length > 0 && (
            <section className="section">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Waiting on</p>
                  <h2>Producer replies</h2>
                </div>
              </div>
              <div className="card">
                {waiting.map(({ question, jobTitle }) => (
                  <Link
                    href={`/jobs/${question.jobId}`}
                    className="radar-job"
                    key={question.id}
                  >
                    <div>
                      <h3>{jobTitle}</h3>
                      <p>{question.question}</p>
                    </div>
                    <span>Asked →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="section">
            <div className="section-title">
              <div>
                <p className="eyebrow">Active work</p>
                <h2>On Repd’s radar</h2>
              </div>
              <Link href="/jobs" className="button ghost">
                All jobs
              </Link>
            </div>
            <div className="card">
              {activeJobs.slice(0, 6).map((job) => (
                <Link
                  href={`/jobs/${job.id}`}
                  key={job.id}
                  className="radar-job"
                >
                  <div>
                    <h3>{job.title}</h3>
                    <p>{bookingLabels[job.bookingStatus]}</p>
                  </div>
                  <span>{nextNeed(job)} →</span>
                </Link>
              ))}
              {!activeJobs.length && (
                <div className="empty">
                  <BriefcaseBusiness />
                  <h3>No active work yet</h3>
                  <p>Paste a producer inquiry to let Repd build the brief.</p>
                  <Link className="button" href="/inquiries/new">
                    Add inquiry
                  </Link>
                </div>
              )}
            </div>
          </section>
          <section className="card card-pad manager-note">
            <p className="eyebrow">How Repd is working</p>
            <p>
              I prepare work from stored facts and sources. You approve
              consequential changes and outbound communication. Approval never
              implies delivery.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
