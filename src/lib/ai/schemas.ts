import { z } from "zod";

export const evidenceSchema = z.object({
  quote: z.string(),
  rationale: z.string(),
});

const extractedValue = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    state: z.enum(["proposed", "unconfirmed", "missing"]),
    confidence: z.number().min(0).max(1),
    evidence: evidenceSchema.nullable(),
  });

const calendarDateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO calendar date (YYYY-MM-DD)");

export const operationalObligationSchema = z.object({
  key: z.enum(["treatment_scope", "deck_arrival", "treatment_deadline"]),
  label: z.string(),
  owner: z.enum(["creative", "external"]),
  status: z.enum(["informational", "promised", "needs_decision"]),
  dueDate: calendarDateValue.nullable(),
  prerequisite: z.string().nullable(),
  evidence: evidenceSchema.nullable(),
});

export const inquiryExtractionSchema = z
  .object({
    isJobInquiry: z.boolean(),
    summary: z.string(),
    assessment: z.string(),
    producerRequests: z.array(z.string()),
    missingInformation: z.array(
      z.object({
        fieldKey: z.string(),
        label: z.string(),
        reason: z.string(),
        owner: z.enum(["repd", "creative", "external"]),
        askExternalParty: z.boolean(),
        suggestedQuestion: z.string().nullable(),
      }),
    ),
    risks: z.array(z.string()),
    recommendations: z.array(z.string()),
    suggestedNextWorkflowState: z.enum([
      "review_opportunity",
      "check_availability",
      "clarify_terms",
      "review_update",
      "ready_to_confirm",
    ]),
    requestedDates: z.array(
      z.object({
        label: z.string(),
        start: calendarDateValue.nullable(),
        end: calendarDateValue.nullable(),
        relationship: z.enum(["single", "alternative", "range"]),
        confidence: z.number().min(0).max(1),
        evidence: evidenceSchema.nullable(),
      }),
    ),
    holdRequest: z.object({
      requested: z.boolean(),
      kind: z.enum(["first", "second", "unspecified"]).nullable(),
      dates: z.array(z.string()),
      evidence: evidenceSchema.nullable(),
    }),
    budgetRange: z.object({
      minCents: z.number().int().nullable(),
      maxCents: z.number().int().nullable(),
      currency: z.string(),
      includesUsage: z.boolean().nullable(),
      state: z.enum(["proposed", "unconfirmed", "missing"]),
      confidence: z.number().min(0).max(1),
      evidence: evidenceSchema.nullable(),
    }),
    jobTitle: extractedValue(z.string()),
    jobTitleSource: z.enum(["generated", "source_confirmed"]),
    jobType: extractedValue(
      z.enum(["commercial", "editorial", "portrait", "event", "other"]),
    ),
    clientName: extractedValue(z.string()),
    agencyName: extractedValue(z.string()),
    producerName: extractedValue(z.string()),
    producerEmail: extractedValue(z.string()),
    shootStart: extractedValue(z.string()),
    shootEnd: extractedValue(z.string()),
    dateOnly: z.boolean(),
    location: extractedValue(z.string()),
    feeCents: extractedValue(z.number().int()),
    currency: extractedValue(z.string()),
    usageTerms: extractedValue(z.string()),
    deliverables: extractedValue(z.string()),
    paymentTerms: extractedValue(z.string()),
    bookingStatus: extractedValue(
      z.enum([
        "unbooked",
        "first_hold",
        "second_hold",
        "confirmed",
        "released",
      ]),
    ),
    lifecycleStatus: extractedValue(
      z.enum([
        "inquiry",
        "preproduction",
        "in_production",
        "completed",
        "cancelled",
      ]),
    ),
    relevantNotes: z.array(z.string()),
    operationalObligations: z.array(operationalObligationSchema),
    suggestedMatchTitle: z.string().nullable(),
    suggestedMatchReason: z.string().nullable(),
  })
  .superRefine((value, context) => {
    if (!value.dateOnly) return;
    for (const [key, field] of [
      ["shootStart", value.shootStart],
      ["shootEnd", value.shootEnd],
    ] as const)
      if (field.value && !calendarDateValue.safeParse(field.value).success)
        context.addIssue({
          code: "custom",
          path: [key, "value"],
          message: "Date-only shoot values must use YYYY-MM-DD without a time.",
        });
  });

export const missingInformationSchema = z.object({
  assessment: z.string(),
  items: z.array(
    z.object({
      fieldKey: z.string(),
      label: z.string(),
      requirement: z.enum([
        "required_now",
        "required_later",
        "optional",
        "not_applicable",
      ]),
      reason: z.string(),
      askExternalParty: z.boolean(),
      likelyRecipientRole: z.string().nullable(),
      suggestedQuestion: z.string().nullable(),
    }),
  ),
  recommendedNextStep: z.string(),
});

export const communicationDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.enum(["warm", "direct", "concise"]),
  questions: z.array(
    z.object({
      fieldKey: z.string(),
      question: z.string(),
      whyItMatters: z.string(),
    }),
  ),
});

export const briefingSchema = z.object({
  summary: z.string(),
});

export const agentNextStepSchema = z.object({
  kind: z.enum(["tool", "respond", "clarify"]),
  toolName: z.string().nullable(),
  input: z.record(z.string(), z.unknown()).default({}),
  message: z.string().default(""),
  rationaleSummary: z.string().max(300).default(""),
});

export type AgentNextStep = z.infer<typeof agentNextStepSchema>;

export type InquiryExtraction = z.infer<typeof inquiryExtractionSchema>;
export type MissingInformationAnalysis = z.infer<
  typeof missingInformationSchema
>;
export type CommunicationDraft = z.infer<typeof communicationDraftSchema>;
