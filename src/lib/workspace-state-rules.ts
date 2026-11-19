import type { Action } from "@/db/schema";

export function isActionActive(action: Action, now = new Date()) {
  if (action.status === "resolved" || action.supersededById) return false;
  if (
    action.status === "deferred" &&
    action.deferredUntil &&
    action.deferredUntil > now
  )
    return false;
  return true;
}

export function actionAttentionRank(action: Action) {
  if (action.executionStatus === "failed") return 0;
  if (action.status === "pending_approval" || action.status === "approved")
    return 10;
  if (
    ["advance_inquiry", "treatment_commitment"].includes(action.kind) &&
    action.status === "open"
  )
    return 20;
  if (action.priority === "urgent") return 25;
  if (action.status === "executing") return 30;
  if (action.priority === "blocking") return 40;
  if (action.priority === "routine") return 70;
  return 80;
}

export function actionAttentionLabel(
  action: Pick<Action, "executionStatus" | "status" | "kind" | "title">,
) {
  if (action.executionStatus === "failed") return "Reply needs retry";
  if (action.status === "executing") return "Repd is preparing";
  if (action.status === "pending_approval")
    return action.kind === "invoice"
      ? "Invoice ready for review"
      : "Review producer reply";
  if (action.kind === "hold_conflict") return "Resolve hold conflict";
  if (action.kind === "invoice") return "Complete invoice details";
  return action.title;
}

export function isQuestionActive(status: string) {
  return status === "draft" || status === "asked";
}

export function actionDependencyIsResolved(
  action: Pick<Action, "objectiveId" | "resolutionCondition">,
  dependencyStatus: (objectiveId: string, key: string) => string | undefined,
) {
  const condition = action.resolutionCondition;
  return Boolean(
    action.objectiveId &&
      condition.type === "dependency_resolved" &&
      condition.field &&
      dependencyStatus(action.objectiveId, condition.field) === "resolved",
  );
}

export function reconcileDateOptionHoldState(args: {
  isSelected: boolean;
  holdRequested: boolean;
  holdState: "not_requested" | "requested" | "granted" | "declined" | "released";
}) {
  if (
    !args.isSelected &&
    args.holdRequested &&
    (args.holdState === "requested" || args.holdState === "granted")
  )
    return "released" as const;
  return args.holdState;
}

export function isResolvedTreatmentDecisionAction(
  action: Pick<Action, "kind" | "title" | "objectiveId">,
  resolvedObjectiveIds: ReadonlySet<string>,
) {
  if (!resolvedObjectiveIds.size) return false;
  const representsDecision =
    action.kind === "treatment_commitment" ||
    /decide whether to commit to the treatment deadline/i.test(action.title);
  return (
    representsDecision &&
    (!action.objectiveId || resolvedObjectiveIds.has(action.objectiveId))
  );
}
