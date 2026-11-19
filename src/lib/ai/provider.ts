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
    if (input.includes("[fixture:fail]"))
      throw new AIProviderError(
        "Deterministic provider failure for regression testing.",
        "fixture_failure",
        "fixture-request-failed",
      );
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
      const newBalance = /new balance/i.test(input);
      const response =
        /reviewed against this existing job/i.test(input) &&
        /worldwide|usage|licen[cs]/i.test(input) &&
        /twelve|12 month|one year/i.test(input);
      fixture = {
        isJobInquiry: true,
        summary: response
          ? newBalance
            ? "Sarah selected December 16, clarified usage and photography deliverables, and requested a five-slide treatment by November 23 after sending the deck."
            : "A producer supplied usage details for the existing campaign."
          : adidas
            ? "Jamie is checking availability for an Adidas campaign on one of two possible dates and has asked for first holds while commercial terms are still taking shape."
            : newBalance
              ? "Sarah at Wieden+Kennedy is exploring a one-day New Balance shoot on December 16 or 17 and is requesting second holds. The indicative photography budget is $6–8k, with licensing and treatment expectations unresolved."
              : "A commercial campaign inquiry with dates, fee, and producer details; usage is not specified.",
        assessment: response
          ? newBalance
            ? "The client-selected date is not a booking confirmation. The commercial clarifications resolve earlier uncertainty, while Alex still needs to decide whether the treatment deadline is workable after reviewing the promised deck."
            : "The usage response resolves the main licensing question; the stored job should be updated without changing unrelated terms."
          : newBalance
            ? "This is an early commercial opportunity. Repd should check the two alternative dates and relevant history before Alex decides whether to engage or grant either requested second hold."
            : "This is an early commercial inquiry. The requested dates and fee can be considered, but usage must be defined before the scope can be evaluated.",
        producerRequests: response
          ? newBalance
            ? [
                "Note December 16 as the client-selected shoot date.",
                "Use the clarified US paid social, web, and retail terms for 12 months.",
                "Prepare a five-slide treatment by November 23 after the deck arrives.",
              ]
            : ["Apply the clarified usage to the existing campaign."]
          : newBalance
            ? [
                "Consider second holds for December 16 and 17.",
                "Confirm interest and any New Balance category conflicts.",
                "Request treatment details if interested.",
              ]
            : ["Consider a first hold for the proposed shoot dates."],
        missingInformation: response
          ? []
          : [
              {
                fieldKey: "usageTerms",
                label: "Usage rights",
                reason:
                  "Media, territory, and term affect the commercial license.",
                owner: "external",
                askExternalParty: true,
                suggestedQuestion:
                  "Could you confirm the intended media, territory, and usage term?",
              },
              ...(newBalance
                ? [
                    {
                      fieldKey: "budgetIncludesUsage",
                      label: "Budget and usage",
                      reason:
                        "The indicative photography budget is not clear about licensing.",
                      owner: "external" as const,
                      askExternalParty: true,
                      suggestedQuestion:
                        "Does the photography budget include usage, or can licensing be separated?",
                    },
                    {
                      fieldKey: "treatmentExpectations",
                      label: "Treatment expectations",
                      reason:
                        "The expected treatment scope and timing affect whether Alex can proceed.",
                      owner: "external" as const,
                      askExternalParty: true,
                      suggestedQuestion:
                        "Could you send the deck and confirm what you need for the treatment?",
                    },
                  ]
                : []),
            ],
        risks: response
          ? []
          : [
              "The hold has been requested but has not been granted.",
              ...(newBalance
                ? [
                    "Category restrictions cannot be inferred from job history alone.",
                  ]
                : []),
            ],
        recommendations: response
          ? ["Accept the clarified usage into the job brief."]
          : [
              "Check the requested dates against existing commitments.",
              "Decide whether to explore the opportunity and offer the requested holds.",
              newBalance
                ? "Clarify licensing within the budget and treatment expectations."
                : "Clarify media, territory, and usage term.",
            ],
        suggestedNextWorkflowState: response
          ? "review_update"
          : "check_availability",
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
          : newBalance
            ? [
                {
                  label: "December 16, 2026",
                  start: "2026-12-16",
                  end: "2026-12-16",
                  relationship: "alternative",
                  confidence: 0.98,
                  evidence: {
                    quote: "ideally the 16th or 17th",
                    rationale:
                      "The dates are alternatives for a one-day shoot; the year is the obvious next December from the inquiry date.",
                  },
                },
                {
                  label: "December 17, 2026",
                  start: "2026-12-17",
                  end: "2026-12-17",
                  relationship: "alternative",
                  confidence: 0.98,
                  evidence: {
                    quote: "ideally the 16th or 17th",
                    rationale:
                      "The dates are alternatives for a one-day shoot; the year is the obvious next December from the inquiry date.",
                  },
                },
              ]
            : [
                {
                  label: "March 18–19, 2027",
                  start: "2027-03-18",
                  end: "2027-03-19",
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
          kind: response ? null : newBalance ? "second" : "first",
          dates: response
            ? []
            : adidas
              ? ["December 8", "December 9"]
              : newBalance
                ? ["December 16, 2026", "December 17, 2026"]
                : ["March 18–19, 2027"],
          evidence: response
            ? null
            : {
                quote: "first hold",
                rationale: "The producer requested a hold; it was not granted.",
              },
        },
        budgetRange: newBalance
          ? {
              minCents: 600000,
              maxCents: 800000,
              currency: "USD",
              includesUsage:
                response &&
                /usage (?:will be |is )?(?:separate|separated)/i.test(input)
                  ? false
                  : null,
              state: "proposed",
              confidence: 0.98,
              evidence: {
                quote: "$6–8k for photography",
                rationale:
                  "This is an indicative photography budget range, not an agreed creative fee.",
              },
            }
          : {
              minCents: null,
              maxCents: null,
              currency: "USD",
              includesUsage: null,
              state: "missing",
              confidence: 0,
              evidence: null,
            },
        jobTitle: extracted(
          adidas
            ? "Adidas Campaign"
            : newBalance
              ? "New Balance Campaign"
              : "Nike Spring Campaign",
        ),
        jobTitleSource: newBalance ? "generated" : "source_confirmed",
        jobType: extracted("commercial"),
        clientName: extracted(
          adidas ? "Adidas" : newBalance ? "New Balance" : "Nike",
        ),
        agencyName: extracted("Wieden+Kennedy"),
        producerName: extracted(
          adidas ? "Jamie" : newBalance ? "Sarah" : "Maya Chen",
        ),
        producerEmail:
          adidas || newBalance
            ? extracted(null)
            : extracted("maya@example.com"),
        shootStart:
          adidas || (newBalance && !response)
            ? extracted(null)
            : extracted(newBalance ? "2026-12-16" : "2027-03-18"),
        shootEnd:
          adidas || newBalance ? extracted(null) : extracted("2027-03-19"),
        dateOnly: true,
        location: extracted(
          newBalance ? "Manhattan or upstate New York" : "Brooklyn, NY",
        ),
        feeCents: newBalance
          ? extracted(null)
          : extracted(adidas ? 350000 : 850000),
        currency: extracted("USD"),
        usageTerms: response
          ? extracted(
              newBalance
                ? "US paid social, web, and retail, 12 months"
                : "Worldwide digital and social, 12 months",
            )
          : extracted(null),
        deliverables: extracted(
          newBalance
            ? "20–25 selects; basic retouching"
            : adidas
              ? "Approximately 15 finals"
              : "Campaign stills and select social crops",
        ),
        paymentTerms: adidas ? extracted(null) : extracted("Net 30"),
        bookingStatus: response ? extracted(null) : extracted("unbooked"),
        lifecycleStatus: response ? extracted(null) : extracted("inquiry"),
        relevantNotes: newBalance
          ? [
              "One-day shoot",
              "Paid social, web, and possible retail usage",
              ...(response && /treatment/i.test(input)
                ? [
                    "Treatment expectations were supplied in the producer response.",
                  ]
                : []),
            ]
          : [],
        operationalObligations:
          newBalance && response
            ? [
                {
                  key: "treatment_scope",
                  label: "Prepare a five-slide treatment",
                  owner: "creative",
                  status: "informational",
                  dueDate: "2026-11-23",
                  prerequisite: "Review the producer's promised deck",
                  evidence: {
                    quote: "five-slide treatment due November 23",
                    rationale:
                      "The response defines treatment scope and timing.",
                  },
                },
                {
                  key: "deck_arrival",
                  label: "Producer to send the creative deck",
                  owner: "external",
                  status: "promised",
                  dueDate: null,
                  prerequisite: null,
                  evidence: {
                    quote: "I'll send the deck",
                    rationale: "The deck is promised but not yet received.",
                  },
                },
                {
                  key: "treatment_deadline",
                  label:
                    "Decide whether to commit to the November 23 treatment deadline",
                  owner: "creative",
                  status: "needs_decision",
                  dueDate: "2026-11-23",
                  prerequisite: "Review the producer's promised deck",
                  evidence: {
                    quote: "due November 23",
                    rationale:
                      "Alex must decide whether the deadline is workable.",
                  },
                },
              ]
            : [],
        suggestedMatchTitle: response ? "Nike Spring Campaign" : null,
        suggestedMatchReason: response
          ? "The campaign title and producer match."
          : null,
      };
    } else if (purpose === "agent_next_step") {
      const state = JSON.parse(input) as {
        request: string;
        contextJobId?: string | null;
        operationKey: string;
        now: string;
        observations: Array<{
          toolName: string;
          output: Record<string, unknown>;
        }>;
      };
      const request = state.request.toLowerCase();
      const used = state.observations.map((item) => item.toolName);
      const latest = state.observations.at(-1)?.output;
      const search = state.observations.find(
        (item) => item.toolName === "search_business_records",
      )?.output as
        | {
            matches?: Array<{
              jobId: string;
              title: string;
              participants: Array<{ personId: string; name: string }>;
            }>;
          }
        | undefined;
      const jobMatch = search?.matches?.[0];
      const jobRead = state.observations.find(
        (item) => item.toolName === "read_job_state",
      )?.output as
        | {
            job?: { id: string; title: string };
            dependencies?: Array<{ key: string; objectiveId: string }>;
          }
        | undefined;
      const tool = (
        toolName: string,
        toolInput: Record<string, unknown>,
        rationaleSummary: string,
      ) => ({
        kind: "tool",
        toolName,
        input: toolInput,
        message: "",
        rationaleSummary,
      });
      const respond = (message: string) => ({
        kind: "respond",
        toolName: null,
        input: {},
        message,
        rationaleSummary: "Completed from executed tools.",
      });
      const clarify = (message: string) => ({
        kind: "clarify",
        toolName: null,
        input: {},
        message,
        rationaleSummary: "A material reference remains ambiguous.",
      });
      if (/which jobs need me|needs? my attention|what.*today/.test(request)) {
        fixture = !used.includes("read_workspace_attention")
          ? tool(
              "read_workspace_attention",
              {},
              "Check the canonical cross-job attention projection.",
            )
          : respond(
              `You have ${((latest?.attention as unknown[]) ?? []).length} item(s) needing attention this week. ${
                (
                  (latest?.attention as Array<{
                    jobTitle?: string;
                    title?: string;
                  }>) ?? []
                )
                  .slice(0, 4)
                  .map((item) => `${item.jobTitle}: ${item.title}`)
                  .join(" · ") ||
                "Nothing currently needs a decision or approval."
              }`,
            );
      } else if (/prepare invoices?/.test(request)) {
        fixture = !used.includes("prepare_ready_invoices")
          ? tool(
              "prepare_ready_invoices",
              {},
              "Prepare eligible drafts and report missing billing inputs.",
            )
          : respond(
              `Prepared ${((latest?.prepared as unknown[]) ?? []).length} invoice draft(s) for approval. ${((latest?.ineligible as Array<{ jobTitle: string; missing: string[] }>) ?? []).map((item) => `${item.jobTitle} is missing ${item.missing.join(", ")}.`).join(" ")} Nothing was issued or sent.`,
            );
      } else {
        if (!used.includes("search_business_records") && !state.contextJobId) {
          const query = /new balance/.test(request)
            ? "New Balance"
            : /nike/.test(request)
              ? "Nike"
              : /sarah/.test(request)
                ? "Sarah"
                : state.request;
          fixture = tool(
            "search_business_records",
            { query },
            "Resolve the referenced job and person.",
          );
        } else if (
          search &&
          new Set(search.matches?.map((match) => match.title)).size > 1 &&
          !/new balance|nike/.test(request)
        ) {
          fixture = clarify(
            `I found more than one plausible match: ${[...new Set(search.matches!.map((match) => match.title))].join(", ")}. Which job do you mean?`,
          );
        } else {
          const jobId = state.contextJobId ?? jobMatch?.jobId;
          if (!jobId)
            fixture = clarify(
              "I couldn’t identify a single job. Name the client, project, or producer and I’ll continue.",
            );
          else if (!used.includes("read_job_state"))
            fixture = tool(
              "read_job_state",
              { jobId },
              "Inspect canonical job state before acting.",
            );
          else if (
            /move|change|update/.test(request) &&
            /treatment deadline/.test(request)
          ) {
            fixture = clarify(
              "Is the new treatment deadline only an internal planning date, or has the producer agreed to change the external commitment?",
            );
          } else if (/treatment deadline/.test(request)) {
            if (!used.includes("record_treatment_commitment")) {
              const dependency = jobRead?.dependencies?.find(
                (item) => item.key === "treatment_deadline",
              );
              fixture = dependency
                ? tool(
                    "record_treatment_commitment",
                    {
                      objectiveId: dependency.objectiveId,
                      decision: /cannot|can't|unable/.test(request)
                        ? "cannot_commit"
                        : "commit_after_deck",
                      condition: /deck.*tomorrow|tomorrow.*deck/.test(request)
                        ? "the promised deck arrives tomorrow and can be reviewed"
                        : null,
                    },
                    "Record the explicit decision and prepare the approval-gated reply.",
                  )
                : clarify(
                    "This job has no recorded treatment deadline to update.",
                  );
            } else
              fixture = respond(
                `I recorded the conditional treatment commitment for ${jobRead?.job?.title ?? "the job"}${/tomorrow/.test(request) ? ", including that the deck must arrive tomorrow," : ""} and prepared a reply for approval. Nothing has been sent.`,
              );
          } else if (
            /paid social|creative deck|draft a follow-up|ask sarah/.test(
              request,
            )
          ) {
            const person =
              jobMatch?.participants?.find((item) =>
                /sarah/i.test(item.name),
              ) ?? jobMatch?.participants?.[0];
            if (!used.includes("inspect_job_evidence"))
              fixture = tool(
                "inspect_job_evidence",
                { jobId },
                "Check commercial certainty and source evidence before drafting.",
              );
            else if (!used.includes("prepare_producer_communication")) {
              const condition = /paid social/.test(request)
                ? "If the usage includes paid social, we’ll need to revisit the licensing fee."
                : null;
              const body = /paid social/.test(request)
                ? `Hi ${person?.name ?? "Sarah"},\n\nCould you confirm whether the New Balance usage includes paid social? ${condition}\n\nBest,\nAlex`
                : `Hi ${person?.name ?? "there"},\n\nI wanted to follow up on the creative deck. Could you let me know when we should expect it?\n\nBest,\nAlex`;
              fixture = person
                ? tool(
                    "prepare_producer_communication",
                    {
                      jobId,
                      personId: person.personId,
                      subject: /paid social/.test(request)
                        ? "New Balance usage clarification"
                        : "Creative deck follow-up",
                      body,
                      purpose: /paid social/.test(request)
                        ? "Clarify paid-social usage without treating proposed terms as agreed."
                        : "Follow up on the recorded creative-deck dependency.",
                      requiredConditionalText: condition,
                      idempotencyKey: `${state.operationKey}:communication`,
                    },
                    "Prepare a reviewable draft without external delivery.",
                  )
                : clarify(
                    "I found the job but not a single producer to address.",
                  );
            } else if (
              /remind|hasn't replied|has not replied/.test(request) &&
              !used.includes("create_conditional_follow_up")
            ) {
              const commObservation = state.observations.find(
                (item) => item.toolName === "prepare_producer_communication",
              )?.output as { communication?: { id: string } } | undefined;
              const now = new Date(state.now);
              const days = (5 - now.getUTCDay() + 7) % 7 || 7;
              const due = new Date(now);
              due.setUTCDate(now.getUTCDate() + days);
              due.setUTCHours(17, 0, 0, 0);
              fixture = tool(
                "create_conditional_follow_up",
                {
                  jobId,
                  personId: person?.personId ?? null,
                  communicationId: commObservation?.communication?.id ?? null,
                  dueAt: due.toISOString(),
                  expectedEvent: "Sarah’s reply about paid-social usage",
                  nextAction: "Remind me and review the licensing position.",
                  idempotencyKey: `${state.operationKey}:friday-follow-up`,
                },
                "Persist a record-scoped Friday follow-up.",
              );
            } else
              fixture = respond(
                `I checked ${jobRead?.job?.title ?? "the job"}, prepared the producer message for approval${/remind|hasn't replied|has not replied/.test(request) ? ", and created one Friday follow-up" : ""}. Nothing has been sent; until handoff is confirmed, the follow-up is waiting on approval rather than an external reply.`,
              );
          } else
            fixture = respond(
              `${jobRead?.job?.title ?? "The job"}: ${(latest?.situation as string) ?? "I checked its current state."}`,
            );
        }
      }
    } else if (purpose === "treatment_commitment_communication") {
      const parsed = JSON.parse(input) as {
        producer: { name: string | null } | null;
        immutableBusinessFacts: {
          requiredCommitmentSentence: string;
        };
        treatment: {
          decision: "commit_after_deck" | "need_deck_first" | "cannot_commit";
          dueDate: string | null;
          condition?: string | null;
        };
      };
      const name = parsed.producer?.name ?? "Sarah";
      const decision = parsed.treatment.decision;
      const requiredCommitmentSentence =
        parsed.immutableBusinessFacts.requiredCommitmentSentence;
      fixture = {
        subject: "New Balance treatment timing",
        body:
          decision === "commit_after_deck"
            ? `Hi ${name},\n\nThanks for the update. ${requiredCommitmentSentence} I have noted December 16 as the client-selected shoot date; this does not confirm the booking.\n\nBest,\nAlex`
            : decision === "need_deck_first"
              ? `Hi ${name},\n\nThanks for the update. ${requiredCommitmentSentence} I have noted December 16 as the client-selected shoot date; this does not confirm the booking.\n\nBest,\nAlex`
              : `Hi ${name},\n\nThanks for the update. ${requiredCommitmentSentence} I have noted December 16 as the client-selected shoot date; this does not confirm the booking.\n\nBest,\nAlex`,
        tone: "warm",
        questions: [],
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
    else if (purpose === "objective_communication") {
      const parsed = JSON.parse(input) as {
        job: { title: string };
        producer: { name: string } | null;
        decisions: {
          interest: "yes" | "maybe" | "no";
          categoryConflict: string | null;
          dates: Array<{
            label: string;
            decision: "offer" | "defer" | "decline";
            holdPriority: string | null;
          }>;
        };
        externalQuestions: Array<{
          fieldKey: string;
          question: string;
          whyItMatters: string;
        }>;
      };
      const name = parsed.producer?.name ?? "there";
      const offered = parsed.decisions.dates.filter(
        (date) => date.decision === "offer",
      );
      const conflictQualification =
        parsed.decisions.categoryConflict === "none_known"
          ? "I’m not aware of a category conflict, though I still need to confirm against any applicable agreements."
          : parsed.decisions.categoryConflict
            ? "I’m still reviewing potential category restrictions, so I can’t confirm clearance yet."
            : "";
      fixture = {
        subject: `${parsed.job.title} — availability and next steps`,
        body:
          parsed.decisions.interest === "no"
            ? `Hi ${name},\n\nThanks so much for thinking of me for ${parsed.job.title}. I’m going to pass this time, but I really appreciate you reaching out and hope we can find another opportunity to work together.\n\nBest,\nAlex`
            : `Hi ${name},\n\nThanks for thinking of me for ${parsed.job.title}. I’m ${parsed.decisions.interest === "yes" ? "interested in exploring it" : "interested depending on the final terms"}.${offered.length ? ` I can offer ${offered.map((date) => `a ${date.holdPriority ?? "requested"} hold on ${date.label}`).join(" and ")}.` : " I’m not able to commit either requested date yet."}${conflictQualification ? ` ${conflictQualification}` : ""}\n\n${parsed.externalQuestions.map((question) => question.question).join(" ")}\n\nBest,\nAlex`,
        tone: "warm",
        questions:
          parsed.decisions.interest === "no" ? [] : parsed.externalQuestions,
      };
    } else
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
