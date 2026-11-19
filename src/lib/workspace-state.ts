import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions,
  activities,
  communications,
  coordinationDateOptions,
  coordinationDependencies,
  coordinationObjectives,
  holds,
  invoiceDrafts,
  jobs,
  organizations,
  questions,
  sources,
  type Action,
} from "@/db/schema";
import { bookingLabels, formatMoney, lifecycleLabels } from "@/lib/domain";
import {
  actionAttentionRank,
  actionAttentionLabel,
  actionDependencyIsResolved,
  isActionActive,
  isQuestionActive,
  isResolvedTreatmentDecisionAction,
  reconcileDateOptionHoldState,
} from "@/lib/workspace-state-rules";
export { actionAttentionRank, isActionActive } from "@/lib/workspace-state-rules";

export type WorkspaceWorkItem = {
  id: string;
  source: "action" | "dependency";
  jobId: string;
  objectiveId: string | null;
  kind: string;
  title: string;
  detail: string;
  state: string;
  responsibility: "you" | "repd" | "external";
  priority: Action["priority"] | "waiting";
  rank: number;
  href: string;
  action?: Action;
};

function actionHref(action: Action) {
  if (
    action.jobId &&
    [
      "producer_coordination",
      "missing_information",
      "advance_inquiry",
      "treatment_commitment",
    ].includes(action.kind)
  )
    return `/jobs/${action.jobId}#active-work`;
  return `/actions/${action.id}`;
}

function actionResponsibility(action: Action): WorkspaceWorkItem["responsibility"] {
  if (action.executionStatus === "failed") return "you";
  if (action.status === "executing") return "repd";
  return "you";
}

export async function getJobWorkspaceState(
  workspaceId: string,
  jobId: string,
  now = new Date(),
) {
  const [jobRow] = await db
    .select({ job: jobs, clientName: organizations.name })
    .from(jobs)
    .leftJoin(organizations, eq(jobs.clientOrganizationId, organizations.id))
    .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, jobId)))
    .limit(1);
  if (!jobRow) return null;

  const [directJobActions, sharedConflictActions, objectives, messages, drafts, activeQuestions, recent, documents, jobHolds] =
    await Promise.all([
      db
        .select()
        .from(actions)
        .where(and(eq(actions.workspaceId, workspaceId), eq(actions.jobId, jobId)))
        .orderBy(desc(actions.updatedAt)),
      db
        .select()
        .from(actions)
        .where(
          and(
            eq(actions.workspaceId, workspaceId),
            eq(actions.kind, "hold_conflict"),
          ),
        )
        .orderBy(desc(actions.updatedAt)),
      db
        .select()
        .from(coordinationObjectives)
        .where(
          and(
            eq(coordinationObjectives.workspaceId, workspaceId),
            eq(coordinationObjectives.jobId, jobId),
          ),
        )
        .orderBy(desc(coordinationObjectives.updatedAt)),
      db
        .select()
        .from(communications)
        .where(
          and(
            eq(communications.workspaceId, workspaceId),
            eq(communications.jobId, jobId),
          ),
        )
        .orderBy(desc(communications.updatedAt)),
      db
        .select()
        .from(invoiceDrafts)
        .where(
          and(
            eq(invoiceDrafts.workspaceId, workspaceId),
            eq(invoiceDrafts.jobId, jobId),
          ),
        )
        .orderBy(desc(invoiceDrafts.updatedAt)),
      db
        .select()
        .from(questions)
        .where(
          and(eq(questions.workspaceId, workspaceId), eq(questions.jobId, jobId)),
        )
        .orderBy(desc(questions.updatedAt)),
      db
        .select()
        .from(activities)
        .where(
          and(eq(activities.workspaceId, workspaceId), eq(activities.jobId, jobId)),
        )
        .orderBy(desc(activities.createdAt))
        .limit(12),
      db
        .select()
        .from(sources)
        .where(and(eq(sources.workspaceId, workspaceId), eq(sources.jobId, jobId)))
        .orderBy(desc(sources.capturedAt)),
      db
        .select()
        .from(holds)
        .where(and(eq(holds.workspaceId, workspaceId), eq(holds.jobId, jobId)))
        .orderBy(desc(holds.createdAt)),
    ]);

  const directActionIds = new Set(directJobActions.map((action) => action.id));
  const jobActions = [
    ...directJobActions,
    ...sharedConflictActions.filter((action) => {
      if (directActionIds.has(action.id)) return false;
      const payload = action.payload as { jobIds?: string[] };
      return payload.jobIds?.includes(jobId) ?? false;
    }),
  ];

  const dependencyGroups = await Promise.all(
    objectives.map(async (objective) => {
      const [dependencies, dateOptions] = await Promise.all([
        db
          .select()
          .from(coordinationDependencies)
          .where(
            and(
              eq(coordinationDependencies.workspaceId, workspaceId),
              eq(coordinationDependencies.objectiveId, objective.id),
            ),
          )
          .orderBy(coordinationDependencies.createdAt),
        db
          .select()
          .from(coordinationDateOptions)
          .where(
            and(
              eq(coordinationDateOptions.workspaceId, workspaceId),
              eq(coordinationDateOptions.objectiveId, objective.id),
            ),
          )
          .orderBy(coordinationDateOptions.createdAt),
      ]);
      return { objective, dependencies, dateOptions };
    }),
  );

  const dependencyByObjectiveAndKey = new Map(
    dependencyGroups.flatMap(({ objective, dependencies }) =>
      dependencies.map((dependency) => [
        `${objective.id}:${dependency.key}`,
        dependency,
      ] as const),
    ),
  );
  const resolvedTreatmentObjectiveIds = new Set(
    dependencyGroups
      .filter(({ dependencies }) =>
        dependencies.some(
          (dependency) =>
            dependency.key === "treatment_deadline" &&
            dependency.status === "resolved",
        ),
      )
      .map(({ objective }) => objective.id),
  );
  const activeActions = jobActions.filter((action) => {
    if (!isActionActive(action, now)) return false;
    if (
      actionDependencyIsResolved(action, (objectiveId, key) =>
        dependencyByObjectiveAndKey.get(`${objectiveId}:${key}`)?.status,
      )
    ) return false;
    // Legacy action rows predate dependency-based resolution conditions. The
    // resolved dependency remains authoritative even when those rows still
    // carry an open status or an older kind.
    if (
      isResolvedTreatmentDecisionAction(action, resolvedTreatmentObjectiveIds)
    ) return false;
    return true;
  });
  const actionItems: WorkspaceWorkItem[] = activeActions.map((action) => ({
    id: action.id,
    source: "action",
    jobId,
    objectiveId: action.objectiveId,
    kind: action.kind,
    title: actionAttentionLabel(action),
    detail:
      action.executionStatus === "failed"
        ? action.resolutionReason ?? action.explanation
        : action.explanation,
    state:
      action.executionStatus === "failed" ? "preparation_failed" : action.status,
    responsibility: actionResponsibility(action),
    priority: action.priority,
    rank: actionAttentionRank(action),
    href: actionHref(action),
    action,
  }));
  const waitingItems: WorkspaceWorkItem[] = dependencyGroups.flatMap(
    ({ objective, dependencies }) =>
      dependencies
        .filter(
          (dependency) =>
            dependency.owner === "external" &&
            dependency.status === "needs_external",
        )
        .map((dependency) => ({
          id: dependency.id,
          source: "dependency" as const,
          jobId,
          objectiveId: objective.id,
          kind: "waiting_external",
          title: dependency.label,
          detail: dependency.result,
          state: "waiting",
          responsibility: "external" as const,
          priority: "waiting" as const,
          rank: 60,
          href: `/jobs/${jobId}#active-work`,
        })),
  );
  const workItems = [...actionItems, ...waitingItems].sort(
    (a, b) => a.rank - b.rank || a.title.localeCompare(b.title),
  );
  const primary = workItems[0] ?? null;
  const activeObjectives = dependencyGroups.filter(
    ({ objective }) => !["completed", "declined"].includes(objective.state),
  );
  const selectedDate = dependencyGroups
    .flatMap((group) => group.dateOptions)
    .find((option) => option.clientSelected);
  const currentDateOptions = dependencyGroups.flatMap((group) => {
    const groupHasSelection = group.dateOptions.some((option) => option.clientSelected);
    return group.dateOptions.map((option) => ({
      ...option,
      holdState: groupHasSelection
        ? reconcileDateOptionHoldState({
            isSelected: option.clientSelected,
            holdRequested: option.holdRequested,
            holdState: option.holdState,
          })
        : option.holdState,
    }));
  });
  const treatmentCommitment = dependencyGroups
    .flatMap((group) => group.dependencies)
    .find(
      (dependency) =>
        dependency.key === "treatment_deadline" &&
        dependency.status === "resolved" &&
        dependency.resolutionSource === "user",
    );
  const bookingSummary =
    jobRow.job.bookingStatus === "confirmed"
      ? "The booking is confirmed."
      : jobRow.job.bookingStatus === "first_hold"
        ? "A first hold is recorded; the booking is not confirmed."
        : jobRow.job.bookingStatus === "second_hold"
          ? "A second hold is recorded; the booking is not confirmed."
          : jobRow.job.bookingStatus === "released"
            ? "The hold has been released."
            : "No booking is confirmed.";
  const situationParts = [
    selectedDate
      ? `${selectedDate.label} is the selected shoot date. ${bookingSummary}`
      : `${jobRow.job.title}: ${bookingSummary}`,
    jobRow.job.feeCents
      ? `${jobRow.job.feeState === "confirmed" ? "The agreed creative fee" : "The proposed creative fee"} is ${formatMoney(jobRow.job.feeCents, jobRow.job.currency)}${jobRow.job.usageTerms ? `; the current licensing scope is ${jobRow.job.usageTerms}.` : "."}`
      : null,
    treatmentCommitment
      ? treatmentCommitment.result.replace(/^Alex /, "You ")
      : null,
    activeActions.some((action) => action.executionStatus === "failed")
      ? "Reply preparation failed and can be retried without changing the saved decision."
      : null,
  ].filter((part): part is string => Boolean(part));
  const situation = situationParts.join(" ");
  const attention = primary
    ? {
        label: primary.title,
        state: primary.state,
        responsibility: primary.responsibility,
        href: primary.href,
      }
    : {
        label: "On track",
        state: "clear",
        responsibility: null,
        href: `/jobs/${jobId}`,
      };

  return {
    ...jobRow,
    situation,
    attention,
    lifecycleLabel: lifecycleLabels[jobRow.job.lifecycleStatus],
    bookingLabel: bookingLabels[jobRow.job.bookingStatus],
    activeObjectives,
    workItems,
    needsYou: workItems.filter((item) => item.responsibility === "you"),
    repdHandling: workItems.filter((item) => item.responsibility === "repd"),
    waitingOnOthers: workItems.filter(
      (item) => item.responsibility === "external",
    ),
    primary,
    secondary: workItems.slice(1),
    pendingApprovals: actionItems.filter((item) =>
      ["pending_approval", "approved"].includes(item.action?.status ?? ""),
    ),
    failures: actionItems.filter(
      (item) => item.action?.executionStatus === "failed",
    ),
    waiting: waitingItems,
    activeQuestions: activeQuestions.filter((question) =>
      isQuestionActive(question.status),
    ),
    messages,
    invoiceDrafts: drafts,
    recent,
    documents,
    holds: {
      active: jobHolds.filter((hold) => hold.status === "active"),
      released: jobHolds.filter((hold) => hold.status === "released"),
      converted: jobHolds.filter((hold) => hold.status === "converted"),
    },
    dateOptions: currentDateOptions,
    treatmentCommitment: treatmentCommitment ?? null,
    allActions: jobActions,
  };
}

export async function getWorkspaceTodayState(
  workspaceId: string,
  now = new Date(),
) {
  const allJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.workspaceId, workspaceId))
    .orderBy(desc(jobs.updatedAt));
  const jobStates = (
    await Promise.all(
      allJobs.map((job) => getJobWorkspaceState(workspaceId, job.id, now)),
    )
  ).filter((state): state is NonNullable<typeof state> => Boolean(state));
  const projectedWork = jobStates.flatMap((state) =>
    state.workItems.map((item) => {
      const payload = item.action?.payload as { jobIds?: string[] } | undefined;
      return {
        ...item,
        jobTitle:
          item.kind === "hold_conflict" && (payload?.jobIds?.length ?? 0) > 1
            ? "Multiple jobs"
            : state.job.title,
      };
    }),
  );
  const work = [
    ...new Map(
      projectedWork.map((item) => [`${item.source}:${item.id}`, item]),
    ).values(),
  ].sort((a, b) => a.rank - b.rank || a.jobTitle.localeCompare(b.jobTitle));
  const recent = jobStates
    .flatMap((state) =>
      state.recent.map((activity) => ({ activity, jobTitle: state.job.title })),
    )
    .sort(
      (a, b) =>
        b.activity.createdAt.getTime() - a.activity.createdAt.getTime(),
    )
    .slice(0, 8);
  return {
    jobs: jobStates,
    work,
    attention: work.filter((item) => item.responsibility === "you"),
    repdHandling: work.filter((item) => item.responsibility === "repd"),
    waiting: work.filter((item) => item.responsibility === "external"),
    recent,
  };
}
