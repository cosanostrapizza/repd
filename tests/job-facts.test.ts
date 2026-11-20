import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectDisplayedJobFacts } from "@/lib/job-facts";

describe("source-aware job facts", () => {
  const at = (day: number) => new Date(`2026-11-${day}T12:00:00.000Z`);
  const field = {
    id: "field-1",
    key: "feeCents",
    label: "Creative fee",
    requirementReason: "Needed to evaluate the opportunity.",
    acceptedRevisionId: "revision-2",
  };
  const source = {
    id: "source-2",
    type: "producer_response",
    subject: "Revised offer",
    sender: "Maya",
    capturedAt: at(19),
  };

  it("preserves a proposed value and exposes its previous accepted value", () => {
    const result = projectDisplayedJobFacts({
      fields: [field],
      revisions: [
        {
          id: "revision-2",
          fieldId: field.id,
          sourceId: source.id,
          value: 900000,
          informationState: "proposed",
          confidence: 97,
          reviewStatus: "accepted",
          createdAt: at(19),
          source,
        },
        {
          id: "revision-1",
          fieldId: field.id,
          sourceId: "source-1",
          value: 850000,
          informationState: "proposed",
          confidence: 98,
          reviewStatus: "accepted",
          createdAt: at(18),
          source: { ...source, id: "source-1", subject: "Original brief" },
        },
      ],
      successfulSourceRuns: [{ id: "ai-run-2", sourceId: source.id }],
    });

    expect(result[0].current).toMatchObject({
      value: 900000,
      informationState: "proposed",
      reviewStatus: "accepted",
    });
    expect(result[0].history[1].value).toBe(850000);
    expect(result[0].contribution).toMatchObject({
      kind: "proposed_term_captured",
      agentRunId: "ai-run-2",
    });
  });

  it.each(["missing", "conflicting"] as const)(
    "keeps %s information distinct from confirmed data",
    (informationState) => {
      const result = projectDisplayedJobFacts({
        fields: [field],
        revisions: [
          {
            id: "revision-2",
            fieldId: field.id,
            sourceId: source.id,
            value: informationState === "missing" ? null : 900000,
            informationState,
            confidence: 90,
            reviewStatus: "accepted",
            createdAt: at(19),
            source,
          },
        ],
        successfulSourceRuns: [{ id: "ai-run-2", sourceId: source.id }],
      });

      expect(result[0].current.informationState).toBe(informationState);
      expect(result[0].contribution?.kind).toBe(
        informationState === "missing"
          ? "missing_information_identified"
          : "discrepancy_identified",
      );
    },
  );

  it("does not attribute a source revision to Repd without a persisted run", () => {
    const result = projectDisplayedJobFacts({
      fields: [field],
      revisions: [
        {
          id: "revision-2",
          fieldId: field.id,
          sourceId: source.id,
          value: 900000,
          informationState: "proposed",
          confidence: 97,
          reviewStatus: "accepted",
          createdAt: at(19),
          source,
        },
      ],
      successfulSourceRuns: [],
    });

    expect(result[0].contribution).toBeNull();
  });
});
