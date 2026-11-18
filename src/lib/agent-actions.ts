"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, id } from "@/db/client";
import {
  actionEvents,
  actions,
  communications,
  intakeReviews,
  invoiceDrafts,
  jobs,
  organizations,
  questions,
} from "@/db/schema";
import { getAIConfiguration } from "./ai/provider";
import {
  acceptIntakeReview,
  createAndAnalyzeIntake,
  rewriteCommunication,
} from "./services/intake";
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
  redirect(`/inquiries/review/${reviewId}`);
}

export async function acceptReviewAction(
  _: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const ctx = await requireContext();
  const reviewId = value(formData, "reviewId");
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
      preparedSubject: value(formData, "preparedSubject"),
      preparedBody: value(formData, "preparedBody"),
    });
    revalidatePath("/");
    revalidatePath("/jobs");
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not accept this review.",
    };
  }
  redirect(`/jobs/${acceptedJobId}`);
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

export async function approveCommunication(formData: FormData) {
  const ctx = await requireContext();
  const communicationId = value(formData, "communicationId");
  const row = await ownedCommunication(ctx.workspaceId, communicationId);
  if (!row?.action) return;
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
  const payload = row.action.payload as { questionIds?: string[] };
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
    await db.insert(invoiceDrafts).values({
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
    });
  }
  await db
    .update(jobs)
    .set({ invoiceStatus: "ready", updatedAt: new Date() })
    .where(and(eq(jobs.id, row.job.id), eq(jobs.workspaceId, ctx.workspaceId)));
  await db
    .update(actions)
    .set({
      status: "resolved",
      resolutionReason: "completed_by_user",
      resolvedAt: new Date(),
      executionStatus: "not_requested",
      updatedAt: new Date(),
    })
    .where(eq(actions.id, actionId));
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: ctx.workspaceId,
    actionId,
    type: "invoice_prepared",
    fromStatus: row.action.status,
    toStatus: "resolved",
    reason: "completed_by_user",
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
