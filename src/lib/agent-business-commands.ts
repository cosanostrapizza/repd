import "server-only";

import { and, eq } from "drizzle-orm";
import { db, id } from "@/db/client";
import {
  actionEvents,
  actions,
  communications,
  invoiceDrafts,
  jobParticipants,
  jobs,
  organizations,
  people,
  type Action,
} from "@/db/schema";

export type PreparedCommunicationInput = {
  workspaceId: string;
  userId: string;
  jobId: string;
  personId: string;
  subject: string;
  body: string;
  purpose: string;
  idempotencyKey: string;
  requiredConditionalText?: string | null;
};

export async function prepareAgentCommunication(
  input: PreparedCommunicationInput,
) {
  const required = input.requiredConditionalText?.trim();
  if (required && !input.body.includes(required))
    throw new Error(
      "The prepared message did not preserve the required conditional position verbatim.",
    );
  const [ownedJob] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId)),
    )
    .limit(1);
  if (!ownedJob) throw new Error("Job not found in this workspace.");
  const [recipient] = await db
    .select({ id: people.id })
    .from(jobParticipants)
    .innerJoin(people, eq(jobParticipants.personId, people.id))
    .where(
      and(
        eq(jobParticipants.workspaceId, input.workspaceId),
        eq(jobParticipants.jobId, input.jobId),
        eq(people.id, input.personId),
        eq(people.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!recipient)
    throw new Error("Recipient is not a participant in this workspace job.");
  const deduplicationKey = `agent-communication:${input.idempotencyKey}`;
  const [existing] = await db
    .select({ action: actions, communication: communications })
    .from(actions)
    .leftJoin(communications, eq(communications.actionId, actions.id))
    .where(
      and(
        eq(actions.workspaceId, input.workspaceId),
        eq(actions.deduplicationKey, deduplicationKey),
      ),
    )
    .limit(1);
  if (existing?.communication)
    return {
      action: existing.action,
      communication: existing.communication,
      created: false,
    };

  return db.transaction(async (tx) => {
    const actionId = id("action");
    const communicationId = id("communication");
    const [action] = await tx
      .insert(actions)
      .values({
        id: actionId,
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        personId: input.personId,
        kind: "producer_communication",
        title: "Producer message ready for approval",
        explanation: input.purpose,
        recommendation: "Review and approve the draft. Nothing has been sent.",
        priority: "blocking",
        status: "pending_approval",
        executionStatus: "succeeded",
        deduplicationKey,
        idempotencyKey: input.idempotencyKey,
        payload: {
          purpose: input.purpose,
          communicationId,
          requiredConditionalText: required ?? null,
          externalDelivery: false,
        },
        resolutionCondition: { type: "communication_sent" },
        requiresApproval: true,
        preparedContent: input.body,
      })
      .onConflictDoNothing({
        target: [actions.workspaceId, actions.deduplicationKey],
      })
      .returning();
    if (!action) {
      const [raced] = await tx
        .select({ action: actions, communication: communications })
        .from(actions)
        .leftJoin(communications, eq(communications.actionId, actions.id))
        .where(
          and(
            eq(actions.workspaceId, input.workspaceId),
            eq(actions.deduplicationKey, deduplicationKey),
          ),
        )
        .limit(1);
      if (!raced?.communication)
        throw new Error("Draft preparation was claimed by another request.");
      return {
        action: raced.action,
        communication: raced.communication,
        created: false,
      };
    }
    const [communication] = await tx
      .insert(communications)
      .values({
        id: communicationId,
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        actionId,
        recipientPersonId: input.personId,
        subject: input.subject,
        body: input.body,
        status: "draft",
      })
      .returning();
    await tx.insert(actionEvents).values({
      id: id("aev"),
      workspaceId: input.workspaceId,
      actionId,
      type: "agent_communication_prepared",
      fromStatus: null,
      toStatus: "pending_approval",
      reason: "explicit_user_instruction",
      metadata: {
        communicationId,
        externalDelivery: false,
        userId: input.userId,
      },
    });
    return { action, communication, created: true };
  });
}

export async function createConditionalFollowUp(input: {
  workspaceId: string;
  jobId: string;
  personId?: string | null;
  communicationId?: string | null;
  dueAt: Date;
  expectedEvent: string;
  nextAction: string;
  idempotencyKey: string;
}) {
  const [ownedJob] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(eq(jobs.id, input.jobId), eq(jobs.workspaceId, input.workspaceId)),
    )
    .limit(1);
  if (!ownedJob) throw new Error("Job not found in this workspace.");
  if (input.communicationId) {
    const [ownedCommunication] = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.id, input.communicationId),
          eq(communications.workspaceId, input.workspaceId),
          eq(communications.jobId, input.jobId),
        ),
      )
      .limit(1);
    if (!ownedCommunication)
      throw new Error(
        "The related communication is not part of this workspace job.",
      );
  }
  const deduplicationKey = `agent-follow-up:${input.idempotencyKey}`;
  const [existing] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, input.workspaceId),
        eq(actions.deduplicationKey, deduplicationKey),
      ),
    )
    .limit(1);
  if (existing) return { action: existing, created: false };
  const [action] = await db
    .insert(actions)
    .values({
      id: id("action"),
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      personId: input.personId ?? null,
      kind: "conditional_follow_up",
      title: `Follow up if no response: ${input.expectedEvent}`,
      explanation: `Evaluate Repd’s recorded communications at the deadline. Expected: ${input.expectedEvent}.`,
      recommendation: input.nextAction,
      priority: "blocking",
      status: "deferred",
      executionStatus: "not_requested",
      deferredUntil: input.dueAt,
      deduplicationKey,
      idempotencyKey: input.idempotencyKey,
      payload: {
        trigger: "no_recorded_reply_by_deadline",
        communicationId: input.communicationId ?? null,
        expectedEvent: input.expectedEvent,
        nextAction: input.nextAction,
        monitoringScope: "repd_records_only",
      },
      resolutionCondition: { type: "recorded_reply_or_user_resolution" },
      requiresApproval: false,
    })
    .onConflictDoNothing({
      target: [actions.workspaceId, actions.deduplicationKey],
    })
    .returning();
  if (action) {
    await db.insert(actionEvents).values({
      id: id("aev"),
      workspaceId: input.workspaceId,
      actionId: action.id,
      type: "conditional_follow_up_created",
      fromStatus: null,
      toStatus: "deferred",
      metadata: {
        dueAt: input.dueAt.toISOString(),
        communicationId: input.communicationId ?? null,
      },
    });
    return { action, created: true };
  }
  const [raced] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, input.workspaceId),
        eq(actions.deduplicationKey, deduplicationKey),
      ),
    )
    .limit(1);
  if (!raced) throw new Error("Follow-up creation failed.");
  return { action: raced, created: false };
}

export async function prepareReadyInvoiceDrafts(workspaceId: string) {
  const eligible = await db
    .select({ job: jobs, client: organizations })
    .from(jobs)
    .leftJoin(organizations, eq(jobs.clientOrganizationId, organizations.id))
    .where(eq(jobs.workspaceId, workspaceId));
  const prepared: Array<{
    jobId: string;
    jobTitle: string;
    actionId: string;
    draftId: string;
  }> = [];
  const ineligible: Array<{
    jobId: string;
    jobTitle: string;
    missing: string[];
  }> = [];
  for (const { job, client } of eligible.filter(
    ({ job }) =>
      job.lifecycleStatus === "completed" &&
      !["sent", "paid"].includes(job.invoiceStatus),
  )) {
    const missing = [
      !job.feeCents && "agreed fee",
      !job.paymentTerms && "payment terms",
      !client && "billing client",
    ].filter((v): v is string => Boolean(v));
    if (missing.length) {
      ineligible.push({ jobId: job.id, jobTitle: job.title, missing });
      continue;
    }
    const key = `invoice-ready:${job.id}`;
    let [action] = await db
      .select()
      .from(actions)
      .where(
        and(
          eq(actions.workspaceId, workspaceId),
          eq(actions.deduplicationKey, key),
        ),
      )
      .limit(1);
    if (!action) {
      [action] = await db
        .insert(actions)
        .values({
          id: id("action"),
          workspaceId,
          jobId: job.id,
          kind: "invoice",
          title: "Invoice ready for review",
          explanation:
            "Prepared from the agreed fee, billing client, and payment terms.",
          recommendation: "Review before issuance.",
          priority: "routine",
          status: "pending_approval",
          executionStatus: "succeeded",
          deduplicationKey: key,
          payload: { externalDelivery: false },
          resolutionCondition: {
            type: "job_field_equals",
            field: "invoiceStatus",
            value: "sent",
          },
          requiresApproval: true,
        })
        .onConflictDoNothing({
          target: [actions.workspaceId, actions.deduplicationKey],
        })
        .returning();
    }
    if (!action)
      [action] = await db
        .select()
        .from(actions)
        .where(
          and(
            eq(actions.workspaceId, workspaceId),
            eq(actions.deduplicationKey, key),
          ),
        )
        .limit(1);
    if (!action)
      throw new Error(`Could not claim invoice preparation for ${job.title}.`);
    let [draft] = await db
      .select()
      .from(invoiceDrafts)
      .where(eq(invoiceDrafts.actionId, action.id))
      .limit(1);
    if (!draft)
      [draft] = await db
        .insert(invoiceDrafts)
        .values({
          id: id("invoice"),
          workspaceId,
          jobId: job.id,
          actionId: action.id,
          status: "ready",
          lineItems: [
            {
              description: `Creative fee — ${job.title}`,
              amountCents: job.feeCents!,
            },
          ],
          billingName: client!.name,
          paymentTerms: job.paymentTerms,
        })
        .onConflictDoNothing({ target: invoiceDrafts.actionId })
        .returning();
    if (!draft)
      [draft] = await db
        .select()
        .from(invoiceDrafts)
        .where(eq(invoiceDrafts.actionId, action.id))
        .limit(1);
    if (draft)
      prepared.push({
        jobId: job.id,
        jobTitle: job.title,
        actionId: action.id,
        draftId: draft.id,
      });
    if (draft && job.invoiceStatus !== "ready")
      await db
        .update(jobs)
        .set({ invoiceStatus: "ready", updatedAt: new Date() })
        .where(and(eq(jobs.id, job.id), eq(jobs.workspaceId, workspaceId)));
  }
  return { prepared, ineligible };
}

export type AgentCommandAction = Action;
