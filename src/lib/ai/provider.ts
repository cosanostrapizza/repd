import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

export type ModelResult<T> = {
  data: T;
  requestId: string | null;
  model: string;
  durationMs: number;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  runStructured<T>(args: {
    purpose: string;
    instructions: string;
    input: string;
    schema: z.ZodType<T>;
    schemaName: string;
  }): Promise<ModelResult<T>>;
}

export class AIConfigurationError extends Error {
  constructor(
    message = "AI is not configured. Add OPENAI_API_KEY to enable inquiry analysis and drafting.",
  ) {
    super(message);
    this.name = "AIConfigurationError";
  }
}
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code = "provider_error",
    public readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function getAIConfiguration() {
  const fixture =
    process.env.AI_FIXTURE_MODE === "test" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PLAYWRIGHT_TEST === "true");
  return {
    configured: fixture || Boolean(process.env.OPENAI_API_KEY),
    provider: fixture ? "Test fixture" : "OpenAI",
    model: fixture
      ? "deterministic-test-model"
      : (process.env.OPENAI_MODEL ?? "gpt-6.2-astra"),
  };
}

class FixtureAIProvider implements AIProvider {
  readonly name = "test-fixture";
  readonly model = "deterministic-test-model";
  async runStructured<T>({
    purpose,
    input,
    schema,
  }: {
    purpose: string;
    instructions: string;
    input: string;
    schema: z.ZodType<T>;
    schemaName: string;
  }): Promise<ModelResult<T>> {
    const extracted = (
      value: unknown,
      state = value == null ? "missing" : "proposed",
    ) => ({
      value,
      state,
      confidence: value == null ? 0 : 0.96,
      evidence:
        value == null
          ? null
          : {
              quote: String(value),
              rationale: "Deterministic automated-test fixture.",
            },
    });
    let fixture: unknown;
    if (purpose === "inquiry_extraction") {
      const adidas = /adidas/i.test(input);
      const response =
        /worldwide|usage|licen[cs]/i.test(input) &&
        /twelve|12 month|one year/i.test(input);
      fixture = {
        isJobInquiry: true,
        summary: response
          ? "A producer supplied usage details for the existing campaign."
          : adidas
            ? "Jamie is checking availability for an Adidas campaign on one of two possible dates and has asked for first holds while commercial terms are still taking shape."
            : "A commercial campaign inquiry with dates, fee, and producer details; usage is not specified.",
        assessment: response
          ? "The usage response resolves the main licensing question; the stored job should be updated without changing unrelated terms."
          : "This is an early commercial inquiry. The requested dates and fee can be considered, but usage must be defined before the scope can be evaluated.",
        producerRequests: response
          ? ["Apply the clarified usage to the existing campaign."]
          : ["Consider a first hold for the proposed shoot dates."],
        missingInformation: response
          ? []
          : [
              {
                fieldKey: "usageTerms",
                label: "Usage rights",
                reason:
                  "Media, territory, and term affect the commercial license.",
                askExternalParty: true,
                suggestedQuestion:
                  "Could you confirm the intended media, territory, and usage term?",
              },
            ],
        risks: response
          ? []
          : ["The hold has been requested but has not been granted."],
        recommendations: response
          ? ["Accept the clarified usage into the job brief."]
          : [
              "Check the requested dates against existing commitments.",
              "Decide whether to offer the requested hold.",
              "Clarify media, territory, and usage term.",
            ],
        suggestedNextWorkflowState: response
          ? "review_update"
          : "check_availability",
        preparedResponse: {
          subject: adidas
            ? "Adidas campaign — dates and usage"
            : "Nike Spring Campaign — availability and usage",
          body: adidas
            ? "Hi Jamie,\n\nThanks so much for thinking of me for this. I’m checking December 8 and 9 now. Could you confirm the intended media, territory, usage term, and whether OOH is part of the plan? That will help me evaluate the scope and fee properly.\n\nBest,\nAlex"
            : "Hi Maya,\n\nThanks for thinking of me for this. I’m reviewing the proposed dates now. Could you confirm the intended media, territory, and usage term? That will help me evaluate the scope and fee properly.\n\nBest,\nAlex",
          tone: "warm",
        },
        requestedDates: adidas
          ? [
              {
                label: "December 8",
                start: null,
                end: null,
                relationship: "alternative",
                confidence: 0.96,
                evidence: {
                  quote: "Dec 8 or 9",
                  rationale: "The message offers two alternative dates.",
                },
              },
              {
                label: "December 9",
                start: null,
                end: null,
                relationship: "alternative",
                confidence: 0.96,
                evidence: {
                  quote: "Dec 8 or 9",
                  rationale: "The message offers two alternative dates.",
                },
              },
            ]
          : [
              {
                label: "March 18–19, 2027",
                start: "2027-03-18T12:00:00.000Z",
                end: "2027-03-19T12:00:00.000Z",
                relationship: "range",
                confidence: 0.96,
                evidence: {
                  quote: "March 18–19",
                  rationale: "The message describes a continuous date range.",
                },
              },
            ],
        holdRequest: {
          requested: !response,
          kind: response ? null : "first",
          dates: response
            ? []
            : adidas
              ? ["December 8", "December 9"]
              : ["March 18–19, 2027"],
          evidence: response
            ? null
            : {
                quote: "first hold",
                rationale: "The producer requested a hold; it was not granted.",
              },
        },
        jobTitle: extracted(
          adidas ? "Adidas Campaign" : "Nike Spring Campaign",
        ),
        jobType: extracted("commercial"),
        clientName: extracted(adidas ? "Adidas" : "Nike"),
        agencyName: extracted("Wieden+Kennedy"),
        producerName: extracted(adidas ? "Jamie" : "Maya Chen"),
        producerEmail: adidas ? extracted(null) : extracted("maya@example.com"),
        shootStart: adidas
          ? extracted(null)
          : extracted("2027-03-18T12:00:00.000Z"),
        shootEnd: adidas
          ? extracted(null)
          : extracted("2027-03-19T12:00:00.000Z"),
        dateOnly: true,
        location: extracted("Brooklyn, NY"),
        feeCents: extracted(adidas ? 350000 : 850000),
        currency: extracted("USD"),
        usageTerms: response
          ? extracted("Worldwide digital and social, 12 months")
          : extracted(null),
        deliverables: extracted(
          adidas
            ? "Approximately 15 finals"
            : "Campaign stills and select social crops",
        ),
        paymentTerms: adidas ? extracted(null) : extracted("Net 30"),
        bookingStatus: extracted("unbooked"),
        lifecycleStatus: extracted("inquiry"),
        relevantNotes: [],
        suggestedMatchTitle: response ? "Nike Spring Campaign" : null,
        suggestedMatchReason: response
          ? "The campaign title and producer match."
          : null,
      };
    } else if (purpose === "missing_information_analysis")
      fixture = {
        assessment:
          "Usage rights are required now to evaluate the commercial fee.",
        items: [
          {
            fieldKey: "usageTerms",
            label: "Usage rights",
            requirement: "required_now",
            reason:
              "Media, term, and territory materially affect the value of a commercial license.",
            askExternalParty: true,
            likelyRecipientRole: "Producer",
            suggestedQuestion:
              "Could you confirm the intended media, territory, and usage term?",
          },
        ],
        recommendedNextStep:
          "Review the concise usage question prepared for Maya.",
      };
    else
      fixture = {
        subject: "Nike Spring Campaign — usage details",
        body: "Hi Maya,\n\nThanks for sending this through. Could you confirm the intended media, territory, and usage term for the campaign? That will help me evaluate the scope and fee properly.\n\nBest,\nAlex",
        tone: "warm",
        questions: [
          {
            fieldKey: "usageTerms",
            question:
              "Could you confirm the intended media, territory, and usage term?",
            whyItMatters: "Usage scope affects licensing value.",
          },
        ],
      };
    return {
      data: schema.parse(fixture),
      requestId: "fixture-request",
      model: this.model,
      durationMs: 1,
    };
  }
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly model = process.env.OPENAI_MODEL ?? "gpt-6.2-astra";
  private readonly client: OpenAI;
  constructor() {
    if (!process.env.OPENAI_API_KEY) throw new AIConfigurationError();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 2,
      timeout: 45_000,
    });
  }
  async runStructured<T>({
    instructions,
    input,
    schema,
    schemaName,
  }: {
    purpose: string;
    instructions: string;
    input: string;
    schema: z.ZodType<T>;
    schemaName: string;
  }): Promise<ModelResult<T>> {
    const started = Date.now();
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions,
        input,
        store: false,
        text: { format: zodTextFormat(schema, schemaName) },
      });
      if (!response.output_parsed)
        throw new AIProviderError(
          "The model returned no usable structured output.",
          "empty_output",
          response._request_id ?? null,
        );
      return {
        data: response.output_parsed as T,
        requestId: response._request_id ?? null,
        model: this.model,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof OpenAI.APIError)
        throw new AIProviderError(
          error.message,
          `openai_${error.status ?? "connection"}`,
          error.requestID ?? null,
        );
      throw new AIProviderError(
        error instanceof Error ? error.message : "Unknown model provider error",
      );
    }
  }
}

export function getAIProvider(): AIProvider {
  if (
    process.env.AI_FIXTURE_MODE === "test" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PLAYWRIGHT_TEST === "true")
  )
    return new FixtureAIProvider();
  return new OpenAIProvider();
}
