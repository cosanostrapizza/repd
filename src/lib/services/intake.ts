import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { db, id } from "@/db/client";
import {
  actions,
  aiRuns,
  communications,
  intakeReviews,
  jobFieldRevisions,
  jobFields,
  jobParticipants,
  jobs,
  organizations,
  people,
  questions,
  sources,
} from "@/db/schema";
import {
  getAIProvider,
  type AIProvider,
  AIProviderError,
} from "@/lib/ai/provider";
import {
  communicationDraftSchema,
  inquiryExtractionSchema,
  missingInformationSchema,
  type InquiryExtraction,
} from "@/lib/ai/schemas";
import {
  draftCommunicationInstructions,
  inquiryExtractionInstructions,
  missingInformationInstructions,
} from "@/lib/ai/prompts";
import { reevaluateWorkspace } from "@/lib/action-engine";
import { evaluateRequirements } from "./requirements";

const fieldLabels: Record<string, string> = {
  jobTitle: "Job title",
  jobType: "Job type",
  clientName: "Client",
  agencyName: "Agency",
  producerName: "Producer",
  producerEmail: "Producer email",
  shootStart: "Shoot start",
  shootEnd: "Shoot end",
  location: "Location",
  feeCents: "Creative fee",
  currency: "Currency",
  usageTerms: "Usage rights",
  deliverables: "Deliverables",
  paymentTerms: "Payment terms",
  bookingStatus: "Booking status",
  lifecycleStatus: "Lifecycle",
};
const scalarFieldKeys = Object.keys(fieldLabels) as Array<
  keyof InquiryExtraction
>;
export const hashContent = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function serialized<T>(value: T) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function runTracked<T>(args: {
  workspaceId: string;
  sourceId?: string;
  jobId?: string;
  purpose: string;
  input: string;
  instructions: string;
  schema: z.ZodType<T>;
  schemaName: string;
  provider: AIProvider;
}) {
  const runId = id("airun");
  const started = Date.now();
  await db.insert(aiRuns).values({
    id: runId,
    workspaceId: args.workspaceId,
    sourceId: args.sourceId,
    jobId: args.jobId,
    purpose: args.purpose,
    provider: args.provider.name,
    model: args.provider.model,
    schemaVersion: 1,
    inputHash: hashContent(args.input),
  });
  try {
    const result = await args.provider.runStructured<T>({
      purpose: args.purpose,
      input: args.input,
      instructions: args.instructions,
      schema: args.schema,
      schemaName: args.schemaName,
    });
    await db
      .update(aiRuns)
      .set({
        status: "succeeded",
        requestId: result.requestId,
        output: serialized(result.data),
        durationMs: result.durationMs,
        completedAt: new Date(),
      })
      .where(eq(aiRuns.id, runId));
    return result.data;
  } catch (error) {
    const providerError =
      error instanceof AIProviderError
        ? error
        : new AIProviderError(
            error instanceof Error ? error.message : "AI request failed",
          );
    await db
      .update(aiRuns)
      .set({
        status: "failed",
        errorCode: providerError.code,
        errorMessage: providerError.message,
        requestId: providerError.requestId,
        durationMs: Date.now() - started,
        completedAt: new Date(),
      })
      .where(eq(aiRuns.id, runId));
    throw providerError;
  }
}

export async function rewriteCommunication(args: {
  workspaceId: string;
  jobId: string;
  currentSubject: string;
  currentBody: string;
  tone: "warm" | "direct" | "concise";
  instruction?: string;
  provider?: AIProvider;
}) {
  const provider = args.provider ?? getAIProvider();
  return runTracked({
    workspaceId: args.workspaceId,
    jobId: args.jobId,
    purpose: "producer_email_revision",
    input: JSON.stringify({
      currentSubject: args.currentSubject,
      currentBody: args.currentBody,
      requestedTone: args.tone,
      instruction:
        args.instruction ?? "Improve clarity without adding new facts.",
    }),
    instructions: `${draftCommunicationInstructions}\nRevise the existing draft. Preserve its factual content and questions.`,
    schema: communicationDraftSchema,
    schemaName: "repd_producer_email_revision_v1",
    provider,
  });
}

function candidateScore(
  extraction: InquiryExtraction,
  job: typeof jobs.$inferSelect,
) {
  const needle =
    `${extraction.jobTitle.value ?? ""} ${extraction.clientName.value ?? ""}`.toLowerCase();
  const words = needle.split(/\W+/).filter((word) => word.length > 2);
  if (!words.length) return 0;
  const haystack = job.title.toLowerCase();
  return words.filter((word) => haystack.includes(word)).length / words.length;
}

export async function createAndAnalyzeIntake(args: {
  workspaceId: string;
  content: string;
  targetJobId?: string | null;
  kind?: "new_job" | "job_update" | "producer_response";
  provider?: AIProvider;
}) {
  const sourceId = id("source"),
    reviewId = id("review");
  await db.insert(sources).values({
    id: sourceId,
    workspaceId: args.workspaceId,
    jobId: args.targetJobId ?? null,
    type:
      args.kind === "producer_response" ? "producer_response" : "pasted_email",
    direction: "incoming",
    content: args.content,
    contentHash: hashContent(args.content),
    metadata: { immutable: true },
  });
  await db.insert(intakeReviews).values({
    id: reviewId,
    workspaceId: args.workspaceId,
    sourceId,
    targetJobId: args.targetJobId ?? null,
    kind: args.kind ?? (args.targetJobId ? "job_update" : "new_job"),
    status: "processing",
  });
  try {
    const provider = args.provider ?? getAIProvider();
    const currentJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.workspaceId, args.workspaceId))
      .orderBy(desc(jobs.updatedAt));
    const target = args.targetJobId
      ? currentJobs.find((job) => job.id === args.targetJobId)
      : null;
    const context = target
      ? `\nThis source is being reviewed against this existing job: ${JSON.stringify({ id: target.id, title: target.title, lifecycleStatus: target.lifecycleStatus, bookingStatus: target.bookingStatus, shootStart: target.shootStart, location: target.location, feeCents: target.feeCents, usageTerms: target.usageTerms })}`
      : `\nExisting job titles for cautious match suggestions: ${currentJobs.map((job) => job.title).join(" | ") || "none"}`;
    const extraction = await runTracked<InquiryExtraction>({
      workspaceId: args.workspaceId,
      sourceId,
      jobId: args.targetJobId ?? undefined,
      purpose: "inquiry_extraction",
      input: `${args.content}${context}`,
      instructions: inquiryExtractionInstructions,
      schema: inquiryExtractionSchema,
      schemaName: "repd_inquiry_extraction_v1",
      provider,
    });
    const candidates = currentJobs
      .map((job) => ({
        jobId: job.id,
        title: job.title,
        reason: "Title or client language overlaps the source.",
        confidence: candidateScore(extraction, job),
      }))
      .filter((candidate) => candidate.confidence >= 0.25)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
    await db
      .update(intakeReviews)
      .set({
        status: "ready",
        proposedData: serialized(extraction),
        matchCandidates: candidates,
        analysis: { summary: extraction.summary },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(intakeReviews.id, reviewId),
          eq(intakeReviews.workspaceId, args.workspaceId),
        ),
      );
  } catch (error) {
    await db
      .update(intakeReviews)
      .set({
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Analysis failed",
        updatedAt: new Date(),
      })
      .where(eq(intakeReviews.id, reviewId));
  }
  return reviewId;
}

export function extractionFields(extraction: InquiryExtraction) {
  return scalarFieldKeys
    .filter(
      (key) =>
        typeof extraction[key] === "object" &&
        extraction[key] !== null &&
        "state" in (extraction[key] as object),
    )
    .map((key) => ({
      key: String(key),
      label: fieldLabels[String(key)] ?? String(key),
      ...(extraction[key] as {
        value: unknown;
        state: string;
        confidence: number;
        evidence: { quote: string; rationale: string } | null;
      }),
    }));
}

async function upsertFieldRevision(args: {
  workspaceId: string;
  jobId: string;
  sourceId: string;
  key: string;
  value: unknown;
  state: "confirmed" | "proposed" | "unconfirmed" | "missing" | "conflicting";
  confidence: number;
  requirement?: ReturnType<typeof evaluateRequirements>[number];
}) {
  let [field] = await db
    .select()
    .from(jobFields)
    .where(and(eq(jobFields.jobId, args.jobId), eq(jobFields.key, args.key)))
    .limit(1);
  if (!field) {
    const fieldId = id("field");
    await db.insert(jobFields).values({
      id: fieldId,
      workspaceId: args.workspaceId,
      jobId: args.jobId,
      key: args.key,
      label: fieldLabels[args.key],
      requirementState: args.requirement?.state ?? "optional",
      requirementReason: args.requirement?.reason,
    });
    [field] = await db
      .select()
      .from(jobFields)
      .where(eq(jobFields.id, fieldId))
      .limit(1);
  }
  const revisionId = id("revision");
  await db.insert(jobFieldRevisions).values({
    id: revisionId,
    workspaceId: args.workspaceId,
    fieldId: field.id,
    sourceId: args.sourceId,
    value: args.value,
    informationState: args.state,
    confidence: Math.round(args.confidence * 100),
    reviewStatus: "accepted",
  });
  await db
    .update(jobFields)
    .set({
      acceptedRevisionId: revisionId,
      requirementState: args.requirement?.state ?? field.requirementState,
      requirementReason: args.requirement?.reason ?? field.requirementReason,
      updatedAt: new Date(),
    })
    .where(eq(jobFields.id, field.id));
}

export async function acceptIntakeReview(args: {
  workspaceId: string;
  userId: string;
  reviewId: string;
  targetJobId?: string | null;
  corrections?: Record<string, string>;
  rejectedKeys?: string[];
  provider?: AIProvider;
}) {
  const [review] = await db
    .select()
    .from(intakeReviews)
    .where(
      and(
        eq(intakeReviews.id, args.reviewId),
        eq(intakeReviews.workspaceId, args.workspaceId),
      ),
    )
    .limit(1);
  if (!review || review.status !== "ready" || !review.proposedData)
    throw new Error("This review is not ready to accept.");
  const extraction = inquiryExtractionSchema.parse(review.proposedData);
  const corrected = { ...extraction } as InquiryExtraction;
  for (const [key, value] of Object.entries(args.corrections ?? {}))
    if (
      value &&
      key in corrected &&
      typeof corrected[key as keyof InquiryExtraction] === "object"
    )
      (corrected[key as keyof InquiryExtraction] as { value: unknown }).value =
        key === "feeCents" ? Math.round(Number(value) * 100) : value;
  for (const key of args.rejectedKeys ?? [])
    if (
      key in corrected &&
      typeof corrected[key as keyof InquiryExtraction] === "object"
    )
      (corrected[key as keyof InquiryExtraction] as { value: unknown }).value =
        null;
  let jobId = args.targetJobId || review.targetJobId;
  const [currentJob] = jobId
    ? await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, args.workspaceId)))
        .limit(1)
    : [];
  if (jobId && !currentJob) throw new Error("Job not found in this workspace.");
  let organizationId: string | null = null;
  if (corrected.clientName.value) {
    const [existing] = await db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.workspaceId, args.workspaceId),
          eq(organizations.name, corrected.clientName.value),
        ),
      )
      .limit(1);
    organizationId = existing?.id ?? id("org");
    if (!existing)
      await db.insert(organizations).values({
        id: organizationId,
        workspaceId: args.workspaceId,
        name: corrected.clientName.value,
        kind: "brand",
      });
  } else organizationId = currentJob?.clientOrganizationId ?? null;
  const values = {
    title: corrected.jobTitle.value ?? currentJob?.title ?? "New inquiry",
    clientOrganizationId: organizationId,
    jobType:
      corrected.jobType.value ?? currentJob?.jobType ?? ("commercial" as const),
    lifecycleStatus:
      corrected.lifecycleStatus.value ??
      currentJob?.lifecycleStatus ??
      ("inquiry" as const),
    bookingStatus:
      corrected.bookingStatus.value ??
      currentJob?.bookingStatus ??
      ("unbooked" as const),
    shootStart: corrected.shootStart.value
      ? new Date(corrected.shootStart.value)
      : (currentJob?.shootStart ?? null),
    shootEnd: corrected.shootEnd.value
      ? new Date(corrected.shootEnd.value)
      : (currentJob?.shootEnd ?? null),
    location: corrected.location.value ?? currentJob?.location ?? null,
    feeCents: corrected.feeCents.value ?? currentJob?.feeCents ?? null,
    currency: corrected.currency.value ?? currentJob?.currency ?? "USD",
    usageTerms: corrected.usageTerms.value ?? currentJob?.usageTerms ?? null,
    deliverables:
      corrected.deliverables.value ?? currentJob?.deliverables ?? null,
    paymentTerms:
      corrected.paymentTerms.value ?? currentJob?.paymentTerms ?? null,
    updatedAt: new Date(),
  };
  if (!jobId) {
    jobId = id("job");
    await db
      .insert(jobs)
      .values({ id: jobId, workspaceId: args.workspaceId, ...values });
  } else {
    await db
      .update(jobs)
      .set(values)
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, args.workspaceId)));
  }
  await db
    .update(sources)
    .set({ jobId })
    .where(
      and(
        eq(sources.id, review.sourceId),
        eq(sources.workspaceId, args.workspaceId),
      ),
    );
  const requirements = evaluateRequirements({
    ...values,
    lifecycleStatus: values.lifecycleStatus,
    jobType: values.jobType,
  });
  for (const field of extractionFields(corrected))
    if (field.value !== null)
      await upsertFieldRevision({
        workspaceId: args.workspaceId,
        jobId,
        sourceId: review.sourceId,
        key: field.key,
        value: field.value,
        state: field.state as "proposed" | "unconfirmed" | "missing",
        confidence: field.confidence,
        requirement: requirements.find((req) => req.fieldKey === field.key),
      });
  let producerId: string | null = null;
  if (corrected.producerName.value || corrected.producerEmail.value) {
    const email = corrected.producerEmail.value?.toLowerCase() ?? null;
    const [person] = email
      ? await db
          .select()
          .from(people)
          .where(
            and(
              eq(people.workspaceId, args.workspaceId),
              eq(people.email, email),
            ),
          )
          .limit(1)
      : [];
    if (!person) {
      producerId = id("person");
      await db.insert(people).values({
        id: producerId,
        workspaceId: args.workspaceId,
        name: corrected.producerName.value ?? email ?? "Producer",
        email,
      });
    } else producerId = person.id;
    const [participant] = await db
      .select()
      .from(jobParticipants)
      .where(
        and(
          eq(jobParticipants.jobId, jobId),
          eq(jobParticipants.personId, producerId),
        ),
      )
      .limit(1);
    if (!participant)
      await db.insert(jobParticipants).values({
        id: id("participant"),
        workspaceId: args.workspaceId,
        jobId,
        personId: producerId,
        role: "Producer",
        displayNameSnapshot:
          corrected.producerName.value ?? person?.name ?? "Producer",
      });
  }
  await db
    .update(intakeReviews)
    .set({
      status: "accepted",
      targetJobId: jobId,
      proposedData: serialized(corrected),
      updatedAt: new Date(),
    })
    .where(eq(intakeReviews.id, review.id));
  if (review.kind === "producer_response") {
    for (const field of extractionFields(corrected).filter(
      (item) => item.value !== null,
    ))
      await db
        .update(questions)
        .set({
          status: "answered",
          answeredAt: new Date(),
          sourceId: review.sourceId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(questions.workspaceId, args.workspaceId),
            eq(questions.jobId, jobId),
            eq(questions.fieldKey, field.key),
            eq(questions.status, "asked"),
          ),
        );
  }
  await prepareCoordination({
    workspaceId: args.workspaceId,
    jobId,
    sourceId: review.sourceId,
    producerId,
    provider: args.provider,
  });
  await reevaluateWorkspace(args.workspaceId);
  return jobId;
}

export async function prepareCoordination(args: {
  workspaceId: string;
  jobId: string;
  sourceId?: string;
  producerId?: string | null;
  provider?: AIProvider;
}) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, args.jobId), eq(jobs.workspaceId, args.workspaceId)))
    .limit(1);
  if (!job) return;
  const deterministic = evaluateRequirements(job).filter(
    (item) =>
      item.state === "required_now" &&
      item.askExternalParty &&
      !(job as Record<string, unknown>)[item.fieldKey],
  );
  if (!deterministic.length) return;
  try {
    const provider = args.provider ?? getAIProvider();
    const analysis = await runTracked({
      workspaceId: args.workspaceId,
      sourceId: args.sourceId,
      jobId: job.id,
      purpose: "missing_information_analysis",
      input: JSON.stringify({ job, deterministicRequirements: deterministic }),
      instructions: missingInformationInstructions,
      schema: missingInformationSchema,
      schemaName: "repd_missing_information_v1",
      provider,
    });
    const actionable = analysis.items.filter(
      (item) =>
        item.requirement === "required_now" &&
        item.askExternalParty &&
        item.suggestedQuestion,
    );
    if (!actionable.length) return;
    const producer = args.producerId
      ? (
          await db
            .select()
            .from(people)
            .where(
              and(
                eq(people.id, args.producerId),
                eq(people.workspaceId, args.workspaceId),
              ),
            )
            .limit(1)
        )[0]
      : (
          await db
            .select({ person: people })
            .from(jobParticipants)
            .innerJoin(people, eq(jobParticipants.personId, people.id))
            .where(
              and(
                eq(jobParticipants.jobId, job.id),
                eq(jobParticipants.workspaceId, args.workspaceId),
                eq(jobParticipants.role, "Producer"),
              ),
            )
            .limit(1)
        )[0]?.person;
    const draft = await runTracked({
      workspaceId: args.workspaceId,
      sourceId: args.sourceId,
      jobId: job.id,
      purpose: "producer_email_draft",
      input: JSON.stringify({
        job: {
          title: job.title,
          client: job.clientOrganizationId,
          shootStart: job.shootStart,
          feeCents: job.feeCents,
        },
        recipient: producer
          ? { name: producer.name, email: producer.email }
          : null,
        questions: actionable,
      }),
      instructions: draftCommunicationInstructions,
      schema: communicationDraftSchema,
      schemaName: "repd_producer_email_v1",
      provider,
    });
    const questionIds: string[] = [];
    for (const item of actionable) {
      const questionId = id("question");
      questionIds.push(questionId);
      await db.insert(questions).values({
        id: questionId,
        workspaceId: args.workspaceId,
        jobId: job.id,
        fieldKey: item.fieldKey,
        question: item.suggestedQuestion!,
        whyItMatters: item.reason,
        recipientPersonId: producer?.id ?? null,
      });
    }
    const actionId = id("act"),
      communicationId = id("communication");
    const deduplicationKey = `producer-coordination:${job.id}:${actionable
      .map((item) => item.fieldKey)
      .sort()
      .join(",")}`;
    const [existing] = await db
      .select()
      .from(actions)
      .where(
        and(
          eq(actions.workspaceId, args.workspaceId),
          eq(actions.deduplicationKey, deduplicationKey),
        ),
      )
      .limit(1);
    if (existing) return;
    await db.insert(actions).values({
      id: actionId,
      workspaceId: args.workspaceId,
      jobId: job.id,
      personId: producer?.id ?? null,
      kind: "producer_coordination",
      title: `Review note to ${producer?.name ?? "the producer"}`,
      explanation:
        actionable.map((item) => item.label).join(" and ") +
        " need clarification before the job can move forward.",
      recommendation: analysis.recommendedNextStep,
      priority: "blocking",
      status: "pending_approval",
      requiresApproval: true,
      executionStatus: "not_requested",
      deduplicationKey,
      idempotencyKey: `communication:${communicationId}`,
      payload: {
        communicationId,
        questionIds,
        fieldKeys: actionable.map((item) => item.fieldKey),
        assessment: analysis.assessment,
      },
      resolutionCondition: { type: "questions_answered", questionIds },
      preparedContent: draft.body,
      reevaluatedAt: new Date(),
    });
    await db.insert(communications).values({
      id: communicationId,
      workspaceId: args.workspaceId,
      jobId: job.id,
      actionId,
      recipientPersonId: producer?.id ?? null,
      toEmail: producer?.email ?? null,
      subject: draft.subject,
      body: draft.body,
    });
  } catch {
    /* Intake remains accepted even when optional coordination preparation fails. The failed AI run is durable. */
  }
}
