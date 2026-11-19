import { describe, expect, it } from "vitest";
import {
  communicationDraftSchema,
  inquiryExtractionSchema,
} from "@/lib/ai/schemas";
import { evaluateRequirements } from "@/lib/services/requirements";
import {
  communicationPreservesTreatmentDecision,
  resolveTreatmentPreparationInput,
  treatmentCommitmentSentence,
} from "@/lib/communication-constraints";

const field = (value: unknown) => ({
  value,
  state: value == null ? "missing" : "proposed",
  confidence: value == null ? 0 : 0.9,
  evidence:
    value == null
      ? null
      : { quote: String(value), rationale: "Fixture evidence" },
});

describe("structured AI boundaries", () => {
  it("rejects a draft that weakens a conditional treatment commitment", () => {
    expect(
      communicationPreservesTreatmentDecision(
        "I can commit to November 23, subject to reviewing the deck.",
        "commit_after_deck",
      ),
    ).toBe(true);
    expect(
      communicationPreservesTreatmentDecision(
        "I will decide whether I can commit after reviewing the deck.",
        "commit_after_deck",
      ),
    ).toBe(false);
    expect(
      communicationPreservesTreatmentDecision(
        "I can commit to November 23, provided that the deck arrives and can be reviewed.",
        "commit_after_deck",
        "the promised deck arrives tomorrow and can be reviewed",
      ),
    ).toBe(false);
  });
  it("retries preparation from the saved conditional decision", () => {
    expect(
      resolveTreatmentPreparationInput({
        dependencyStatus: "resolved",
        saved: {
          decision: "commit_after_deck",
          condition: "the promised deck arrives tomorrow and can be reviewed",
        },
        requestedDecision: "cannot_commit",
        requestedCondition: null,
      }),
    ).toEqual({
      decision: "commit_after_deck",
      condition: "the promised deck arrives tomorrow and can be reviewed",
    });
  });

  it("fills a missing legacy condition from a matching trusted retry", () => {
    expect(
      resolveTreatmentPreparationInput({
        dependencyStatus: "resolved",
        saved: {
          decision: "commit_after_deck",
          condition: null,
        },
        requestedDecision: "commit_after_deck",
        requestedCondition:
          "the promised deck arrives tomorrow and can be reviewed",
      }),
    ).toEqual({
      decision: "commit_after_deck",
      condition: "the promised deck arrives tomorrow and can be reviewed",
    });
  });
  it("builds an immutable conditional commitment sentence", () => {
    const sentence = treatmentCommitmentSentence({
      decision: "commit_after_deck",
      dueDate: "November 23",
      condition: "the promised deck arrives tomorrow and can be reviewed",
    });
    expect(sentence).toBe(
      "I can meet the November 23 treatment deadline provided that the promised deck arrives tomorrow and can be reviewed.",
    );
    expect(
      communicationPreservesTreatmentDecision(
        sentence,
        "commit_after_deck",
        "the promised deck arrives tomorrow and can be reviewed",
      ),
    ).toBe(true);
  });
  it("accepts a complete source-backed extraction", () => {
    const parsed = inquiryExtractionSchema.parse({
      isJobInquiry: true,
      summary: "Campaign inquiry",
      assessment: "A commercial inquiry that needs usage clarification.",
      producerRequests: ["Check availability"],
      missingInformation: [],
      risks: [],
      recommendations: ["Clarify usage"],
      suggestedNextWorkflowState: "clarify_terms",
      requestedDates: [
        {
          label: "December 16",
          start: "2026-12-16",
          end: "2026-12-16",
          relationship: "alternative",
          confidence: 0.9,
          evidence: {
            quote: "December 16 or 17",
            rationale: "Two one-day alternatives",
          },
        },
        {
          label: "December 17",
          start: "2026-12-17",
          end: "2026-12-17",
          relationship: "alternative",
          confidence: 0.9,
          evidence: {
            quote: "December 16 or 17",
            rationale: "Two one-day alternatives",
          },
        },
      ],
      holdRequest: {
        requested: true,
        kind: "second",
        dates: ["December 16", "December 17"],
        evidence: {
          quote: "second hold on both dates",
          rationale: "Requested, not granted",
        },
      },
      budgetRange: {
        minCents: 500000,
        maxCents: 700000,
        currency: "USD",
        includesUsage: null,
        state: "proposed",
        confidence: 0.9,
        evidence: { quote: "$5–7k", rationale: "Indicative range" },
      },
      jobTitle: field("Spring campaign"),
      jobTitleSource: "source_confirmed",
      jobType: field("commercial"),
      clientName: field("Acme"),
      agencyName: field(null),
      producerName: field("Maya"),
      producerEmail: field("maya@example.com"),
      shootStart: field("2027-03-18"),
      shootEnd: field(null),
      dateOnly: true,
      location: field("Brooklyn"),
      feeCents: field(500000),
      currency: field("USD"),
      usageTerms: field(null),
      deliverables: field("10 stills"),
      paymentTerms: field("Net 30"),
      bookingStatus: field("unbooked"),
      lifecycleStatus: field("inquiry"),
      relevantNotes: [],
      operationalObligations: [],
      suggestedMatchTitle: null,
      suggestedMatchReason: null,
    });
    expect(parsed.usageTerms.state).toBe("missing");
    expect(parsed.feeCents.value).toBe(500000);
    expect(parsed.holdRequest.kind).toBe("second");
    expect(parsed.bookingStatus.value).toBe("unbooked");
    expect(parsed.requestedDates).toHaveLength(2);
    expect(
      parsed.requestedDates.every(
        (item) => item.relationship === "alternative",
      ),
    ).toBe(true);
    expect(parsed.budgetRange).toMatchObject({
      minCents: 500000,
      maxCents: 700000,
      includesUsage: null,
      state: "proposed",
    });
  });
  it("rejects timestamps masquerading as calendar dates", () => {
    const complete = {
      isJobInquiry: true,
      summary: "Date boundary",
      assessment: "Calendar date",
      producerRequests: [],
      missingInformation: [],
      risks: [],
      recommendations: [],
      suggestedNextWorkflowState: "review_update",
      requestedDates: [],
      holdRequest: {
        requested: false,
        kind: null,
        dates: [],
        evidence: null,
      },
      budgetRange: {
        minCents: null,
        maxCents: null,
        currency: "USD",
        includesUsage: null,
        state: "missing",
        confidence: 0,
        evidence: null,
      },
      jobTitle: field("Campaign"),
      jobTitleSource: "generated",
      jobType: field("commercial"),
      clientName: field("Client"),
      agencyName: field(null),
      producerName: field(null),
      producerEmail: field(null),
      shootStart: field("2026-12-16T00:00:00.000Z"),
      shootEnd: field(null),
      dateOnly: true,
      location: field(null),
      feeCents: field(null),
      currency: field("USD"),
      usageTerms: field(null),
      deliverables: field(null),
      paymentTerms: field(null),
      bookingStatus: field(null),
      lifecycleStatus: field(null),
      relevantNotes: [],
      operationalObligations: [],
      suggestedMatchTitle: null,
      suggestedMatchReason: null,
    };
    expect(() => inquiryExtractionSchema.parse(complete)).toThrow(
      /without a time/,
    );
  });
  it("rejects malformed or unsupported model output", () => {
    expect(() =>
      communicationDraftSchema.parse({
        subject: "Hi",
        body: "Draft",
        tone: "invented",
        questions: [],
      }),
    ).toThrow();
    expect(() =>
      inquiryExtractionSchema.parse({ summary: "partial" }),
    ).toThrow();
  });
});

describe("contextual information requirements", () => {
  it("requires commercial usage now without demanding every empty field", () => {
    const result = evaluateRequirements({
      jobType: "commercial",
      lifecycleStatus: "inquiry",
      shootStart: new Date(),
      shootDate: null,
      usageTerms: null,
      location: "Brooklyn",
      feeCents: 500000,
      paymentTerms: null,
    });
    expect(result.find((item) => item.fieldKey === "usageTerms")?.state).toBe(
      "required_now",
    );
    expect(result.find((item) => item.fieldKey === "paymentTerms")?.state).toBe(
      "required_later",
    );
  });
  it("does not treat editorial usage like a commercial licensing blocker", () => {
    const result = evaluateRequirements({
      jobType: "editorial",
      lifecycleStatus: "inquiry",
      shootStart: new Date(),
      shootDate: null,
      usageTerms: null,
      location: "Studio",
      feeCents: 200000,
      paymentTerms: null,
    });
    expect(
      result.find((item) => item.fieldKey === "usageTerms")?.state,
    ).not.toBe("required_now");
  });
  it("does not treat preserved alternative dates as a missing shoot date", () => {
    const result = evaluateRequirements({
      jobType: "commercial",
      lifecycleStatus: "inquiry",
      shootStart: null,
      shootDate: null,
      requestedDateCount: 2,
      usageTerms: null,
    });
    expect(
      result.find((item) => item.fieldKey === "shootStart")?.state,
    ).not.toBe("required_now");
  });
});
