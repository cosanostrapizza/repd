import type { Action } from "@/db/schema";

export type HandledWorkPresentation = {
  title: string;
  detail: string;
};

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

export function actionDestination(
  action: Pick<Action, "id" | "jobId" | "kind">,
) {
  if (
    action.jobId &&
    ["advance_inquiry", "treatment_commitment"].includes(action.kind)
  )
    return `/jobs/${action.jobId}#next-steps`;
  return `/actions/${action.id}`;
}

export function actionPreparedSummary(
  action: Pick<
    Action,
    "kind" | "status" | "executionStatus" | "recommendation" | "preparedContent"
  >,
) {
  if (action.executionStatus === "failed")
    return "Your saved decision is intact; Repd can retry the preparation.";
  if (action.kind === "hold_conflict")
    return "Repd gathered the overlapping holds and their current job context.";
  if (action.kind === "invoice" && action.status === "pending_approval")
    return "An internal invoice draft is ready. It has not been issued or sent.";
  if (
    ["producer_coordination", "missing_information"].includes(action.kind) &&
    (action.preparedContent || action.status === "pending_approval")
  )
    return "A source-backed reply is prepared for your review.";
  if (["advance_inquiry", "treatment_commitment"].includes(action.kind))
    return "Repd organized the relevant facts and decision context in the job.";
  return action.recommendation;
}

export function handledActivityPresentation(
  type: string,
  summary: string,
): HandledWorkPresentation | null {
  if (type === "producer_response_accepted")
    return {
      title: "Reconciled a producer update",
      detail: summary,
    };
  if (type === "source_update_accepted")
    return {
      title: "Updated the job brief from new information",
      detail: summary,
    };
  if (type === "inquiry_accepted")
    return {
      title: "Organized a new inquiry into a job brief",
      detail: summary,
    };
  return null;
}

export function handledActionEventPresentation(
  type: string,
): HandledWorkPresentation | null {
  if (type === "invoice_prepared_automatically")
    return {
      title: "Prepared an invoice draft",
      detail:
        "Repd used the confirmed job and billing details. The draft still requires review before any external handoff.",
    };
  if (type === "conditional_follow_up_resolved")
    return {
      title: "Cleared a follow-up after a reply arrived",
      detail:
        "Repd matched the recorded incoming information to the open follow-up and closed it.",
    };
  return null;
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
  holdState:
    "not_requested" | "requested" | "granted" | "declined" | "released";
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
