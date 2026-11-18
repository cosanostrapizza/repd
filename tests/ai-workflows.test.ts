import { describe, expect, it } from "vitest";
import {
  communicationDraftSchema,
  inquiryExtractionSchema,
} from "@/lib/ai/schemas";
import { evaluateRequirements } from "@/lib/services/requirements";

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
          start: "2026-12-16T14:00:00.000Z",
          end: "2026-12-17T00:00:00.000Z",
          relationship: "alternative",
          confidence: 0.9,
          evidence: {
            quote: "December 16 or 17",
            rationale: "Two one-day alternatives",
          },
        },
        {
          label: "December 17",
          start: "2026-12-17T14:00:00.000Z",
          end: "2026-12-18T00:00:00.000Z",
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
      shootStart: field("2027-03-18T12:00:00.000Z"),
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
      requestedDateCount: 2,
      usageTerms: null,
    });
    expect(
      result.find((item) => item.fieldKey === "shootStart")?.state,
    ).not.toBe("required_now");
  });
});
