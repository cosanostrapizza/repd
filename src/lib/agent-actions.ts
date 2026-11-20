"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, id } from "@/db/client";
import {
  actionEvents,
  actions,
  communications,
  coordinationDateOptions,
  coordinationObjectives,
  intakeReviews,
  invoiceDrafts,
  jobs,
  organizations,
  questions,
} from "@/db/schema";
import { getAIConfiguration } from "./ai/provider";
import { inquiryExtractionSchema } from "./ai/schemas";
import {
  acceptIntakeReview,
  createAndAnalyzeIntake,
  recordAdvanceInquiryDecisions,
  recordTreatmentCommitmentDecision,
  retryTreatmentPreparationOperation,
  rewriteCommunication,
} from "./services/intake";
import { communicationPreservesTreatmentDecision } from "./communication-constraints";
import { requireContext } from "./auth";

export type AgentFormState = {
  error?: string;
  success?: string;
  configuration?: ReturnType<typeof getAIConfiguration>;
};
const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

export async function submitInquiry(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const content = value(formData, "content");
  if (content.length < 30)
    return {
      error:
        "Paste enough of the inquiry for Repd to understand the opportunity.",
    };
  const reviewId = await createAndAnalyzeIntake({
    workspaceId: ctx.workspaceId,
    content,
  });
  redirect(`/inquiries/review/${reviewId}`);
}

export async function submitJobResponse(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const content = value(formData, "content"),
    jobId = value(formData, "jobId");
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!job) return { error: "Job not found." };
  if (content.length < 20)
    return { error: "Paste the producer’s response before continuing." };
  const reviewId = await createAndAnalyzeIntake({
    workspaceId: ctx.workspaceId,
    content,
    targetJobId: jobId,
    kind: "producer_response",
  });
  const [review] = await db
    .select()
    .from(intakeReviews)
    .where(
      and(
        eq(intakeReviews.id, reviewId),
        eq(intakeReviews.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (review?.status === "ready" && review.proposedData) {
    const extraction = inquiryExtractionSchema.parse(review.proposedData);
    const needsDecision = extraction.operationalObligations.some(
      (item) => item.status === "needs_decision",
    );
    const comparable = [
      [extraction.jobTitle.value, job.title],
      [extraction.jobType.value, job.jobType],
      [extraction.location.value, job.location],
      [extraction.feeCents.value, job.feeCents],
      [extraction.currency.value, job.currency],
      [extraction.usageTerms.value, job.usageTerms],
      [extraction.deliverables.value, job.deliverables],
      [extraction.paymentTerms.value, job.paymentTerms],
      [extraction.bookingStatus.value, job.bookingStatus],
      [extraction.lifecycleStatus.value, job.lifecycleStatus],
    ];
    const contradictsKnownFact = comparable.some(
      ([incoming, existing]) =>
        incoming != null &&
        existing != null &&
        String(incoming).toLocaleLowerCase() !==
          String(existing).toLocaleLowerCase(),
    );
    const classifiedAsRoutineClarification =
      extraction.risks.length === 0 &&
      /resolv|clarif|supplied new information/i.test(extraction.assessment);
    if (
      !needsDecision &&
      (!contradictsKnownFact || classifiedAsRoutineClarification)
    ) {
      let incorporated = false;
      try {
        await acceptIntakeReview({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          reviewId,
          targetJobId: jobId,
          corrections: {},
          rejectedKeys: [],
        });
        revalidatePath(`/jobs/${jobId}`);
        incorporated = true;
      } catch {
        // Preserve the review path when automatic incorporation cannot finish.
      }
      if (incorporated) redirect(`/jobs/${jobId}?updated=1#next-steps`);
    }
  }
  redirect(`/inquiries/review/${reviewId}`);
}

export async function acceptReviewAction(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const reviewId = value(formData, "reviewId");
  const [review] = await db
    .select()
    .from(intakeReviews)
    .where(
      and(
        eq(intakeReviews.id, reviewId),
        eq(intakeReviews.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!review) return { error: "Review not found." };
  const corrections: Record<string, string> = {};
  const rejectedKeys: string[] = [];
  for (const [key, raw] of formData.entries())
    if (key.startsWith("field_"))
      corrections[key.slice(6)] = String(raw).trim();
    else if (key.startsWith("decision_") && String(raw) === "reject")
      rejectedKeys.push(key.slice(9));
  let acceptedJobId: string;
  try {
    acceptedJobId = await acceptIntakeReview({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      reviewId,
      targetJobId: value(formData, "targetJobId") || null,
      corrections,
      rejectedKeys,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not accept this review.",
    };
  }
  const [objective] = await db
    .select()
    .from(coordinationObjectives)
    .where(
      and(
        eq(coordinationObjectives.jobId, acceptedJobId),
        eq(coordinationObjectives.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  try {
    const interest = value(formData, "interest");
    if (
      review.kind !== "producer_response" &&
      objective &&
      ["yes", "maybe", "no"].includes(interest)
    ) {
      const options = await db
        .select()
        .from(coordinationDateOptions)
        .where(
          and(
            eq(coordinationDateOptions.objectiveId, objective.id),
            eq(coordinationDateOptions.workspaceId, ctx.workspaceId),
          ),
        );
      const dateDecisions = Object.fromEntries(
        options.map((option, index) => {
          const raw = value(formData, `dateDecision_${index}`);
          return [
            option.id,
            ["offer", "defer", "decline"].includes(raw) ? raw : "defer",
          ];
        }),
      ) as Record<string, "offer" | "defer" | "decline">;
      const categoryConflict = value(formData, "categoryConflict");
      await recordAdvanceInquiryDecisions({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        objectiveId: objective.id,
        interest: interest as "yes" | "maybe" | "no",
        categoryConflict: ["none_known", "possible", "unsure"].includes(
          categoryConflict,
        )
          ? (categoryConflict as "none_known" | "possible" | "unsure")
          : undefined,
        dateDecisions,
      });
    }
    const treatmentDecision = value(formData, "treatmentDecision");
    if (
      review.kind === "producer_response" &&
      objective &&
      ["commit_after_deck", "need_deck_first", "cannot_commit"].includes(
        treatmentDecision,
      )
    )
      await recordTreatmentCommitmentDecision({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        objectiveId: objective.id,
        decision: treatmentDecision as
          "commit_after_deck" | "need_deck_first" | "cannot_commit",
      });
  } catch {
    // The accepted source and recorded decisions remain durable. The objective
    // carries the recoverable preparation state back into the job workspace.
  }
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${acceptedJobId}`);
  redirect(`/jobs/${acceptedJobId}#next-steps`);
}

export async function saveInquiryDecisions(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const objectiveId = value(formData, "objectiveId");
  const interest = value(formData, "interest");
  if (!["yes", "maybe", "no"].includes(interest))
    return { error: "Choose how interested you are before continuing." };
  const categoryConflict = value(formData, "categoryConflict");
  const dateDecisions: Record<string, "offer" | "defer" | "decline"> = {};
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("dateDecision_")) continue;
    const decision = String(raw);
    if (["offer", "defer", "decline"].includes(decision))
      dateDecisions[key.slice("dateDecision_".length)] = decision as
        "offer" | "defer" | "decline";
  }
  let actionId: string;
  try {
    actionId = await recordAdvanceInquiryDecisions({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      objectiveId,
      interest: interest as "yes" | "maybe" | "no",
      categoryConflict: ["none_known", "possible", "unsure"].includes(
        categoryConflict,
      )
        ? (categoryConflict as "none_known" | "possible" | "unsure")
        : undefined,
      dateDecisions,
    });
    revalidatePath("/");
    revalidatePath("/jobs");
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The decisions were saved, but the response could not be prepared.",
      configuration: getAIConfiguration(),
    };
  }
  const [action] = await db
    .select({ jobId: actions.jobId })
    .from(actions)
    .where(
      and(eq(actions.id, actionId), eq(actions.workspaceId, ctx.workspaceId)),
    )
    .limit(1);
  redirect(action?.jobId ? `/jobs/${action.jobId}#next-steps` : "/actions");
}

export async function saveTreatmentCommitmentDecision(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const objectiveId = value(formData, "objectiveId");
  const decision = value(formData, "treatmentDecision");
  if (
    !["commit_after_deck", "need_deck_first", "cannot_commit"].includes(
      decision,
    )
  )
    return { error: "Choose how to handle the treatment deadline." };
  let actionId: string;
  try {
    actionId = await recordTreatmentCommitmentDecision({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      objectiveId,
      decision: decision as
        "commit_after_deck" | "need_deck_first" | "cannot_commit",
    });
    revalidatePath("/");
    revalidatePath("/jobs");
  } catch (error) {
    const [objective] = await db
      .select({ jobId: coordinationObjectives.jobId })
      .from(coordinationObjectives)
      .where(
        and(
          eq(coordinationObjectives.id, objectiveId),
          eq(coordinationObjectives.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1);
    revalidatePath("/");
    if (objective?.jobId) revalidatePath(`/jobs/${objective.jobId}`);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not prepare the treatment response.",
      configuration: getAIConfiguration(),
    };
  }
  const [action] = await db
    .select({ jobId: actions.jobId })
    .from(actions)
    .where(
      and(eq(actions.id, actionId), eq(actions.workspaceId, ctx.workspaceId)),
    )
    .limit(1);
  redirect(action?.jobId ? `/jobs/${action.jobId}#next-steps` : "/actions");
}

export async function retryTreatmentPreparation(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const actionId = value(formData, "actionId");
  const result = await retryTreatmentPreparationOperation({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    actionId,
  });
  revalidatePath("/");
  revalidatePath("/jobs");
  if (result.jobId) revalidatePath(`/jobs/${result.jobId}`);
  return result.status === "failed" || result.status === "invalid"
    ? { error: result.message, configuration: getAIConfiguration() }
    : { success: result.message };
}

export async function rejectReview(formData: FormData) {
  const ctx = await requireContext();
  const reviewId = value(formData, "reviewId");
  await db
    .update(intakeReviews)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(intakeReviews.id, reviewId),
        eq(intakeReviews.workspaceId, ctx.workspaceId),
      ),
    );
  redirect("/jobs");
}

async function ownedCommunication(
  workspaceId: string,
  communicationId: string,
) {
  return (
    await db
      .select({ communication: communications, action: actions })
      .from(communications)
      .leftJoin(actions, eq(communications.actionId, actions.id))
      .where(
        and(
          eq(communications.id, communicationId),
          eq(communications.workspaceId, workspaceId),
        ),
      )
      .limit(1)
  )[0];
}

export async function saveCommunication(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const communicationId = value(formData, "communicationId");
  const row = await ownedCommunication(ctx.workspaceId, communicationId);
  if (!row) return { error: "Draft not found." };
  const subject = value(formData, "subject"),
    body = value(formData, "body"),
    toEmail = value(formData, "toEmail") || null;
  if (!subject || !body) return { error: "Subject and message are required." };
  const treatmentPayload = row.action?.payload as {
    treatmentDecision?:
      "commit_after_deck" | "need_deck_first" | "cannot_commit";
    treatmentCondition?: string;
  } | null;
  const treatmentDecision = treatmentPayload?.treatmentDecision;
  if (
    treatmentDecision &&
    !communicationPreservesTreatmentDecision(
      body,
      treatmentDecision,
      treatmentPayload?.treatmentCondition,
    )
  )
    return {
      error:
        "This edit changes the treatment commitment you selected. Keep the commitment and its deck-review condition explicit.",
    };
  await db
    .update(communications)
    .set({
      subject,
      body,
      toEmail,
      revision: row.communication.revision + 1,
      status:
        row.communication.status === "approved"
          ? "draft"
          : row.communication.status,
      approvedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(communications.id, communicationId));
  if (row.action)
    await db
      .update(actions)
      .set({
        status: "pending_approval",
        executionStatus: "not_requested",
        approvedAt: null,
        preparedContent: body,
        updatedAt: new Date(),
      })
      .where(eq(actions.id, row.action.id));
  revalidatePath(`/actions/${row.action?.id}`);
  revalidatePath(`/jobs/${row.communication.jobId}`);
  revalidatePath("/");
  revalidatePath("/agent");
  return { success: "Draft saved. It still requires approval." };
}

export async function reviseCommunication(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const communicationId = value(formData, "communicationId");
  const row = await ownedCommunication(ctx.workspaceId, communicationId);
  if (!row) return { error: "Draft not found." };
  try {
    const result = await rewriteCommunication({
      workspaceId: ctx.workspaceId,
      jobId: row.communication.jobId,
      currentSubject: row.communication.subject,
      currentBody: row.communication.body,
      tone: (value(formData, "tone") || "warm") as
        "warm" | "direct" | "concise",
      instruction: value(formData, "instruction"),
    });
    const treatmentPayload = row.action?.payload as {
      treatmentDecision?:
        "commit_after_deck" | "need_deck_first" | "cannot_commit";
      treatmentCondition?: string;
    } | null;
    const treatmentDecision = treatmentPayload?.treatmentDecision;
    if (
      treatmentDecision &&
      !communicationPreservesTreatmentDecision(
        result.body,
        treatmentDecision,
        treatmentPayload?.treatmentCondition,
      )
    )
      return {
        error:
          "Repd’s revision changed your treatment commitment, so it was not applied.",
      };
    await db
      .update(communications)
      .set({
        subject: result.subject,
        body: result.body,
        revision: row.communication.revision + 1,
        status: "draft",
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(communications.id, communicationId));
    if (row.action)
      await db
        .update(actions)
        .set({
          status: "pending_approval",
          approvedAt: null,
          preparedContent: result.body,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, row.action.id));
    revalidatePath(`/actions/${row.action?.id}`);
    return { success: "Repd revised the draft. Review it before approving." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The draft could not be revised.",
      configuration: getAIConfiguration(),
    };
  }
}

export async function approveCommunication(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const communicationId = value(formData, "communicationId");
  const row = await ownedCommunication(ctx.workspaceId, communicationId);
  if (!row?.action) return { error: "Draft not found." };
  const treatmentPayload = row.action.payload as {
    treatmentDecision?:
      "commit_after_deck" | "need_deck_first" | "cannot_commit";
    treatmentCondition?: string;
  } | null;
  const treatmentDecision = treatmentPayload?.treatmentDecision;
  if (
    treatmentDecision &&
    !communicationPreservesTreatmentDecision(
      row.communication.body,
      treatmentDecision,
      treatmentPayload?.treatmentCondition,
    )
  )
    return {
      error:
        "This draft no longer matches your treatment decision. Restore the exact commitment before approval.",
    };
  await db
    .update(communications)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(communications.id, communicationId));
  await db
    .update(actions)
    .set({
      status: "approved",
      executionStatus: "ready",
      approvedAt: new Date(),
      approvedByUserId: ctx.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(actions.id, row.action.id),
        eq(actions.workspaceId, ctx.workspaceId),
      ),
    );
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: ctx.workspaceId,
    actionId: row.action.id,
    type: "approved",
    fromStatus: row.action.status,
    toStatus: "approved",
    metadata: { communicationId, revision: row.communication.revision },
  });
  revalidatePath(`/actions/${row.action.id}`);
  revalidatePath(`/jobs/${row.communication.jobId}`);
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/agent");
  return { success: "Draft approved. It has not been sent." };
}

export async function recordCommunicationHandoff(formData: FormData) {
  const ctx = await requireContext();
  const communicationId = value(formData, "communicationId"),
    method = value(formData, "method");
  const row = await ownedCommunication(ctx.workspaceId, communicationId);
  if (!row?.action || row.communication.status !== "approved") return;
  const status = method === "client" ? "opened_in_client" : "copied";
  await db
    .update(communications)
    .set({ status, updatedAt: new Date() })
    .where(eq(communications.id, communicationId));
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: ctx.workspaceId,
    actionId: row.action.id,
    type: "handoff",
    fromStatus: row.action.status,
    toStatus: row.action.status,
    metadata: { method, deliveryConfirmed: false },
  });
  revalidatePath(`/actions/${row.action.id}`);
}

export async function confirmCommunicationSent(formData: FormData) {
  const ctx = await requireContext();
  const communicationId = value(formData, "communicationId");
  const row = await ownedCommunication(ctx.workspaceId, communicationId);
  if (
    !row?.action ||
    !["approved", "copied", "opened_in_client"].includes(
      row.communication.status,
    )
  )
    return;
  await db
    .update(communications)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(communications.id, communicationId));
  const payload = row.action.payload as {
    questionIds?: string[];
    objectiveId?: string;
    interest?: string;
  };
  for (const questionId of payload.questionIds ?? [])
    await db
      .update(questions)
      .set({ status: "asked", askedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(questions.id, questionId),
          eq(questions.workspaceId, ctx.workspaceId),
        ),
      );
  await db
    .update(actions)
    .set({
      executionStatus: "succeeded",
      ...(payload.questionIds?.length
        ? {}
        : {
            status: "resolved" as const,
            resolutionReason: "completed_by_user",
            resolvedAt: new Date(),
          }),
      updatedAt: new Date(),
    })
    .where(eq(actions.id, row.action.id));
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: ctx.workspaceId,
    actionId: row.action.id,
    type: "execution_confirmed",
    fromStatus: row.action.status,
    toStatus: payload.questionIds?.length ? row.action.status : "resolved",
    metadata: { communicationId, confirmedByUser: true },
  });
  if (payload.objectiveId)
    await db
      .update(coordinationObjectives)
      .set({
        state:
          payload.interest === "no"
            ? "declined"
            : payload.questionIds?.length
              ? "awaiting_external"
              : "ready_to_advance",
        nextAction:
          payload.interest === "no"
            ? "The decline was handed off and user-confirmed as sent."
            : payload.questionIds?.length
              ? "Wait for the producer’s response, then reconcile it here."
              : "The response was sent; review the opportunity’s next booking step.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(coordinationObjectives.id, payload.objectiveId),
          eq(coordinationObjectives.workspaceId, ctx.workspaceId),
        ),
      );
  revalidatePath(`/actions/${row.action.id}`);
  revalidatePath(`/jobs/${row.communication.jobId}`);
}

export async function prepareInvoice(formData: FormData) {
  const ctx = await requireContext();
  const actionId = value(formData, "actionId");
  const [row] = await db
    .select({ action: actions, job: jobs })
    .from(actions)
    .innerJoin(jobs, eq(actions.jobId, jobs.id))
    .where(
      and(
        eq(actions.id, actionId),
        eq(actions.workspaceId, ctx.workspaceId),
        eq(jobs.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!row || row.action.kind !== "invoice") return;
  if (
    !row.job.feeCents ||
    !row.job.paymentTerms ||
    !row.job.clientOrganizationId
  )
    return;
  const [existing] = await db
    .select()
    .from(invoiceDrafts)
    .where(
      and(
        eq(invoiceDrafts.actionId, actionId),
        eq(invoiceDrafts.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!existing) {
    const [client] = row.job.clientOrganizationId
      ? await db
          .select()
          .from(organizations)
          .where(
            and(
              eq(organizations.id, row.job.clientOrganizationId),
              eq(organizations.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1)
      : [];
    await db
      .insert(invoiceDrafts)
      .values({
        id: id("invoice"),
        workspaceId: ctx.workspaceId,
        jobId: row.job.id,
        actionId,
        status: "ready",
        lineItems: row.job.feeCents
          ? [
              {
                description: `Creative fee — ${row.job.title}`,
                amountCents: row.job.feeCents,
              },
            ]
          : [],
        billingName: client?.name ?? null,
        paymentTerms: row.job.paymentTerms,
      })
      .onConflictDoNothing({ target: invoiceDrafts.actionId });
  }
  await db
    .update(jobs)
    .set({ invoiceStatus: "ready", updatedAt: new Date() })
    .where(and(eq(jobs.id, row.job.id), eq(jobs.workspaceId, ctx.workspaceId)));
  await db
    .update(actions)
    .set({
      title: "Invoice ready for review",
      status: "pending_approval",
      resolutionReason: null,
      resolvedAt: null,
      executionStatus: "succeeded",
      requiresApproval: true,
      updatedAt: new Date(),
    })
    .where(eq(actions.id, actionId));
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: ctx.workspaceId,
    actionId,
    type: "invoice_prepared",
    fromStatus: row.action.status,
    toStatus: "pending_approval",
    reason: "source_backed_fields_complete",
    metadata: { externalDelivery: false },
  });
  revalidatePath(`/actions/${actionId}`);
  revalidatePath(`/jobs/${row.job.id}`);
  revalidatePath("/");
}

export async function saveInvoiceDraft(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const draftId = value(formData, "draftId");
  const [draft] = await db
    .select()
    .from(invoiceDrafts)
    .where(
      and(
        eq(invoiceDrafts.id, draftId),
        eq(invoiceDrafts.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!draft) return { error: "Invoice draft not found." };
  const amount = Number(value(formData, "amount"));
  const description = value(formData, "description");
  if (!description || !Number.isFinite(amount) || amount < 0)
    return { error: "Add a valid line-item description and amount." };
  await db
    .update(invoiceDrafts)
    .set({
      billingName: value(formData, "billingName") || null,
      billingEmail: value(formData, "billingEmail") || null,
      paymentTerms: value(formData, "paymentTerms") || null,
      notes: value(formData, "notes") || null,
      lineItems: [{ description, amountCents: Math.round(amount * 100) }],
      updatedAt: new Date(),
    })
    .where(eq(invoiceDrafts.id, draft.id));
  revalidatePath(`/actions/${draft.actionId}`);
  revalidatePath(`/jobs/${draft.jobId}`);
  return { success: "Invoice draft saved. Nothing was issued or sent." };
}

export async function approveInvoiceDraft(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const draftId = value(formData, "draftId");
  const [row] = await db
    .select({ draft: invoiceDrafts, action: actions })
    .from(invoiceDrafts)
    .innerJoin(actions, eq(invoiceDrafts.actionId, actions.id))
    .where(
      and(
        eq(invoiceDrafts.id, draftId),
        eq(invoiceDrafts.workspaceId, ctx.workspaceId),
        eq(actions.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!row) return { error: "Invoice draft not found." };
  const missing = [
    !row.draft.billingName && "billing client",
    !row.draft.paymentTerms && "payment terms",
    !row.draft.lineItems.length && "line item",
  ].filter(Boolean);
  if (missing.length)
    return { error: `Complete ${missing.join(", ")} before approval.` };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(invoiceDrafts)
      .set({ status: "approved", updatedAt: now })
      .where(eq(invoiceDrafts.id, draftId));
    await tx
      .update(actions)
      .set({
        status: "approved",
        approvedAt: now,
        approvedByUserId: ctx.userId,
        updatedAt: now,
      })
      .where(eq(actions.id, row.action.id));
    await tx.insert(actionEvents).values({
      id: id("aev"),
      workspaceId: ctx.workspaceId,
      actionId: row.action.id,
      type: "invoice_approved",
      fromStatus: row.action.status,
      toStatus: "approved",
      metadata: { draftId, issued: false, sent: false },
    });
  });
  revalidatePath(`/actions/${row.action.id}`);
  revalidatePath(`/jobs/${row.draft.jobId}`);
  revalidatePath("/");
  return { success: "Invoice draft approved. It has not been issued or sent." };
}
