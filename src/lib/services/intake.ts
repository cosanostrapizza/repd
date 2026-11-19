import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { db, id } from "@/db/client";
import {
  actions,
  actionEvents,
  activities,
  affiliations,
  aiRuns,
  communications,
  coordinationDateOptions,
  coordinationDependencies,
  coordinationObjectives,
  holds,
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
import { calendarDate, calendarDateRange } from "@/lib/calendar-date";
import {
  communicationPreservesTreatmentDecision,
  resolveTreatmentPreparationInput,
  treatmentCommitmentSentence,
} from "@/lib/communication-constraints";
import { resolveRelativeBusinessDate } from "@/lib/temporal-context";
import { reconcileDateOptionHoldState } from "@/lib/workspace-state-rules";
import {
  classifyPreparationFailure,
  PreparationArtifactValidationError,
  runWithBoundedAutomaticRetry,
} from "@/lib/preparation-retry";
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
  requestedDates: "Requested dates",
  holdRequest: "Hold request",
  producerRequests: "Producer requests",
  budgetRange: "Indicative budget",
  operationalObligations: "Operational obligations",
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
  const contentHash = hashContent(args.content);
  const [duplicate] = await db
    .select({ review: intakeReviews })
    .from(sources)
    .innerJoin(intakeReviews, eq(intakeReviews.sourceId, sources.id))
    .where(
      and(
        eq(sources.workspaceId, args.workspaceId),
        eq(sources.contentHash, contentHash),
        eq(intakeReviews.workspaceId, args.workspaceId),
      ),
    )
    .orderBy(desc(intakeReviews.createdAt))
    .limit(1);
  if (
    duplicate &&
    duplicate.review.kind ===
      (args.kind ?? (args.targetJobId ? "job_update" : "new_job")) &&
    (!args.targetJobId || duplicate.review.targetJobId === args.targetJobId)
  )
    return duplicate.review.id;
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
    contentHash,
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
    const sourceContext = `\nSource context: captured ${new Date().toISOString()}; user timezone America/New_York.`;
    const context = target
      ? `\nThis source is being reviewed against this existing job: ${JSON.stringify({ id: target.id, title: target.title, lifecycleStatus: target.lifecycleStatus, bookingStatus: target.bookingStatus, shootStart: target.shootStart, location: target.location, feeCents: target.feeCents, usageTerms: target.usageTerms })}`
      : `\nExisting job titles for cautious match suggestions: ${currentJobs.map((job) => job.title).join(" | ") || "none"}`;
    const extraction = await runTracked<InquiryExtraction>({
      workspaceId: args.workspaceId,
      sourceId,
      jobId: args.targetJobId ?? undefined,
      purpose: "inquiry_extraction",
      input: `${args.content}${sourceContext}${context}`,
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
        analysis: {
          summary: extraction.summary,
          assessment: extraction.assessment,
          producerRequests: extraction.producerRequests,
          missingInformation: extraction.missingInformation,
          risks: extraction.risks,
          recommendations: extraction.recommendations,
          suggestedNextWorkflowState: extraction.suggestedNextWorkflowState,
        },
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
        "state" in (extraction[key] as object) &&
        "value" in (extraction[key] as object),
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
  if (
    corrected.holdRequest.requested &&
    ["first_hold", "second_hold"].includes(corrected.bookingStatus.value ?? "")
  ) {
    corrected.bookingStatus.value = "unbooked";
    corrected.bookingStatus.state = "unconfirmed";
  }
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
    titleSource:
      corrected.jobTitle.value != null
        ? corrected.jobTitleSource
        : (currentJob?.titleSource ?? ("manual" as const)),
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
    shootDate:
      corrected.dateOnly && corrected.shootStart.value
        ? calendarDate(corrected.shootStart.value)
        : (currentJob?.shootDate ?? null),
    shootStart:
      corrected.shootStart.value && !corrected.dateOnly
        ? new Date(corrected.shootStart.value)
        : corrected.dateOnly && corrected.shootStart.value
          ? null
          : (currentJob?.shootStart ?? null),
    shootEnd:
      corrected.shootEnd.value && !corrected.dateOnly
        ? new Date(corrected.shootEnd.value)
        : corrected.dateOnly && corrected.shootStart.value
          ? null
          : (currentJob?.shootEnd ?? null),
    location: corrected.location.value ?? currentJob?.location ?? null,
    feeCents: corrected.feeCents.value ?? currentJob?.feeCents ?? null,
    proposedBudgetMinCents:
      corrected.budgetRange.minCents ??
      currentJob?.proposedBudgetMinCents ??
      null,
    proposedBudgetMaxCents:
      corrected.budgetRange.maxCents ??
      currentJob?.proposedBudgetMaxCents ??
      null,
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
    requestedDateCount: corrected.requestedDates.length,
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
  if (corrected.requestedDates.length)
    await upsertFieldRevision({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      key: "requestedDates",
      value: corrected.requestedDates,
      state: "unconfirmed",
      confidence: Math.min(
        ...corrected.requestedDates.map((date) => date.confidence),
      ),
    });
  if (corrected.holdRequest.requested)
    await upsertFieldRevision({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      key: "holdRequest",
      value: corrected.holdRequest,
      state: "unconfirmed",
      confidence: corrected.holdRequest.evidence ? 0.95 : 0.7,
    });
  if (corrected.producerRequests.length)
    await upsertFieldRevision({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      key: "producerRequests",
      value: corrected.producerRequests,
      state: "unconfirmed",
      confidence: 0.9,
    });
  if (corrected.operationalObligations.length)
    await upsertFieldRevision({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      key: "operationalObligations",
      value: corrected.operationalObligations,
      state: "unconfirmed",
      confidence: 0.95,
    });
  if (corrected.budgetRange.minCents != null)
    await upsertFieldRevision({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      key: "budgetRange",
      value: corrected.budgetRange,
      state: corrected.budgetRange.state,
      confidence: corrected.budgetRange.confidence,
    });
  let producerId: string | null = null;
  if (corrected.producerName.value || corrected.producerEmail.value) {
    const email = corrected.producerEmail.value?.toLowerCase() ?? null;
    const [personByEmail] = email
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
    const sameJobProducers = !personByEmail
      ? await db
          .select({ person: people, participant: jobParticipants })
          .from(jobParticipants)
          .innerJoin(people, eq(jobParticipants.personId, people.id))
          .where(
            and(
              eq(jobParticipants.workspaceId, args.workspaceId),
              eq(jobParticipants.jobId, jobId),
              eq(jobParticipants.role, "Producer"),
            ),
          )
      : [];
    const normalizedName = corrected.producerName.value
      ?.trim()
      .toLocaleLowerCase();
    const nameMatches = normalizedName
      ? sameJobProducers.filter(
          ({ person: candidate }) =>
            candidate.name.trim().toLocaleLowerCase() === normalizedName,
        )
      : [];
    const person =
      personByEmail ??
      (nameMatches.length === 1 ? nameMatches[0].person : undefined);
    if (!person) {
      producerId = id("person");
      await db.insert(people).values({
        id: producerId,
        workspaceId: args.workspaceId,
        name: corrected.producerName.value ?? email ?? "Producer",
        email,
      });
    } else {
      producerId = person.id;
      if (email && !person.email)
        await db
          .update(people)
          .set({ email, updatedAt: new Date() })
          .where(eq(people.id, person.id));
    }
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
    if (corrected.agencyName.value && producerId) {
      const [existingAgency] = await db
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.workspaceId, args.workspaceId),
            eq(organizations.name, corrected.agencyName.value),
          ),
        )
        .limit(1);
      const agencyId = existingAgency?.id ?? id("org");
      if (!existingAgency)
        await db.insert(organizations).values({
          id: agencyId,
          workspaceId: args.workspaceId,
          name: corrected.agencyName.value,
          kind: "agency",
        });
      const [agencyParticipant] = await db
        .select()
        .from(jobParticipants)
        .where(
          and(
            eq(jobParticipants.jobId, jobId),
            eq(jobParticipants.organizationId, agencyId),
          ),
        )
        .limit(1);
      if (!agencyParticipant)
        await db.insert(jobParticipants).values({
          id: id("participant"),
          workspaceId: args.workspaceId,
          jobId,
          organizationId: agencyId,
          role: "Agency",
          displayNameSnapshot: corrected.agencyName.value,
        });
      await db
        .update(jobParticipants)
        .set({ organizationId: agencyId, updatedAt: new Date() })
        .where(
          and(
            eq(jobParticipants.jobId, jobId),
            eq(jobParticipants.personId, producerId),
          ),
        );
      const [existingAffiliation] = await db
        .select()
        .from(affiliations)
        .where(
          and(
            eq(affiliations.workspaceId, args.workspaceId),
            eq(affiliations.personId, producerId),
            eq(affiliations.organizationId, agencyId),
          ),
        )
        .limit(1);
      if (!existingAffiliation)
        await db.insert(affiliations).values({
          id: id("aff"),
          workspaceId: args.workspaceId,
          personId: producerId,
          organizationId: agencyId,
          title: "Producer",
          isPrimary: true,
        });
    }
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
  await db.insert(activities).values({
    id: id("activity"),
    workspaceId: args.workspaceId,
    jobId,
    actorUserId: args.userId,
    type:
      review.kind === "producer_response"
        ? "producer_response_accepted"
        : currentJob
          ? "source_update_accepted"
          : "inquiry_accepted",
    summary:
      review.kind === "producer_response"
        ? `Accepted a producer update: ${corrected.summary}`
        : currentJob
          ? `Updated the brief from a source: ${corrected.summary}`
          : `Created the opportunity brief: ${corrected.summary}`,
    metadata: {
      reviewId: review.id,
      sourceId: review.sourceId,
      suggestedNextWorkflowState: corrected.suggestedNextWorkflowState,
    },
  });
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
    await reconcileAdvanceInquiryObjective({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      extraction: corrected,
    });
  }
  if (review.kind !== "producer_response") {
    await createAdvanceInquiryObjective({
      workspaceId: args.workspaceId,
      jobId,
      sourceId: review.sourceId,
      producerId,
      extraction: corrected,
    });
  }
  await reevaluateWorkspace(args.workspaceId);
  return jobId;
}

function inferDateOption(
  option: InquiryExtraction["requestedDates"][number],
  capturedAt: Date,
) {
  if (option.start) {
    const startsOn = calendarDate(option.start);
    const endsOn = calendarDate(option.end) ?? startsOn;
    const range = startsOn ? calendarDateRange(startsOn) : null;
    return {
      startsOn,
      endsOn,
      startsAt: range?.startsAt ?? null,
      endsAt: range?.endsAt ?? null,
    };
  }
  if (option.relationship === "range")
    return { startsOn: null, endsOn: null, startsAt: null, endsAt: null };
  const months: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };
  const match = option.label
    .toLowerCase()
    .match(
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(\d{4}))?/,
    );
  if (!match) return { startsAt: null, endsAt: null };
  const month = months[match[1]];
  const day = Number(match[2]);
  let year = match[3] ? Number(match[3]) : capturedAt.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, day, 14));
  if (!match[3] && candidate.getTime() < capturedAt.getTime() - 30 * 86400000)
    year += 1;
  const startsAt = new Date(Date.UTC(year, month, day, 14));
  return {
    startsOn: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    endsOn: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 10 * 60 * 60 * 1000),
  };
}

function dateMentionKey(value: string) {
  const iso = calendarDate(value);
  if (iso) return iso.slice(5);
  const match = value
    .toLocaleLowerCase()
    .match(
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/,
    );
  if (!match) return null;
  const month = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(match[1]);
  return `${String(month + 1).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

async function insertDependency(args: {
  workspaceId: string;
  objectiveId: string;
  key: string;
  label: string;
  owner: "repd" | "creative" | "external";
  status:
    | "verified"
    | "no_record_found"
    | "not_checked"
    | "unable_to_check"
    | "needs_decision"
    | "needs_external"
    | "resolved"
    | "not_applicable";
  result: string;
  value?: unknown;
  evidence?: Record<string, unknown>;
  resolutionSource?: "records" | "user" | "external" | "system";
}) {
  const [existing] = await db
    .select()
    .from(coordinationDependencies)
    .where(
      and(
        eq(coordinationDependencies.objectiveId, args.objectiveId),
        eq(coordinationDependencies.key, args.key),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(coordinationDependencies)
      .set({
        label: args.label,
        owner: args.owner,
        status: args.status,
        result: args.result,
        value: args.value,
        evidence: args.evidence,
        resolutionSource: args.resolutionSource,
        resolvedAt: args.status === "resolved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(coordinationDependencies.id, existing.id));
    return { ...existing, ...args };
  }
  const dependency = {
    id: id("dep"),
    workspaceId: args.workspaceId,
    objectiveId: args.objectiveId,
    key: args.key,
    label: args.label,
    owner: args.owner,
    status: args.status,
    result: args.result,
    value: args.value,
    evidence: args.evidence,
    resolutionSource: args.resolutionSource,
  };
  await db.insert(coordinationDependencies).values(dependency);
  return dependency;
}

export async function createAdvanceInquiryObjective(args: {
  workspaceId: string;
  jobId: string;
  sourceId: string;
  producerId: string | null;
  extraction: InquiryExtraction;
}) {
  const [existing] = await db
    .select()
    .from(coordinationObjectives)
    .where(
      and(
        eq(coordinationObjectives.workspaceId, args.workspaceId),
        eq(coordinationObjectives.jobId, args.jobId),
        eq(coordinationObjectives.kind, "advance_inquiry"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [source, job] = await Promise.all([
    db
      .select()
      .from(sources)
      .where(
        and(
          eq(sources.id, args.sourceId),
          eq(sources.workspaceId, args.workspaceId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.id, args.jobId), eq(jobs.workspaceId, args.workspaceId)),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!job || !source) throw new Error("Accepted inquiry context is missing.");
  const objectiveId = id("objective");
  await db.insert(coordinationObjectives).values({
    id: objectiveId,
    workspaceId: args.workspaceId,
    jobId: args.jobId,
    sourceId: args.sourceId,
    kind: "advance_inquiry",
    title: `Advance ${job.title} opportunity`,
    outcome:
      "Reach a truthful booking decision and prepare the right producer response.",
    summary: args.extraction.summary,
    state: "awaiting_decisions",
    nextAction: "Review Repd’s checks, then decide interest and hold handling.",
    completedSteps: [
      "Understood the inquiry",
      "Preserved proposed terms and source evidence",
      "Checked records available inside Repd",
    ],
    evidence: { sourceId: args.sourceId },
  });

  const allHolds = await db
    .select({ hold: holds, job: jobs })
    .from(holds)
    .innerJoin(jobs, eq(holds.jobId, jobs.id))
    .where(
      and(
        eq(holds.workspaceId, args.workspaceId),
        eq(holds.status, "active"),
        ne(holds.jobId, args.jobId),
      ),
    );
  for (const option of args.extraction.requestedDates) {
    const { startsOn, endsOn, startsAt, endsAt } = inferDateOption(
      option,
      source.capturedAt,
    );
    const optionId = id("date");
    const requested =
      args.extraction.holdRequest.requested &&
      (args.extraction.holdRequest.dates.length === 0 ||
        args.extraction.holdRequest.dates.some((label) =>
          /\b(all|both|each)\b/i.test(label),
        ) ||
        args.extraction.holdRequest.dates.some(
          (label) =>
            dateMentionKey(label) ===
            dateMentionKey(option.start ?? option.label),
        ));
    await db.insert(coordinationDateOptions).values({
      id: optionId,
      workspaceId: args.workspaceId,
      objectiveId,
      jobId: args.jobId,
      sourceId: args.sourceId,
      label: option.label,
      startsAt,
      endsAt,
      startsOn,
      endsOn,
      relationship: option.relationship,
      tentative: true,
      holdRequested: requested,
      holdPriority: requested ? args.extraction.holdRequest.kind : null,
      holdState: requested ? "requested" : "not_requested",
      evidence: option.evidence ?? undefined,
    });
    const conflicts =
      startsAt && endsAt
        ? allHolds.filter(
            ({ hold }) => startsAt < hold.endsAt && endsAt > hold.startsAt,
          )
        : [];
    await insertDependency({
      workspaceId: args.workspaceId,
      objectiveId,
      key: `availability:${optionId}`,
      label: `Availability for ${option.label}`,
      owner: "repd",
      status: !startsAt
        ? "unable_to_check"
        : conflicts.length
          ? "verified"
          : "verified",
      result: !startsAt
        ? "The date wording is preserved, but Repd could not resolve a safe calendar date."
        : conflicts.length
          ? `Conflicts with ${conflicts.map(({ job: conflictJob }) => conflictJob.title).join(", ")} in Repd.`
          : "No conflict with bookings or holds recorded in Repd. External calendars were not checked.",
      value: { optionId, conflictJobIds: conflicts.map(({ job }) => job.id) },
      evidence: {
        checked: ["Repd jobs", "Repd holds"],
        externalCalendar: false,
      },
      resolutionSource: "records",
    });
  }

  await insertDependency({
    workspaceId: args.workspaceId,
    objectiveId,
    key: "interest",
    label: "Creative interest",
    owner: "creative",
    status: "needs_decision",
    result: "Alex has not decided whether to explore the opportunity.",
  });
  if (args.extraction.holdRequest.requested)
    await insertDependency({
      workspaceId: args.workspaceId,
      objectiveId,
      key: "hold_decisions",
      label: "Requested holds",
      owner: "creative",
      status: "needs_decision",
      result: "The producer requested holds; none have been granted.",
    });

  const clientHistory = job.clientOrganizationId
    ? await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.workspaceId, args.workspaceId),
            eq(jobs.clientOrganizationId, job.clientOrganizationId),
            ne(jobs.id, job.id),
          ),
        )
    : [];
  await insertDependency({
    workspaceId: args.workspaceId,
    objectiveId,
    key: "client_history",
    label: "Relevant client history",
    owner: "repd",
    status: clientHistory.length ? "verified" : "no_record_found",
    result: clientHistory.length
      ? `Repd found ${clientHistory.length} previous ${clientHistory.length === 1 ? "job" : "jobs"} for this client: ${clientHistory.map((item) => item.title).join(", ")}.`
      : "No previous job for this client was found in Repd. This does not prove there is no prior work.",
    value: { jobIds: clientHistory.map((item) => item.id) },
    resolutionSource: "records",
  });
  const conflictRequest = [
    ...args.extraction.producerRequests,
    ...args.extraction.relevantNotes,
  ].some((value) => /conflict|exclusiv|categor/i.test(value));
  if (conflictRequest)
    await insertDependency({
      workspaceId: args.workspaceId,
      objectiveId,
      key: "category_conflicts",
      label: "Category conflicts",
      owner: "creative",
      status: "needs_decision",
      result:
        "Repd checked recorded job history, but no contract repository or external files are connected. Alex must confirm any restriction or uncertainty.",
      evidence: {
        contractIntegration: false,
        clientHistoryCount: clientHistory.length,
      },
    });
  for (const item of args.extraction.missingInformation.filter(
    (candidate) =>
      candidate.owner === "external" && candidate.suggestedQuestion,
  ))
    await insertDependency({
      workspaceId: args.workspaceId,
      objectiveId,
      key: item.fieldKey,
      label: item.label,
      owner: "external",
      status: "needs_external",
      result: item.reason,
      value: { suggestedQuestion: item.suggestedQuestion },
    });

  const actionId = id("act");
  await db.insert(actions).values({
    id: actionId,
    workspaceId: args.workspaceId,
    jobId: args.jobId,
    objectiveId,
    personId: args.producerId,
    kind: "advance_inquiry",
    title: `Decide how to advance ${job.title}`,
    explanation:
      "Repd completed the internal checks available from its records. A few creative decisions are needed before a producer reply can be prepared.",
    recommendation:
      "Review the checks and make the grouped opportunity decision.",
    priority: "blocking",
    deduplicationKey: `advance-inquiry:${args.jobId}`,
    payload: { objectiveId, sourceId: args.sourceId },
    resolutionCondition: { type: "objective_completed" },
    requiresApproval: false,
    reevaluatedAt: new Date(),
  });
  return objectiveId;
}

export async function recordAdvanceInquiryDecisions(args: {
  workspaceId: string;
  userId: string;
  objectiveId: string;
  interest: "yes" | "maybe" | "no";
  categoryConflict?: "none_known" | "possible" | "unsure";
  dateDecisions: Record<string, "offer" | "defer" | "decline">;
  provider?: AIProvider;
}) {
  const [objective] = await db
    .select()
    .from(coordinationObjectives)
    .where(
      and(
        eq(coordinationObjectives.id, args.objectiveId),
        eq(coordinationObjectives.workspaceId, args.workspaceId),
      ),
    )
    .limit(1);
  if (!objective) throw new Error("Coordination objective not found.");
  const [job, dateOptions, dependencies, decisionAction, producer] =
    await Promise.all([
      db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, objective.jobId),
            eq(jobs.workspaceId, args.workspaceId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select()
        .from(coordinationDateOptions)
        .where(
          and(
            eq(coordinationDateOptions.objectiveId, objective.id),
            eq(coordinationDateOptions.workspaceId, args.workspaceId),
          ),
        ),
      db
        .select()
        .from(coordinationDependencies)
        .where(
          and(
            eq(coordinationDependencies.objectiveId, objective.id),
            eq(coordinationDependencies.workspaceId, args.workspaceId),
          ),
        ),
      db
        .select()
        .from(actions)
        .where(
          and(
            eq(actions.workspaceId, args.workspaceId),
            eq(actions.deduplicationKey, `advance-inquiry:${objective.jobId}`),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({ person: people })
        .from(jobParticipants)
        .innerJoin(people, eq(jobParticipants.personId, people.id))
        .where(
          and(
            eq(jobParticipants.workspaceId, args.workspaceId),
            eq(jobParticipants.jobId, objective.jobId),
            eq(jobParticipants.role, "Producer"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]?.person),
    ]);
  if (!job || !decisionAction)
    throw new Error("Objective records are incomplete.");
  const now = new Date();
  await db
    .update(coordinationDependencies)
    .set({
      status: "resolved",
      result:
        args.interest === "yes"
          ? "Alex wants to explore the opportunity."
          : args.interest === "maybe"
            ? "Alex may be interested depending on the unresolved terms."
            : "Alex decided to decline the opportunity.",
      value: args.interest,
      resolutionSource: "user",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(coordinationDependencies.objectiveId, objective.id),
        eq(coordinationDependencies.key, "interest"),
      ),
    );
  if (args.categoryConflict)
    await db
      .update(coordinationDependencies)
      .set({
        status: "resolved",
        result:
          args.categoryConflict === "none_known"
            ? "Alex reported no known category conflict; Repd did not independently verify contracts."
            : args.categoryConflict === "possible"
              ? "Alex identified a possible category conflict that must remain qualified in the reply."
              : "Alex is unsure about category restrictions; the reply must avoid a definitive assurance.",
        value: args.categoryConflict,
        resolutionSource: "user",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(coordinationDependencies.objectiveId, objective.id),
          eq(coordinationDependencies.key, "category_conflicts"),
        ),
      );
  let grantedCount = 0;
  for (const option of dateOptions) {
    const decision = args.dateDecisions[option.id] ?? "defer";
    let holdState = option.holdState;
    if (
      decision === "offer" &&
      option.holdRequested &&
      option.startsAt &&
      option.endsAt
    ) {
      const [existingHold] = await db
        .select()
        .from(holds)
        .where(
          and(
            eq(holds.workspaceId, args.workspaceId),
            eq(holds.jobId, job.id),
            eq(holds.status, "active"),
            eq(holds.startsAt, option.startsAt),
            eq(holds.endsAt, option.endsAt),
          ),
        )
        .limit(1);
      if (!existingHold)
        await db.insert(holds).values({
          id: id("hold"),
          workspaceId: args.workspaceId,
          jobId: job.id,
          kind:
            option.holdPriority === "first"
              ? "first"
              : option.holdPriority === "second"
                ? "second"
                : "second",
          startsAt: option.startsAt,
          endsAt: option.endsAt,
        });
      holdState = "granted";
      grantedCount += 1;
    } else if (decision === "decline") holdState = "declined";
    await db
      .update(coordinationDateOptions)
      .set({ decision, holdState, updatedAt: now })
      .where(eq(coordinationDateOptions.id, option.id));
  }
  if (dependencies.some((item) => item.key === "hold_decisions"))
    await db
      .update(coordinationDependencies)
      .set({
        status: "resolved",
        result: grantedCount
          ? `${grantedCount} requested ${grantedCount === 1 ? "hold was" : "holds were"} explicitly granted and recorded.`
          : "No requested hold was granted.",
        value: args.dateDecisions,
        resolutionSource: "user",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(coordinationDependencies.objectiveId, objective.id),
          eq(coordinationDependencies.key, "hold_decisions"),
        ),
      );
  if (grantedCount)
    await db
      .update(jobs)
      .set({
        bookingStatus: dateOptions.some(
          (item) =>
            args.dateDecisions[item.id] === "offer" &&
            item.holdPriority === "first",
        )
          ? "first_hold"
          : "second_hold",
        updatedAt: now,
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.workspaceId, args.workspaceId)));

  await db
    .update(coordinationObjectives)
    .set({
      state: "preparing_response",
      nextAction: "Repd is preparing a response grounded in these decisions.",
      updatedAt: now,
    })
    .where(eq(coordinationObjectives.id, objective.id));
  const external = dependencies.filter(
    (item) => item.owner === "external" && item.status === "needs_external",
  );
  const questionIds: string[] = [];
  if (args.interest !== "no") {
    for (const dependency of external) {
      const suggested = dependency.value as {
        suggestedQuestion?: string;
      } | null;
      const [existingQuestion] = await db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.workspaceId, args.workspaceId),
            eq(questions.jobId, job.id),
            eq(questions.fieldKey, dependency.key),
            ne(questions.status, "obsolete"),
          ),
        )
        .limit(1);
      if (existingQuestion) questionIds.push(existingQuestion.id);
      else {
        const questionId = id("question");
        questionIds.push(questionId);
        await db.insert(questions).values({
          id: questionId,
          workspaceId: args.workspaceId,
          jobId: job.id,
          fieldKey: dependency.key,
          question:
            suggested?.suggestedQuestion ??
            `Could you clarify ${dependency.label.toLowerCase()}?`,
          whyItMatters: dependency.result,
          recipientPersonId: producer?.id ?? null,
        });
      }
    }
  } else {
    for (const dependency of external)
      await db
        .update(questions)
        .set({ status: "obsolete", updatedAt: now })
        .where(
          and(
            eq(questions.workspaceId, args.workspaceId),
            eq(questions.jobId, job.id),
            eq(questions.fieldKey, dependency.key),
            eq(questions.status, "draft"),
          ),
        );
  }
  await db
    .update(actions)
    .set({
      status: "resolved",
      executionStatus: "succeeded",
      resolutionReason: "completed_by_user",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(actions.id, decisionAction.id));
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: args.workspaceId,
    actionId: decisionAction.id,
    type: "decisions_recorded",
    fromStatus: decisionAction.status,
    toStatus: "resolved",
    reason: "completed_by_user",
    metadata: { objectiveId: objective.id },
  });
  const preparationKey = `objective-communication:${objective.id}:initial`;
  let [preparationAction] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, args.workspaceId),
        eq(actions.deduplicationKey, preparationKey),
      ),
    )
    .limit(1);
  if (!preparationAction) {
    const preparationActionId = id("act");
    await db.insert(actions).values({
      id: preparationActionId,
      workspaceId: args.workspaceId,
      jobId: job.id,
      objectiveId: objective.id,
      personId: producer?.id ?? null,
      kind: "producer_coordination",
      title: `Prepare reply to ${producer?.name ?? "the producer"}`,
      explanation:
        "Repd is preparing a response from the recorded opportunity decisions.",
      recommendation: "Review the reply when preparation completes.",
      priority: "blocking",
      status: "executing",
      executionStatus: "executing",
      deduplicationKey: preparationKey,
      payload: { objectiveId: objective.id, questionIds },
      resolutionCondition: { type: "communication_sent" },
      requiresApproval: true,
    });
    [preparationAction] = await db
      .select()
      .from(actions)
      .where(eq(actions.id, preparationActionId))
      .limit(1);
  } else
    await db
      .update(actions)
      .set({
        status: "executing",
        executionStatus: "executing",
        resolutionReason: null,
        resolvedAt: null,
        updatedAt: now,
      })
      .where(eq(actions.id, preparationAction.id));
  try {
    const provider = args.provider ?? getAIProvider();
    const draft = await runTracked({
      workspaceId: args.workspaceId,
      sourceId: objective.sourceId ?? undefined,
      jobId: job.id,
      purpose: "objective_communication",
      input: JSON.stringify({
        job: {
          title: job.title,
          proposedBudgetMinCents: job.proposedBudgetMinCents,
          proposedBudgetMaxCents: job.proposedBudgetMaxCents,
          usageTerms: job.usageTerms,
          location: job.location,
        },
        producer: producer
          ? { name: producer.name, email: producer.email }
          : null,
        decisions: {
          interest: args.interest,
          categoryConflict: args.categoryConflict ?? null,
          dates: dateOptions.map((option) => ({
            label: option.label,
            decision: args.dateDecisions[option.id] ?? "defer",
            holdPriority: option.holdPriority,
          })),
        },
        internalChecks: dependencies
          .filter((item) => item.owner === "repd")
          .map((item) => ({ label: item.label, result: item.result })),
        externalQuestions:
          args.interest === "no"
            ? []
            : external.map((item) => ({
                fieldKey: item.key,
                question: (item.value as { suggestedQuestion?: string } | null)
                  ?.suggestedQuestion,
                whyItMatters: item.result,
              })),
      }),
      instructions: `${draftCommunicationInstructions}\nThis draft follows an already-recorded creative decision. If interest is no, write a polite decline and ask no questions. If interest is maybe or yes, reflect only the exact hold decisions supplied. A granted hold may be stated as granted; deferred or declined dates must never sound available. Qualify unresolved category conflicts. Ask only the supplied external questions.`,
      schema: communicationDraftSchema,
      schemaName: "repd_objective_communication_v1",
      provider,
    });
    const [existingCommunication] = await db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.workspaceId, args.workspaceId),
          eq(communications.actionId, preparationAction.id),
        ),
      )
      .limit(1);
    const communicationId = existingCommunication?.id ?? id("communication");
    if (existingCommunication)
      await db
        .update(communications)
        .set({
          recipientPersonId: producer?.id ?? null,
          toEmail: producer?.email ?? null,
          subject: draft.subject,
          body: draft.body,
          status: "draft",
          approvedAt: null,
          revision: existingCommunication.revision + 1,
          updatedAt: now,
        })
        .where(eq(communications.id, existingCommunication.id));
    else
      await db.insert(communications).values({
        id: communicationId,
        workspaceId: args.workspaceId,
        jobId: job.id,
        actionId: preparationAction.id,
        recipientPersonId: producer?.id ?? null,
        toEmail: producer?.email ?? null,
        subject: draft.subject,
        body: draft.body,
      });
    await db
      .update(actions)
      .set({
        title: `Review reply to ${producer?.name ?? "the producer"}`,
        explanation:
          args.interest === "no"
            ? "Repd prepared a polite decline from Alex’s decision."
            : "Repd prepared a response using Alex’s interest, exact hold choices, internal checks, and the remaining commercial questions.",
        recommendation: "Review the decision-conditioned reply before handoff.",
        status: "pending_approval",
        executionStatus: "not_requested",
        requiresApproval: true,
        preparedContent: draft.body,
        payload: {
          objectiveId: objective.id,
          communicationId,
          questionIds,
          fieldKeys: external.map((item) => item.key),
          interest: args.interest,
        },
        resolutionCondition: { type: "questions_answered", questionIds },
        updatedAt: now,
      })
      .where(eq(actions.id, preparationAction.id));
    await db
      .update(coordinationObjectives)
      .set({
        state: "awaiting_approval",
        nextAction: "Review and approve the prepared producer response.",
        completedSteps: [
          ...objective.completedSteps,
          "Recorded Alex’s opportunity and hold decisions",
          "Prepared a decision-conditioned producer response",
        ],
        updatedAt: now,
      })
      .where(eq(coordinationObjectives.id, objective.id));
    await db.insert(activities).values({
      id: id("activity"),
      workspaceId: args.workspaceId,
      jobId: job.id,
      actorUserId: args.userId,
      type: "coordination_decisions_recorded",
      summary:
        "Recorded opportunity decisions and prepared the producer response.",
      metadata: {
        objectiveId: objective.id,
        interest: args.interest,
        grantedCount,
      },
    });
    await reevaluateWorkspace(args.workspaceId);
    return preparationAction.id;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Communication preparation failed.";
    await db
      .update(actions)
      .set({
        status: "open",
        executionStatus: "failed",
        resolutionReason: message,
        updatedAt: new Date(),
      })
      .where(eq(actions.id, preparationAction.id));
    await db.insert(actionEvents).values({
      id: id("aev"),
      workspaceId: args.workspaceId,
      actionId: preparationAction.id,
      type: "preparation_failed",
      fromStatus: "executing",
      toStatus: "open",
      reason: message,
    });
    await db
      .update(coordinationObjectives)
      .set({
        state: "needs_attention",
        nextAction:
          "The decisions are saved, but Repd could not prepare the response. Retry when AI is available.",
        updatedAt: new Date(),
      })
      .where(eq(coordinationObjectives.id, objective.id));
    throw error;
  }
}

export async function reconcileAdvanceInquiryObjective(args: {
  workspaceId: string;
  jobId: string;
  sourceId: string;
  extraction: InquiryExtraction;
}) {
  const [objective] = await db
    .select()
    .from(coordinationObjectives)
    .where(
      and(
        eq(coordinationObjectives.workspaceId, args.workspaceId),
        eq(coordinationObjectives.jobId, args.jobId),
        eq(coordinationObjectives.kind, "advance_inquiry"),
      ),
    )
    .limit(1);
  if (!objective) return;
  const selectedShootDate = args.extraction.dateOnly
    ? calendarDate(args.extraction.shootStart.value)
    : null;
  if (selectedShootDate) {
    const options = await db
      .select()
      .from(coordinationDateOptions)
      .where(
        and(
          eq(coordinationDateOptions.workspaceId, args.workspaceId),
          eq(coordinationDateOptions.objectiveId, objective.id),
        ),
      );
    for (const option of options)
      await db
        .update(coordinationDateOptions)
        .set({
          clientSelected: option.startsOn === selectedShootDate,
          clientSelectionSourceId:
            option.startsOn === selectedShootDate ? args.sourceId : null,
          // Once the client selects one of several requested dates, an
          // unselected hold is historical unless the new source explicitly
          // re-establishes it. Keep the request as evidence, but do not
          // project it as a current hold.
          holdState: reconcileDateOptionHoldState({
            isSelected: option.startsOn === selectedShootDate,
            holdRequested: option.holdRequested,
            holdState: option.holdState,
          }),
          updatedAt: new Date(),
        })
        .where(eq(coordinationDateOptions.id, option.id));
  }
  const resolvedKeys = new Set(
    extractionFields(args.extraction)
      .filter((field) => field.value != null)
      .map((field) => field.key),
  );
  if (args.extraction.budgetRange.includesUsage != null)
    resolvedKeys.add("budgetIncludesUsage");
  if (
    [
      ...args.extraction.producerRequests,
      ...args.extraction.relevantNotes,
    ].some((value) => /treatment|deck/i.test(value))
  )
    resolvedKeys.add("treatmentExpectations");
  const deps = await db
    .select()
    .from(coordinationDependencies)
    .where(
      and(
        eq(coordinationDependencies.workspaceId, args.workspaceId),
        eq(coordinationDependencies.objectiveId, objective.id),
      ),
    );
  for (const dependency of deps.filter(
    (item) => item.owner === "external" && resolvedKeys.has(item.key),
  )) {
    await db
      .update(coordinationDependencies)
      .set({
        status: "resolved",
        result:
          "The producer response supplied new source-backed information for this dependency.",
        value: { sourceId: args.sourceId },
        resolutionSource: "external",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coordinationDependencies.id, dependency.id));
    await db
      .update(questions)
      .set({
        status: "answered",
        answeredAt: new Date(),
        sourceId: args.sourceId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(questions.workspaceId, args.workspaceId),
          eq(questions.jobId, args.jobId),
          eq(questions.fieldKey, dependency.key),
          eq(questions.status, "asked"),
        ),
      );
  }
  for (const obligation of args.extraction.operationalObligations) {
    const status =
      obligation.status === "needs_decision"
        ? "needs_decision"
        : obligation.status === "promised"
          ? "needs_external"
          : "resolved";
    await insertDependency({
      workspaceId: args.workspaceId,
      objectiveId: objective.id,
      key: obligation.key,
      label: obligation.label,
      owner: obligation.owner,
      status,
      result: [
        obligation.label,
        obligation.dueDate ? `Due ${obligation.dueDate}.` : null,
        obligation.prerequisite
          ? `Prerequisite: ${obligation.prerequisite}.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      value: obligation,
      evidence: obligation.evidence ?? undefined,
      resolutionSource: status === "resolved" ? "external" : undefined,
    });
  }
  const updatedDependencies = await db
    .select()
    .from(coordinationDependencies)
    .where(
      and(
        eq(coordinationDependencies.workspaceId, args.workspaceId),
        eq(coordinationDependencies.objectiveId, objective.id),
      ),
    );
  const unresolvedExternal = updatedDependencies.filter(
    (item) =>
      item.owner === "external" &&
      item.status === "needs_external" &&
      !resolvedKeys.has(item.key),
  );
  const treatmentDecision = updatedDependencies.find(
    (item) =>
      item.key === "treatment_deadline" && item.status === "needs_decision",
  );
  await db
    .update(coordinationObjectives)
    .set({
      state: treatmentDecision ? "awaiting_decisions" : "ready_to_advance",
      summary: args.extraction.summary,
      nextAction: treatmentDecision
        ? "Decide whether Alex can commit to the treatment deadline, subject to reviewing the promised deck."
        : unresolvedExternal.length
          ? "Review what changed and decide whether the remaining external questions still matter."
          : "Review the resolved terms and choose the next booking step.",
      completedSteps: [
        ...objective.completedSteps,
        "Reconciled the producer response against the objective",
      ],
      updatedAt: new Date(),
    })
    .where(eq(coordinationObjectives.id, objective.id));
  const priorActions = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, args.workspaceId),
        eq(actions.objectiveId, objective.id),
      ),
    );
  for (const priorAction of priorActions.filter(
    (item) => item.status !== "resolved" && !item.supersededById,
  )) {
    await db.insert(actionEvents).values({
      id: id("aev"),
      workspaceId: args.workspaceId,
      actionId: priorAction.id,
      type: "producer_response_accepted",
      fromStatus: priorAction.status,
      toStatus: "resolved",
      metadata: { sourceId: args.sourceId, resolvedKeys: [...resolvedKeys] },
    });
    await db
      .update(actions)
      .set({
        status: "resolved",
        executionStatus: "succeeded",
        resolutionReason: "condition_satisfied",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(actions.id, priorAction.id));
  }
  const nextActionId = id("act");
  await db.insert(actions).values({
    id: nextActionId,
    workspaceId: args.workspaceId,
    jobId: args.jobId,
    objectiveId: objective.id,
    kind: treatmentDecision ? "treatment_commitment" : "advance_inquiry",
    title: treatmentDecision
      ? "Decide whether to commit to the treatment deadline"
      : "Advance the updated opportunity",
    explanation: treatmentDecision?.result ?? args.extraction.summary,
    recommendation: treatmentDecision
      ? "Decide what Alex can promise after reviewing the producer’s deck."
      : unresolvedExternal.length
        ? "Review the remaining external dependencies."
        : "Advance the booking decision.",
    priority: treatmentDecision ? "blocking" : "routine",
    deduplicationKey: `objective-next:${objective.id}:${args.sourceId}`,
    payload: { objectiveId: objective.id, sourceId: args.sourceId },
    resolutionCondition: treatmentDecision
      ? { type: "dependency_resolved", field: "treatment_deadline" }
      : { type: "objective_completed" },
  });
}

export async function recordTreatmentCommitmentDecision(args: {
  workspaceId: string;
  userId: string;
  objectiveId: string;
  decision: "commit_after_deck" | "need_deck_first" | "cannot_commit";
  condition?: string | null;
  instructionAt?: Date;
  provider?: AIProvider;
}) {
  const [objective] = await db
    .select()
    .from(coordinationObjectives)
    .where(
      and(
        eq(coordinationObjectives.id, args.objectiveId),
        eq(coordinationObjectives.workspaceId, args.workspaceId),
      ),
    )
    .limit(1);
  if (!objective) throw new Error("Coordination objective not found.");
  const [job, dependency, producer] = await Promise.all([
    db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, objective.jobId),
          eq(jobs.workspaceId, args.workspaceId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(coordinationDependencies)
      .where(
        and(
          eq(coordinationDependencies.objectiveId, objective.id),
          eq(coordinationDependencies.key, "treatment_deadline"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ person: people })
      .from(jobParticipants)
      .innerJoin(people, eq(jobParticipants.personId, people.id))
      .where(
        and(
          eq(jobParticipants.workspaceId, args.workspaceId),
          eq(jobParticipants.jobId, objective.jobId),
          eq(jobParticipants.role, "Producer"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]?.person),
  ]);
  if (!job || !dependency)
    throw new Error("Treatment decision records are incomplete.");
  const obligation = dependency.value as {
    dueDate?: string | null;
    prerequisite?: string | null;
    decision?: "commit_after_deck" | "need_deck_first" | "cannot_commit";
    condition?: string | null;
    conditionResolvedDate?: string | null;
    instructionAt?: string | null;
  } | null;
  // A retry is preparation, not a second decision. Once recorded, the
  // dependency is the authority for the exact decision and its condition.
  const preparationInput = resolveTreatmentPreparationInput({
    dependencyStatus: dependency.status,
    saved: obligation,
    requestedDecision: args.decision,
    requestedCondition: args.condition,
  });
  const effectiveDecision = preparationInput.decision;
  const effectiveCondition = preparationInput.condition;
  const instructionAt =
    args.instructionAt ??
    (obligation?.instructionAt ? new Date(obligation.instructionAt) : null);
  const conditionResolvedDate =
    obligation?.conditionResolvedDate ??
    (instructionAt
      ? resolveRelativeBusinessDate(effectiveCondition, instructionAt)
      : null);
  const now = new Date();
  const decisionResult =
    effectiveDecision === "commit_after_deck"
      ? `Alex can commit to the treatment deadline, ${effectiveCondition ? `provided that ${effectiveCondition}` : "subject to reviewing the promised deck"}.`
      : effectiveDecision === "need_deck_first"
        ? "Alex needs to review the promised deck before committing to the treatment deadline."
        : "Alex cannot commit to the requested treatment deadline.";
  const objectiveActions = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, args.workspaceId),
        eq(actions.objectiveId, objective.id),
      ),
    )
    .orderBy(desc(actions.createdAt));
  const decisionActions = objectiveActions.filter(
    (action) =>
      action.kind === "treatment_commitment" ||
      /decide whether to commit to the treatment deadline/i.test(action.title),
  );
  if (dependency.status !== "resolved") {
    await db.transaction(async (tx) => {
      await tx
        .update(coordinationDependencies)
        .set({
          status: "resolved",
          result: decisionResult,
          value: {
            ...obligation,
            decision: effectiveDecision,
            ...(effectiveCondition ? { condition: effectiveCondition } : {}),
            ...(conditionResolvedDate ? { conditionResolvedDate } : {}),
            ...(instructionAt
              ? { instructionAt: instructionAt.toISOString() }
              : {}),
          },
          resolutionSource: "user",
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(coordinationDependencies.id, dependency.id));
      for (const decisionAction of decisionActions)
        await tx
          .update(actions)
          .set({
            status: "resolved",
            executionStatus: "succeeded",
            resolutionReason: "completed_by_user",
            resolvedAt: now,
            updatedAt: now,
          })
          .where(eq(actions.id, decisionAction.id));
      await tx
        .update(coordinationObjectives)
        .set({
          state: "preparing_response",
          nextAction:
            "The treatment decision is saved. Repd is preparing the response.",
          updatedAt: now,
        })
        .where(eq(coordinationObjectives.id, objective.id));
    });
    for (const decisionAction of decisionActions)
      await db.insert(actionEvents).values({
        id: id("aev"),
        workspaceId: args.workspaceId,
        actionId: decisionAction.id,
        type: "decision_recorded",
        fromStatus: decisionAction.status,
        toStatus: "resolved",
        reason: "completed_by_user",
        metadata: { objectiveId: objective.id, decision: effectiveDecision },
      });
    await db.insert(activities).values({
      id: id("activity"),
      workspaceId: args.workspaceId,
      jobId: job.id,
      actorUserId: args.userId,
      type: "treatment_commitment_decided",
      summary: decisionResult,
      metadata: { objectiveId: objective.id, decision: effectiveDecision },
    });
  }
  const preparationKey = `treatment-communication:${objective.id}:${dependency.id}`;
  let [preparationAction] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, args.workspaceId),
        eq(actions.deduplicationKey, preparationKey),
      ),
    )
    .limit(1);
  if (!preparationAction) {
    const preparationActionId = id("act");
    await db.insert(actions).values({
      id: preparationActionId,
      workspaceId: args.workspaceId,
      jobId: job.id,
      objectiveId: objective.id,
      personId: producer?.id ?? null,
      kind: "producer_coordination",
      title: `Prepare treatment reply to ${producer?.name ?? "the producer"}`,
      explanation: decisionResult,
      recommendation: "Review the deadline response before handoff.",
      priority: "blocking",
      status: "executing",
      executionStatus: "executing",
      deduplicationKey: preparationKey,
      requiresApproval: true,
      payload: {
        objectiveId: objective.id,
        questionIds: [],
        treatmentDecision: effectiveDecision,
        ...(effectiveCondition
          ? { treatmentCondition: effectiveCondition }
          : {}),
        ...(conditionResolvedDate ? { conditionResolvedDate } : {}),
        ...(instructionAt
          ? { instructionAt: instructionAt.toISOString() }
          : {}),
      },
      resolutionCondition: { type: "communication_sent" },
    });
    [preparationAction] = await db
      .select()
      .from(actions)
      .where(eq(actions.id, preparationActionId))
      .limit(1);
  } else
    await db
      .update(actions)
      .set({
        status: "executing",
        executionStatus: "executing",
        resolutionReason: null,
        resolvedAt: null,
        updatedAt: now,
      })
      .where(eq(actions.id, preparationAction.id));
  const requiredCommitmentSentence = treatmentCommitmentSentence({
    decision: effectiveDecision,
    dueDate: obligation?.dueDate ?? null,
    condition: effectiveCondition,
  });
  const draftInput = JSON.stringify({
    job: { title: job.title, shootDate: job.shootDate },
    producer: producer ? { name: producer.name, email: producer.email } : null,
    immutableBusinessFacts: {
      treatmentDecision: effectiveDecision,
      treatmentCondition: effectiveCondition,
      conditionResolvedDate,
      requiredCommitmentSentence,
      externalDeliveryAuthorized: false,
    },
    treatment: {
      decision: effectiveDecision,
      dueDate: obligation?.dueDate ?? null,
      prerequisite: obligation?.prerequisite ?? null,
      condition: effectiveCondition,
    },
  });
  let automaticAttempts = 0;
  const generateDraft = async (repair = false) => {
    const provider = args.provider ?? getAIProvider();
    const result = await runWithBoundedAutomaticRetry({
      operation: () => {
        automaticAttempts += 1;
        return runTracked({
          workspaceId: args.workspaceId,
          jobId: job.id,
          purpose: "treatment_commitment_communication",
          input: draftInput,
          instructions: `${draftCommunicationInstructions}\nThe immutableBusinessFacts object is authoritative and must not be reinterpreted. Copy requiredCommitmentSentence verbatim into the email body. It records an already-authorized present conditional commitment, not a future decision. Do not replace it with language about assessing, deciding, confirming later, seeing whether the deadline is possible, or letting the producer know. A client-selected shoot date is not a confirmed booking. Do not imply delivery or sending.${repair ? " The previous attempt changed the commitment semantics. Keep requiredCommitmentSentence exactly as supplied and regenerate only the surrounding email wording." : ""}`,
          schema: communicationDraftSchema,
          schemaName: "repd_treatment_commitment_email_v1",
          provider,
        });
      },
      onRetry: async (attempt) => {
        await db.insert(actionEvents).values({
          id: id("aev"),
          workspaceId: args.workspaceId,
          actionId: preparationAction.id,
          type: "preparation_retrying",
          fromStatus: "executing",
          toStatus: "executing",
          reason: `Transient model-provider failure. Automatic attempt ${attempt} of 2.`,
          metadata: { attempt, maxAttempts: 2 },
        });
      },
    });
    return result.value;
  };
  try {
    let draft = await generateDraft();
    if (
      !draft.body.includes(requiredCommitmentSentence) ||
      !communicationPreservesTreatmentDecision(
        draft.body,
        effectiveDecision,
        effectiveCondition,
      )
    )
      draft = await generateDraft(true);
    if (
      !draft.body.includes(requiredCommitmentSentence) ||
      !communicationPreservesTreatmentDecision(
        draft.body,
        effectiveDecision,
        effectiveCondition,
      )
    )
      throw new PreparationArtifactValidationError(
        "Repd could not prepare a draft without changing the saved treatment commitment.",
      );
    const [existingCommunication] = await db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.workspaceId, args.workspaceId),
          eq(communications.actionId, preparationAction.id),
        ),
      )
      .limit(1);
    const communicationId = existingCommunication?.id ?? id("communication");
    await db.transaction(async (tx) => {
      if (existingCommunication)
        await tx
          .update(communications)
          .set({
            recipientPersonId: producer?.id ?? null,
            toEmail: producer?.email ?? null,
            subject: draft.subject,
            body: draft.body,
            status: "draft",
            approvedAt: null,
            revision: existingCommunication.revision + 1,
            updatedAt: now,
          })
          .where(eq(communications.id, existingCommunication.id));
      else
        await tx.insert(communications).values({
          id: communicationId,
          workspaceId: args.workspaceId,
          jobId: job.id,
          actionId: preparationAction.id,
          recipientPersonId: producer?.id ?? null,
          toEmail: producer?.email ?? null,
          subject: draft.subject,
          body: draft.body,
        });
      await tx
        .update(actions)
        .set({
          title: `Review treatment reply to ${producer?.name ?? "the producer"}`,
          status: "pending_approval",
          executionStatus: "not_requested",
          preparedContent: draft.body,
          payload: {
            objectiveId: objective.id,
            communicationId,
            questionIds: [],
            treatmentDecision: effectiveDecision,
            ...(effectiveCondition
              ? { treatmentCondition: effectiveCondition }
              : {}),
            ...(conditionResolvedDate ? { conditionResolvedDate } : {}),
            ...(instructionAt
              ? { instructionAt: instructionAt.toISOString() }
              : {}),
            automaticAttempts,
          },
          updatedAt: now,
        })
        .where(eq(actions.id, preparationAction.id));
      await tx
        .update(coordinationObjectives)
        .set({
          state: "awaiting_approval",
          nextAction: "Review and approve the prepared treatment response.",
          completedSteps: [
            ...objective.completedSteps,
            "Recorded Alex’s treatment deadline decision",
            "Prepared the follow-up response",
          ],
          updatedAt: now,
        })
        .where(eq(coordinationObjectives.id, objective.id));
    });
    return preparationAction.id;
  } catch (error) {
    const failure = classifyPreparationFailure(error);
    const message =
      failure.category === "provider_transient"
        ? `The model provider did not complete the reply after ${Math.max(automaticAttempts, 2)} attempts. ${failure.message}`
        : failure.category === "provider_configuration"
          ? `Reply preparation is not configured. ${failure.message}`
          : failure.category === "provider_non_retryable"
            ? `The model provider could not prepare the reply. ${failure.message}`
            : failure.category === "artifact_validation"
              ? `The provider returned a draft, but Repd rejected it because it changed the saved commitment. ${failure.message}`
              : `The saved decision is intact, but Repd could not complete the preparation state change. ${failure.message}`;
    const failedPayload = {
      ...(preparationAction.payload as Record<string, unknown>),
      failureCategory: failure.category,
      automaticAttempts,
    };
    await db.transaction(async (tx) => {
      await tx
        .update(actions)
        .set({
          status: "open",
          executionStatus: "failed",
          resolutionReason: message,
          payload: failedPayload,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, preparationAction.id));
      await tx
        .update(coordinationObjectives)
        .set({
          state: "needs_attention",
          nextAction:
            "The treatment decision is saved. Reply preparation failed and can be retried.",
          updatedAt: new Date(),
        })
        .where(eq(coordinationObjectives.id, objective.id));
    });
    await db.insert(actionEvents).values({
      id: id("aev"),
      workspaceId: args.workspaceId,
      actionId: preparationAction.id,
      type: "preparation_failed",
      fromStatus: "executing",
      toStatus: "open",
      reason: message,
      metadata: {
        failureCategory: failure.category,
        automaticallyRetryable: failure.automaticallyRetryable,
        automaticAttempts,
      },
    });
    throw error;
  }
}

export async function retryTreatmentPreparationOperation(args: {
  workspaceId: string;
  userId: string;
  actionId: string;
  provider?: AIProvider;
}) {
  const [action] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.id, args.actionId),
        eq(actions.workspaceId, args.workspaceId),
      ),
    )
    .limit(1);
  if (!action)
    return {
      status: "invalid" as const,
      message: "Preparation was not found.",
    };
  if (action.executionStatus === "executing")
    return {
      status: "already_running" as const,
      message: "Reply preparation is already running.",
      jobId: action.jobId,
    };
  if (action.status === "pending_approval")
    return {
      status: "succeeded" as const,
      message: "The reply is already ready for review.",
      jobId: action.jobId,
    };
  const payload = action.payload as {
    treatmentDecision?:
      "commit_after_deck" | "need_deck_first" | "cannot_commit";
    treatmentCondition?: string;
  };
  if (
    !action.objectiveId ||
    action.executionStatus !== "failed" ||
    !payload.treatmentDecision
  )
    return {
      status: "invalid" as const,
      message: "This operation is not available for preparation retry.",
      jobId: action.jobId,
    };

  const claimed = await db
    .update(actions)
    .set({
      status: "executing",
      executionStatus: "executing",
      resolutionReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(actions.id, action.id),
        eq(actions.workspaceId, args.workspaceId),
        eq(actions.executionStatus, "failed"),
      ),
    )
    .returning({ id: actions.id });
  if (!claimed.length)
    return {
      status: "already_running" as const,
      message: "Reply preparation is already running.",
      jobId: action.jobId,
    };
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: args.workspaceId,
    actionId: action.id,
    type: "preparation_retry_started",
    fromStatus: "open",
    toStatus: "executing",
    reason: "manual_retry",
  });
  try {
    await recordTreatmentCommitmentDecision({
      workspaceId: args.workspaceId,
      userId: args.userId,
      objectiveId: action.objectiveId,
      decision: payload.treatmentDecision,
      condition: payload.treatmentCondition ?? null,
      provider: args.provider,
    });
    return {
      status: "succeeded" as const,
      message: "Reply prepared. Review it before anything is sent.",
      jobId: action.jobId,
    };
  } catch (error) {
    const [failed] = await db
      .select({ reason: actions.resolutionReason })
      .from(actions)
      .where(eq(actions.id, action.id))
      .limit(1);
    return {
      status: "failed" as const,
      message:
        failed?.reason ??
        (error instanceof Error
          ? error.message
          : "Reply preparation failed. The saved decision is unchanged."),
      jobId: action.jobId,
    };
  }
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
