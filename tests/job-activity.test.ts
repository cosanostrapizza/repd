import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectJobActivity } from "@/lib/job-activity";

describe("job activity projection", () => {
  const at = (minute: number) =>
    new Date(`2026-11-19T12:${String(minute).padStart(2, "0")}:00.000Z`);

  it("orders events and folds an incorporated source into its business change", () => {
    const result = projectJobActivity({
      activities: [
        {
          id: "activity-1",
          actorUserId: "user-1",
          type: "producer_response_accepted",
          summary: "Accepted a producer update",
          metadata: { sourceId: "source-1" },
          createdAt: at(2),
        },
      ],
      sources: [
        {
          id: "source-1",
          type: "producer_response",
          direction: "incoming",
          subject: "Producer update",
          sender: "Maya",
          capturedAt: at(1),
        },
      ],
      actionEvents: [],
      agentEvents: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "activity:activity-1",
      category: "human",
      summary: "Accepted a producer update",
    });
    expect(result[0].provenance).toContainEqual({
      type: "source",
      id: "source-1",
    });
  });

  it("keeps incoming evidence and suppresses duplicate agent/action events", () => {
    const result = projectJobActivity({
      activities: [],
      sources: [
        {
          id: "source-2",
          type: "pasted_email",
          direction: "incoming",
          subject: "New brief",
          sender: "Producer",
          capturedAt: at(1),
        },
      ],
      actionEvents: [
        {
          event: {
            id: "event-1",
            actionId: "action-1",
            type: "invoice_prepared",
            reason: null,
            createdAt: at(3),
          },
          action: { title: "Invoice ready for review", kind: "invoice" },
        },
      ],
      agentEvents: [
        {
          id: "agent-event-1",
          actionId: "action-1",
          type: "artifact_preparation",
          status: "completed",
          label: "Prepared invoice",
          detail: null,
          createdAt: at(2),
        },
      ],
    });

    expect(result.map((item) => item.id)).toEqual([
      "action-event:event-1",
      "source:source-2",
    ]);
    expect(result[0]).toMatchObject({
      category: "agent",
      kind: "artifact_prepared",
      actorLabel: "Repd",
    });
  });
});
