import { describe, expect, it } from "vitest";
import type { Action } from "@/db/schema";
import {
  actionAttentionRank,
  actionAttentionLabel,
  actionDestination,
  actionPreparedSummary,
  actionDependencyIsResolved,
  handledActionEventPresentation,
  handledActivityPresentation,
  isActionActive,
  isQuestionActive,
  isResolvedTreatmentDecisionAction,
  reconcileDateOptionHoldState,
} from "@/lib/workspace-state-rules";

function action(overrides: Partial<Action> = {}) {
  return {
    status: "open",
    executionStatus: "not_requested",
    priority: "routine",
    kind: "job_review",
    supersededById: null,
    deferredUntil: null,
    ...overrides,
  } as Action;
}

describe("canonical active-work rules", () => {
  it("excludes resolved, superseded, and future-deferred actions", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(isActionActive(action({ status: "resolved" }), now)).toBe(false);
    expect(isActionActive(action({ supersededById: "replacement" }), now)).toBe(
      false,
    );
    expect(
      isActionActive(
        action({
          status: "deferred",
          deferredUntil: new Date("2026-11-19T12:00:00Z"),
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isActionActive(
        action({
          status: "deferred",
          deferredUntil: new Date("2026-11-17T12:00:00Z"),
        }),
        now,
      ),
    ).toBe(true);
  });

  it("prioritizes recovery and approval ahead of routine work", () => {
    expect(actionAttentionRank(action({ executionStatus: "failed" }))).toBe(0);
    expect(actionAttentionRank(action({ status: "pending_approval" }))).toBe(
      10,
    );
    expect(actionAttentionRank(action())).toBe(70);
    expect(actionAttentionRank(action({ priority: "urgent" }))).toBe(25);
    expect(actionAttentionRank(action({ priority: "blocking" }))).toBe(40);
  });

  it("uses one actionable attention vocabulary across surfaces", () => {
    expect(actionAttentionLabel(action({ executionStatus: "failed" }))).toBe(
      "Reply needs retry",
    );
    expect(
      actionAttentionLabel(
        action({ kind: "invoice", status: "pending_approval" }),
      ),
    ).toBe("Invoice ready for review");
    expect(actionAttentionLabel(action({ kind: "hold_conflict" }))).toBe(
      "Resolve hold conflict",
    );
  });

  it("routes actions to their canonical review or job context", () => {
    expect(
      actionDestination(
        action({ id: "reply", jobId: "job-1", kind: "producer_coordination" }),
      ),
    ).toBe("/actions/reply");
    expect(
      actionDestination(
        action({
          id: "decision",
          jobId: "job-1",
          kind: "treatment_commitment",
        }),
      ),
    ).toBe("/jobs/job-1#next-steps");
  });

  it("describes only persisted preparation and allowlisted handled work", () => {
    expect(
      actionPreparedSummary(
        action({
          kind: "invoice",
          status: "pending_approval",
          recommendation: "Review it",
        }),
      ),
    ).toMatch(/internal invoice draft/i);
    expect(
      handledActivityPresentation(
        "producer_response_accepted",
        "Accepted the confirmed date.",
      ),
    ).toEqual({
      title: "Reconciled a producer update",
      detail: "Accepted the confirmed date.",
    });
    expect(
      handledActivityPresentation("job_updated", "Job details updated"),
    ).toBeNull();
    expect(
      handledActionEventPresentation("invoice_prepared_automatically")?.title,
    ).toBe("Prepared an invoice draft");
    expect(handledActionEventPresentation("handoff")).toBeNull();
  });

  it("does not resurrect answered or obsolete questions", () => {
    expect(isQuestionActive("draft")).toBe(true);
    expect(isQuestionActive("asked")).toBe(true);
    expect(isQuestionActive("answered")).toBe(false);
    expect(isQuestionActive("obsolete")).toBe(false);
  });

  it("does not project a decision whose canonical dependency is resolved", () => {
    const treatment = action({
      objectiveId: "objective-new-balance",
      kind: "treatment_commitment",
      title: "Decide whether to commit to the treatment deadline",
      resolutionCondition: {
        type: "dependency_resolved",
        field: "treatment_deadline",
      },
    });
    expect(
      actionDependencyIsResolved(treatment, (objectiveId, key) =>
        objectiveId === "objective-new-balance" && key === "treatment_deadline"
          ? "resolved"
          : undefined,
      ),
    ).toBe(true);
    expect(actionDependencyIsResolved(treatment, () => "needs_decision")).toBe(
      false,
    );
  });

  it("releases an unselected requested hold without rewriting its history", () => {
    expect(
      reconcileDateOptionHoldState({
        isSelected: false,
        holdRequested: true,
        holdState: "requested",
      }),
    ).toBe("released");
    expect(
      reconcileDateOptionHoldState({
        isSelected: true,
        holdRequested: true,
        holdState: "granted",
      }),
    ).toBe("granted");
  });

  it("filters a retained legacy treatment action after the decision is recorded", () => {
    const resolved = new Set(["objective-new-balance"]);
    expect(
      isResolvedTreatmentDecisionAction(
        action({
          objectiveId: "objective-new-balance",
          kind: "advance_inquiry",
          title: "Decide whether to commit to the treatment deadline",
        }),
        resolved,
      ),
    ).toBe(true);
    expect(
      isResolvedTreatmentDecisionAction(
        action({
          objectiveId: "objective-other",
          kind: "advance_inquiry",
          title: "Decide whether to commit to the treatment deadline",
        }),
        resolved,
      ),
    ).toBe(false);
  });
});
