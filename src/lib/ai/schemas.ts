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

export const inquiryExtractionSchema = z.object({
  isJobInquiry: z.boolean(),
  summary: z.string(),
  jobTitle: extractedValue(z.string()),
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
    z.enum(["unbooked", "first_hold", "second_hold", "confirmed", "released"]),
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
  suggestedMatchTitle: z.string().nullable(),
  suggestedMatchReason: z.string().nullable(),
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

export type InquiryExtraction = z.infer<typeof inquiryExtractionSchema>;
export type MissingInformationAnalysis = z.infer<
  typeof missingInformationSchema
>;
export type CommunicationDraft = z.infer<typeof communicationDraftSchema>;
