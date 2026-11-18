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
      const response =
        /worldwide|usage|licen[cs]/i.test(input) &&
        /twelve|12 month|one year/i.test(input);
      fixture = {
        isJobInquiry: true,
        summary: response
          ? "A producer supplied usage details for the existing campaign."
          : "A commercial campaign inquiry with dates, fee, and producer details; usage is not specified.",
        jobTitle: extracted("Nike Spring Campaign"),
        jobType: extracted("commercial"),
        clientName: extracted("Nike"),
        agencyName: extracted("Wieden+Kennedy"),
        producerName: extracted("Maya Chen"),
        producerEmail: extracted("maya@example.com"),
        shootStart: extracted("2027-03-18T12:00:00.000Z"),
        shootEnd: extracted("2027-03-19T12:00:00.000Z"),
        dateOnly: true,
        location: extracted("Brooklyn, NY"),
        feeCents: extracted(850000),
        currency: extracted("USD"),
        usageTerms: response
          ? extracted("Worldwide digital and social, 12 months")
          : extracted(null),
        deliverables: extracted("Campaign stills and select social crops"),
        paymentTerms: extracted("Net 30"),
        bookingStatus: extracted("first_hold"),
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
