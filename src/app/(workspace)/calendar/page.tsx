import Link from "next/link";
import { and, eq } from "drizzle-orm";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { db } from "@/db/client";
import { actions, holds, jobs } from "@/db/schema";
import { requireContext } from "@/lib/auth";
import { transitionHold } from "@/lib/server-actions";

export const metadata = { title: "Calendar" };
const timeLabel = (date: Date) =>
  date.getHours() === 0 && date.getMinutes() === 0
    ? "All day"
    : format(date, "h:mm a");
const conflictIncludesHold = (
  action: typeof actions.$inferSelect,
  holdId: string,
) => {
  const payload = action.payload as { holdIds?: string[] };
  return payload.holdIds?.includes(holdId) ?? false;
};
const isPreferredHold = (
  action: typeof actions.$inferSelect | undefined,
  holdId: string,
) =>
  Boolean(
    action &&
    (action.payload as { preferenceHoldId?: string }).preferenceHoldId ===
      holdId,
  );
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const query = await searchParams;
  const ctx = await requireContext();
  const parsed = query.month ? parseISO(`${query.month}-01`) : new Date();
  const anchor = isValid(parsed) ? parsed : new Date();
  const view = query.view === "agenda" ? "agenda" : "month";
  const [rows, conflictActions] = await Promise.all([
    db
      .select({ hold: holds, job: jobs })
      .from(holds)
      .innerJoin(jobs, eq(holds.jobId, jobs.id))
      .where(
        and(eq(holds.workspaceId, ctx.workspaceId), eq(holds.status, "active")),
      ),
    db
      .select()
      .from(actions)
      .where(
        and(
          eq(actions.workspaceId, ctx.workspaceId),
          eq(actions.kind, "hold_conflict"),
        ),
      ),
  ]);
  const monthRows = rows.filter(
    (row) =>
      row.hold.startsAt <= endOfMonth(anchor) &&
      row.hold.endsAt >= startOfMonth(anchor),
  );
  const start = startOfWeek(startOfMonth(anchor));
  const end = endOfWeek(endOfMonth(anchor));
  const days = eachDayOfInterval({ start, end });
  const conflicting = new Set<string>();
  for (const a of rows)
    for (const b of rows)
      if (
        a.hold.id !== b.hold.id &&
        a.hold.jobId !== b.hold.jobId &&
        a.hold.startsAt < b.hold.endsAt &&
        a.hold.endsAt > b.hold.startsAt
      ) {
        conflicting.add(a.hold.id);
        conflicting.add(b.hold.id);
      }
  const monthKey = (date: Date) => format(date, "yyyy-MM");
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Schedule & holds</p>
          <h1>{format(anchor, "MMMM yyyy")}</h1>
          <p className="muted">
            Rank, certainty, and conflicts are visible without implying
            date-only bookings have call times.
          </p>
        </div>
        <div className="calendar-controls">
          <Link
            className="button secondary small"
            href={`/calendar?month=${monthKey(addMonths(anchor, -1))}&view=${view}`}
          >
            ←
          </Link>
          <Link
            className="button secondary small"
            href={`/calendar?month=${monthKey(new Date())}&view=${view}`}
          >
            Today
          </Link>
          <Link
            className="button secondary small"
            href={`/calendar?month=${monthKey(addMonths(anchor, 1))}&view=${view}`}
          >
            →
          </Link>
        </div>
      </div>
      <nav className="tabs">
        <Link
          className={view === "month" ? "active" : ""}
          href={`/calendar?month=${monthKey(anchor)}&view=month`}
        >
          Month
        </Link>
        <Link
          className={view === "agenda" ? "active" : ""}
          href={`/calendar?month=${monthKey(anchor)}&view=agenda`}
        >
          Agenda
        </Link>
      </nav>
      {conflicting.size > 0 && (
        <div className="form-message error">
          <strong>Scheduling conflict:</strong> overlapping holds have dedicated
          decision workspaces. Repd will not release either hold automatically.
        </div>
      )}
      {view === "month" && (
        <div className="calendar-grid">
          {days.map((day) => {
            const events = monthRows.filter((row) =>
              isSameDay(row.hold.startsAt, day),
            );
            return (
              <div className="calendar-day" key={day.toISOString()}>
                <span className="day-number">{format(day, "EEE d")}</span>
                {events.map(({ hold, job }) => {
                  const action = conflictActions.find(
                    (item) =>
                      item.status !== "resolved" &&
                      (conflictIncludesHold(item, hold.id) ||
                        item.jobId === job.id),
                  );
                  return (
                    <Link
                      href={
                        action ? `/actions/${action.id}` : `/jobs/${job.id}`
                      }
                      key={hold.id}
                      className={`event ${conflicting.has(hold.id) ? "conflict" : hold.kind === "second" ? "second" : hold.kind === "confirmed" ? "confirmed" : ""}`}
                    >
                      <span>
                        {timeLabel(hold.startsAt)} · {job.title}
                      </span>
                      <br />
                      <small>
                        {hold.kind === "confirmed"
                          ? "confirmed work"
                          : `${hold.kind} hold`}
                        {isPreferredHold(action, hold.id)
                          ? " · priority preference"
                          : conflicting.has(hold.id)
                            ? " · decision needed"
                            : ""}
                      </small>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <section
        className={`card section ${view === "month" ? "calendar-agenda" : ""}`}
      >
        <div className="card-pad">
          <p className="eyebrow">Agenda</p>
          <h2>Active holds this month</h2>
        </div>
        {monthRows
          .sort((a, b) => a.hold.startsAt.getTime() - b.hold.startsAt.getTime())
          .map(({ hold, job }) => {
            const conflictAction = conflictActions.find(
              (item) =>
                item.status !== "resolved" &&
                (conflictIncludesHold(item, hold.id) || item.jobId === job.id),
            );
            return (
              <div className="action-card" key={hold.id}>
                <div
                  className={`priority-dot ${conflicting.has(hold.id) ? "urgent" : "optional"}`}
                />
                <div>
                  <Link
                    href={
                      conflictAction
                        ? `/actions/${conflictAction.id}`
                        : `/jobs/${job.id}`
                    }
                  >
                    <h3>{job.title}</h3>
                  </Link>
                  <p>
                    {format(hold.startsAt, "EEE, MMM d")} ·{" "}
                    {timeLabel(hold.startsAt)}
                    {timeLabel(hold.startsAt) !== "All day"
                      ? `–${timeLabel(hold.endsAt)}`
                      : ""}{" "}
                    · {hold.kind}{" "}
                    {hold.kind === "confirmed" ? "booking" : "hold"}
                  </p>
                  {conflicting.has(hold.id) && (
                    <>
                      {isPreferredHold(conflictAction, hold.id) && (
                        <span className="preference-note">
                          Priority preference
                        </span>
                      )}
                      <Link
                        className="button secondary small"
                        href={
                          conflictAction
                            ? `/actions/${conflictAction.id}`
                            : `/jobs/${job.id}`
                        }
                      >
                        Review conflict
                      </Link>
                    </>
                  )}
                </div>
                <form action={transitionHold}>
                  <input type="hidden" name="holdId" value={hold.id} />
                  {hold.kind !== "confirmed" && !conflictAction && (
                    <button
                      className="button small"
                      name="transition"
                      value="confirm"
                    >
                      Confirm
                    </button>
                  )}
                  <button
                    className="button ghost danger small"
                    name="transition"
                    value="release"
                  >
                    Release
                  </button>
                </form>
              </div>
            );
          })}
        {!monthRows.length && (
          <div className="empty">
            <h3>Your calendar is clear</h3>
            <p>No active holds intersect this month.</p>
          </div>
        )}
      </section>
    </div>
  );
}
