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
    metadata?: Record<string, unknown> | null;
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
  event: ActionEventInput["event"],
): Pick<JobActivityItem, "kind" | "actorLabel" | "status"> {
  const { type } = event;
  if (type.includes("approved") || type === "approve")
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
  if (
    [
      "decision_recorded",
      "decisions_recorded",
      "hold_preference_recorded",
      "preparation_retry_started",
      "deferred",
      "defer",
      "resolve",
      "dismiss",
    ].includes(type)
  )
    return {
      kind: "action_transition",
      actorLabel: "You",
      status: "completed",
    };
  if (type === "conditional_follow_up_created")
    return {
      kind: "action_transition",
      actorLabel: "Repd",
      status: "completed",
    };
  return {
    kind: "action_transition",
    actorLabel: "System",
    status: "completed",
  };
}

function actionEventDetail(event: ActionEventInput["event"]) {
  if (event.type.includes("prepared"))
    return "Prepared for review. No external delivery occurred.";
  if (event.type.includes("approved"))
    return "Approved internally; approval alone did not send or issue it.";
  if (event.type === "handoff")
    return "Copied or opened for handoff; delivery was not yet confirmed.";
  if (event.type === "execution_confirmed")
    return "External delivery was explicitly confirmed by the user.";
  if (event.type === "decision_recorded" || event.type === "decisions_recorded")
    return "Decision saved to the authoritative job record.";
  if (event.type.includes("failed"))
    return (
      event.reason ??
      "Preparation failed; the saved business state was unchanged."
    );
  return event.reason?.replaceAll("_", " ") ?? event.type.replaceAll("_", " ");
}

function correlationFamilyForActionEvent(type: string) {
  if (type.includes("prepared")) return "artifact";
  if (type.includes("failed")) return "failure";
  if (type.includes("decision") || type === "hold_preference_recorded")
    return "record_change";
  return null;
}

function correlationFamilyForAgentEvent(type: string) {
  if (type === "artifact_preparation" || type === "approval_required")
    return "artifact";
  if (type === "record_change") return "record_change";
  if (type === "failure") return "failure";
  return null;
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function projectJobActivity(input: {
  activities: ActivityInput[];
  sources: SourceInput[];
  actionEvents: ActionEventInput[];
  agentEvents: AgentEventInput[];
}): JobActivityItem[] {
  const dedupedActivities = uniqueById(input.activities);
  const dedupedSources = uniqueById(input.sources);
  const dedupedActionEvents = [
    ...new Map(
      input.actionEvents.map((item) => [item.event.id, item]),
    ).values(),
  ];
  const dedupedAgentEvents = uniqueById(input.agentEvents);

  const activityItems: JobActivityItem[] = dedupedActivities.map((activity) => {
    const sourceId = activity.metadata?.sourceId;
    return {
      id: `activity:${activity.id}`,
      occurredAt: activity.createdAt,
      category: activity.actorUserId ? "human" : "system",
      kind: "business_change",
      summary: activity.summary,
      actorLabel: activity.actorUserId ? "You" : "System",
      href: typeof sourceId === "string" ? `#source-${sourceId}` : undefined,
      status: "completed",
      provenance: [
        { type: "activity", id: activity.id },
        ...(typeof sourceId === "string"
          ? [{ type: "source", id: sourceId }]
          : []),
      ],
    };
  });

  const sourceItems: JobActivityItem[] = dedupedSources
    .filter((source) => source.direction === "incoming")
    .map((source) => ({
      id: `source:${source.id}`,
      occurredAt: source.capturedAt,
      category: "incoming",
      kind: "source_received",
      summary: source.subject ?? `Received ${source.type.replaceAll("_", " ")}`,
      detail: source.sender ? `From ${source.sender}` : null,
      actorLabel: source.sender ?? "External source",
      href: `#source-${source.id}`,
      status: "completed",
      provenance: [{ type: "source", id: source.id }],
    }));

  const actionItems: JobActivityItem[] = dedupedActionEvents.map(
    ({ event, action }) => {
      const presentation = actionEventPresentation(event);
      return {
        id: `action-event:${event.id}`,
        occurredAt: event.createdAt,
        category:
          presentation.actorLabel === "Repd"
            ? "agent"
            : presentation.actorLabel === "You"
              ? "human"
              : "system",
        summary:
          event.type === "decision_recorded"
            ? "Treatment decision recorded"
            : action.title,
        detail: actionEventDetail(event),
        href: `/actions/${event.actionId}`,
        provenance: [
          { type: "action_event", id: event.id },
          { type: "action", id: event.actionId },
        ],
        ...presentation,
      };
    },
  );

  const uncorrelatedAgentEvents: AgentEventInput[] = [];
  for (const event of dedupedAgentEvents) {
    const family = correlationFamilyForAgentEvent(event.type);
    const correlated =
      event.actionId && family
        ? dedupedActionEvents.find(
            ({ event: actionEvent }) =>
              actionEvent.actionId === event.actionId &&
              correlationFamilyForActionEvent(actionEvent.type) === family &&
              Math.abs(
                actionEvent.createdAt.getTime() - event.createdAt.getTime(),
              ) <
                5 * 60 * 1000,
          )
        : undefined;
    if (!correlated) {
      uncorrelatedAgentEvents.push(event);
      continue;
    }
    const item = actionItems.find(
      (candidate) => candidate.id === `action-event:${correlated.event.id}`,
    );
    if (item) item.provenance.push({ type: "agent_run_event", id: event.id });
  }

  const agentItems: JobActivityItem[] = uncorrelatedAgentEvents
    .filter(
      (event) =>
        !["search", "check", "completed"].includes(event.type) ||
        event.status === "failed",
    )
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
    (a, b) =>
      b.occurredAt.getTime() - a.occurredAt.getTime() ||
      a.id.localeCompare(b.id),
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
