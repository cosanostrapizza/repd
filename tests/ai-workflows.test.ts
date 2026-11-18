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
      preparedResponse: {
        subject: "Spring campaign",
        body: "Thanks for reaching out. Could you confirm usage?",
        tone: "warm",
      },
      requestedDates: [],
      holdRequest: {
        requested: false,
        kind: null,
        dates: [],
        evidence: null,
      },
      jobTitle: field("Spring campaign"),
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
      bookingStatus: field("first_hold"),
      lifecycleStatus: field("inquiry"),
      relevantNotes: [],
      suggestedMatchTitle: null,
      suggestedMatchReason: null,
    });
    expect(parsed.usageTerms.state).toBe("missing");
    expect(parsed.feeCents.value).toBe(500000);
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
});
