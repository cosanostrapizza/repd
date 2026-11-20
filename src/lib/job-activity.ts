import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actionEvents,
  actions,
  activities,
  agentRunEvents,
  sources,
} from "@/db/schema";

export type JobActivityItem = {
  id: string;
  occurredAt: Date;
  category: "human" | "incoming" | "agent" | "system";
  kind:
    | "business_change"
    | "source_received"
    | "action_transition"
    | "artifact_prepared"
    | "approval"
    | "handoff"
    | "delivery_confirmation"
    | "agent_operation"
    | "failure";
  summary: string;
  detail?: string | null;
  status?: "completed" | "pending" | "failed";
  actorLabel: string;
  href?: string;
  provenance: Array<{ type: string; id: string }>;
};

type ActivityInput = {
  id: string;
  actorUserId: string | null;
  type: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

type SourceInput = {
  id: string;
  type: string;
  direction: "incoming" | "outgoing" | "internal";
  subject: string | null;
  sender: string | null;
  capturedAt: Date;
};

type ActionEventInput = {
  event: {
    id: string;
    actionId: string;
    type: string;
    reason: string | null;
    createdAt: Date;
  };
  action: { title: string; kind: string };
};

type AgentEventInput = {
  id: string;
  actionId: string | null;
  type: string;
  status: "started" | "completed" | "failed";
  label: string;
  detail: string | null;
  createdAt: Date;
};

function actionEventPresentation(
  type: string,
): Pick<JobActivityItem, "kind" | "actorLabel" | "status"> {
  if (type.includes("approved"))
    return { kind: "approval", actorLabel: "You", status: "completed" };
  if (type === "handoff")
    return { kind: "handoff", actorLabel: "You", status: "completed" };
  if (type === "execution_confirmed")
    return {
      kind: "delivery_confirmation",
      actorLabel: "You",
      status: "completed",
    };
  if (type.includes("prepared"))
    return {
      kind: "artifact_prepared",
      actorLabel: "Repd",
      status: "completed",
    };
  if (type.includes("failed"))
    return { kind: "failure", actorLabel: "Repd", status: "failed" };
  return {
    kind: "action_transition",
    actorLabel: "System",
    status: "completed",
  };
}

export function projectJobActivity(input: {
  activities: ActivityInput[];
  sources: SourceInput[];
  actionEvents: ActionEventInput[];
  agentEvents: AgentEventInput[];
}): JobActivityItem[] {
  const representedSourceIds = new Set(
    input.activities.flatMap((activity) => {
      const sourceId = activity.metadata?.sourceId;
      return typeof sourceId === "string" ? [sourceId] : [];
    }),
  );
  const actionEventTimes = new Map<string, number[]>();
  for (const { event } of input.actionEvents) {
    const times = actionEventTimes.get(event.actionId) ?? [];
    times.push(event.createdAt.getTime());
    actionEventTimes.set(event.actionId, times);
  }

  const activityItems: JobActivityItem[] = input.activities.map((activity) => {
    const sourceId = activity.metadata?.sourceId;
    return {
      id: `activity:${activity.id}`,
      occurredAt: activity.createdAt,
      category: activity.actorUserId ? "human" : "system",
      kind: "business_change",
      summary: activity.summary,
      actorLabel: activity.actorUserId ? "You" : "System",
      status: "completed",
      provenance: [
        { type: "activity", id: activity.id },
        ...(typeof sourceId === "string"
          ? [{ type: "source", id: sourceId }]
          : []),
      ],
    };
  });

  const sourceItems: JobActivityItem[] = input.sources
    .filter(
      (source) =>
        source.direction === "incoming" && !representedSourceIds.has(source.id),
    )
    .map((source) => ({
      id: `source:${source.id}`,
      occurredAt: source.capturedAt,
      category: "incoming",
      kind: "source_received",
      summary: source.subject ?? `Received ${source.type.replaceAll("_", " ")}`,
      detail: source.sender ? `From ${source.sender}` : null,
      actorLabel: source.sender ?? "External source",
      status: "completed",
      provenance: [{ type: "source", id: source.id }],
    }));

  const actionItems: JobActivityItem[] = input.actionEvents.map(
    ({ event, action }) => ({
      id: `action-event:${event.id}`,
      occurredAt: event.createdAt,
      category:
        actionEventPresentation(event.type).actorLabel === "Repd"
          ? "agent"
          : actionEventPresentation(event.type).actorLabel === "You"
            ? "human"
            : "system",
      summary:
        event.type === "decision_recorded"
          ? "Treatment decision recorded"
          : action.title,
      detail:
        event.reason?.replaceAll("_", " ") ?? event.type.replaceAll("_", " "),
      href: `/actions/${event.actionId}`,
      provenance: [
        { type: "action_event", id: event.id },
        { type: "action", id: event.actionId },
      ],
      ...actionEventPresentation(event.type),
    }),
  );

  const agentItems: JobActivityItem[] = input.agentEvents
    .filter((event) => {
      if (!event.actionId) return true;
      return !(actionEventTimes.get(event.actionId) ?? []).some(
        (time) => Math.abs(time - event.createdAt.getTime()) < 5 * 60 * 1000,
      );
    })
    .map((event) => ({
      id: `agent-event:${event.id}`,
      occurredAt: event.createdAt,
      category: "agent",
      kind: event.type === "failure" ? "failure" : "agent_operation",
      summary: event.label,
      detail: event.detail,
      status: event.status === "started" ? "pending" : event.status,
      actorLabel: "Repd",
      href: event.actionId ? `/actions/${event.actionId}` : undefined,
      provenance: [
        { type: "agent_run_event", id: event.id },
        ...(event.actionId ? [{ type: "action", id: event.actionId }] : []),
      ],
    }));

  return [...activityItems, ...sourceItems, ...actionItems, ...agentItems].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
}

export async function getJobActivityTimeline(
  workspaceId: string,
  jobId: string,
  limit = 40,
) {
  const [activityRows, sourceRows, actionEventRows, agentEventRows] =
    await Promise.all([
      db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.workspaceId, workspaceId),
            eq(activities.jobId, jobId),
          ),
        )
        .orderBy(desc(activities.createdAt))
        .limit(limit),
      db
        .select()
        .from(sources)
        .where(
          and(eq(sources.workspaceId, workspaceId), eq(sources.jobId, jobId)),
        )
        .orderBy(desc(sources.capturedAt))
        .limit(limit),
      db
        .select({ event: actionEvents, action: actions })
        .from(actionEvents)
        .innerJoin(actions, eq(actionEvents.actionId, actions.id))
        .where(
          and(
            eq(actionEvents.workspaceId, workspaceId),
            eq(actions.jobId, jobId),
          ),
        )
        .orderBy(desc(actionEvents.createdAt))
        .limit(limit),
      db
        .select()
        .from(agentRunEvents)
        .where(
          and(
            eq(agentRunEvents.workspaceId, workspaceId),
            eq(agentRunEvents.jobId, jobId),
          ),
        )
        .orderBy(desc(agentRunEvents.createdAt))
        .limit(limit),
    ]);

  return projectJobActivity({
    activities: activityRows,
    sources: sourceRows,
    actionEvents: actionEventRows,
    agentEvents: agentEventRows,
  }).slice(0, limit);
}
