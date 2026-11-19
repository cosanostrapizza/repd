import { and, eq } from "drizzle-orm";
import { db, id } from "@/db/client";
import {
  actionEvents,
  actions,
  coordinationDateOptions,
  coordinationObjectives,
  holds,
  invoiceDrafts,
  jobs,
  organizations,
  questions,
} from "@/db/schema";

type Rule = {
  key: string;
  kind: string;
  title: string;
  explanation: string;
  recommendation: string;
  priority: "urgent" | "blocking" | "routine" | "optional";
  condition: { type: string; field?: string; value?: string };
  prepared?: string;
  approval?: boolean;
  payload?: Record<string, unknown>;
};

function rulesFor(
  job: typeof jobs.$inferSelect,
  hasInquiryObjective: boolean,
  hasKnownDateOptions: boolean,
): Rule[] {
  const rules: Rule[] = [];
  if (
    job.lifecycleStatus === "inquiry" &&
    !job.usageTerms &&
    !hasInquiryObjective
  )
    rules.push({
      key: `missing-usage:${job.id}`,
      kind: "missing_information",
      title: "Confirm usage rights",
      explanation:
        "Usage and licensing terms are needed before you can evaluate the fee.",
      recommendation: "Review the prepared note, then contact the producer.",
      priority: "blocking",
      condition: { type: "job_field_present", field: "usageTerms" },
      approval: true,
      prepared: `Hi — Thanks for sharing the details for ${job.title}. Could you confirm the intended usage, media, territory, and term? Once I have that, I can review the scope and fee properly.`,
    });
  if (
    job.lifecycleStatus === "inquiry" &&
    !job.shootStart &&
    !job.shootDate &&
    !hasKnownDateOptions &&
    !hasInquiryObjective
  )
    rules.push({
      key: `missing-date:${job.id}`,
      kind: "missing_information",
      title: "Confirm shoot date",
      explanation:
        "The shoot date is still missing, so availability cannot be held.",
      recommendation: "Add the date once the producer confirms it.",
      priority: "blocking",
      condition: { type: "job_field_present", field: "shootStart" },
    });
  if (
    job.lifecycleStatus === "completed" &&
    !["sent", "paid"].includes(job.invoiceStatus)
  ) {
    const missing = [
      !job.feeCents && "agreed fee",
      !job.paymentTerms && "payment terms",
      !job.clientOrganizationId && "billing client",
    ].filter((value): value is string => Boolean(value));
    rules.push({
      key: `invoice-ready:${job.id}`,
      kind: "invoice",
      title: missing.length ? "Complete invoice details" : "Invoice ready for review",
      explanation: missing.length
        ? `${job.title} cannot be prepared for invoicing until ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} recorded.`
        : `Repd can prepare an internal invoice draft from the agreed fee, billing client, and payment terms.`,
      recommendation: missing.length
        ? `Record the missing ${missing.join(", ")} without inventing commercial terms.`
        : "Review the prepared invoice draft. Issuance and delivery still require approval.",
      priority: "routine",
      condition: {
        type: "job_field_equals",
        field: "invoiceStatus",
        value: "sent",
      },
      approval: !missing.length,
      payload: { missingFields: missing },
    });
  }
  return rules;
}

function overlapping(a: typeof holds.$inferSelect, b: typeof holds.$inferSelect) {
  return a.jobId !== b.jobId && a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

function conflictGroups(activeHolds: Array<typeof holds.$inferSelect>) {
  const remaining = new Set(activeHolds.map((hold) => hold.id));
  const byId = new Map(activeHolds.map((hold) => [hold.id, hold]));
  const groups: Array<Array<typeof holds.$inferSelect>> = [];
  while (remaining.size) {
    const firstId = remaining.values().next().value as string;
    const queue = [byId.get(firstId)!];
    const component: Array<typeof holds.$inferSelect> = [];
    remaining.delete(firstId);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const candidateId of [...remaining]) {
        const candidate = byId.get(candidateId)!;
        if (overlapping(current, candidate)) {
          remaining.delete(candidateId);
          queue.push(candidate);
        }
      }
    }
    if (new Set(component.map((hold) => hold.jobId)).size > 1)
      groups.push(component);
  }
  return groups;
}

async function prepareSafeInvoiceDrafts(workspaceId: string) {
  const candidates = await db
    .select({ action: actions, job: jobs, client: organizations })
    .from(actions)
    .innerJoin(jobs, eq(actions.jobId, jobs.id))
    .leftJoin(organizations, eq(jobs.clientOrganizationId, organizations.id))
    .where(
      and(eq(actions.workspaceId, workspaceId), eq(actions.kind, "invoice")),
    );
  for (const { action, job, client } of candidates) {
    if (
      action.status === "resolved" ||
      job.lifecycleStatus !== "completed" ||
      !job.feeCents ||
      !job.paymentTerms ||
      !client
    )
      continue;
    const agreedFeeCents = job.feeCents;
    const [existing] = await db
      .select()
      .from(invoiceDrafts)
      .where(
        and(
          eq(invoiceDrafts.workspaceId, workspaceId),
          eq(invoiceDrafts.actionId, action.id),
        ),
      )
      .limit(1);
    if (!existing) {
      const created = await db.transaction(async (tx) => {
        const inserted = await tx
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
                amountCents: agreedFeeCents,
              },
            ],
            billingName: client.name,
            paymentTerms: job.paymentTerms,
          })
          .onConflictDoNothing({ target: invoiceDrafts.actionId })
          .returning({ id: invoiceDrafts.id });
        if (!inserted.length) return false;
        await tx
          .update(jobs)
          .set({ invoiceStatus: "ready", updatedAt: new Date() })
          .where(eq(jobs.id, job.id));
        await tx
          .update(actions)
          .set({
            title: "Invoice ready for review",
            status: "pending_approval",
            executionStatus: "succeeded",
            requiresApproval: true,
            updatedAt: new Date(),
          })
          .where(eq(actions.id, action.id));
        return true;
      });
      if (created) await db.insert(actionEvents).values({
        id: id("aev"),
        workspaceId,
        actionId: action.id,
        type: "invoice_prepared_automatically",
        fromStatus: action.status,
        toStatus: "pending_approval",
        reason: "source_backed_fields_complete",
        metadata: { externalDelivery: false },
      });
    }
  }
}

export async function reevaluateWorkspace(workspaceId: string) {
  const allJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.workspaceId, workspaceId));
  const activeHolds = await db
    .select()
    .from(holds)
    .where(and(eq(holds.workspaceId, workspaceId), eq(holds.status, "active")));
  const [objectives, dateOptions] = await Promise.all([
    db
      .select()
      .from(coordinationObjectives)
      .where(eq(coordinationObjectives.workspaceId, workspaceId)),
    db
      .select()
      .from(coordinationDateOptions)
      .where(eq(coordinationDateOptions.workspaceId, workspaceId)),
  ]);
  const desired = new Map<string, Rule & { jobId: string }>();
  const jobById = new Map(allJobs.map((job) => [job.id, job]));
  for (const group of conflictGroups(activeHolds)) {
    const holdIds = group.map((hold) => hold.id).sort();
    const jobIds = [...new Set(group.map((hold) => hold.jobId))].sort();
    const conflictJobs = jobIds
      .map((jobId) => jobById.get(jobId))
      .filter((job): job is typeof jobs.$inferSelect => Boolean(job));
    if (!conflictJobs.length) continue;
    const startsAt = group.reduce(
      (earliest, hold) => (hold.startsAt < earliest ? hold.startsAt : earliest),
      group[0].startsAt,
    );
    const date = startsAt.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    const title = `Scheduling conflict — ${date}`;
    const names = conflictJobs.map((job) => job.title);
    desired.set(`hold-conflict:${holdIds.join(":")}`, {
      key: `hold-conflict:${holdIds.join(":")}`,
      kind: "hold_conflict",
      title,
      explanation: `${names.join(" and ")} have overlapping active holds. Decide which takes priority.`,
      recommendation: "Review both jobs, hold rank, and booking status before authorizing a change.",
      priority: "urgent",
      condition: { type: "no_hold_conflict" },
      payload: { holdIds, jobIds },
      jobId: conflictJobs[0].id,
    });
  }
  for (const job of allJobs) {
    const hasInquiryObjective = objectives.some(
      (objective) =>
        objective.jobId === job.id &&
        objective.kind === "advance_inquiry" &&
        !["completed", "declined"].includes(objective.state),
    );
    const hasKnownDateOptions = dateOptions.some(
      (option) => option.jobId === job.id,
    );
    for (const rule of rulesFor(
      job,
      hasInquiryObjective,
      hasKnownDateOptions,
    ))
      desired.set(rule.key, { ...rule, jobId: job.id });
  }
  const existing = await db
    .select()
    .from(actions)
    .where(eq(actions.workspaceId, workspaceId));
  for (const action of existing.filter(
    (item) =>
      item.kind === "producer_coordination" && item.status !== "resolved",
  )) {
    const payload = action.payload as {
      questionIds?: string[];
      fieldKeys?: string[];
    };
    for (const fieldKey of payload.fieldKeys ?? [])
      desired.delete(
        `missing-${fieldKey === "usageTerms" ? "usage" : fieldKey === "shootStart" ? "date" : fieldKey}:${action.jobId}`,
      );
    if (payload.questionIds?.length) {
      const related = await db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.workspaceId, workspaceId),
            eq(questions.jobId, action.jobId!),
          ),
        );
      const allAnswered = payload.questionIds.every((questionId) =>
        related.some(
          (question) =>
            question.id === questionId &&
            ["answered", "obsolete"].includes(question.status),
        ),
      );
      if (allAnswered) {
        await db
          .update(actions)
          .set({
            status: "resolved",
            resolutionReason: "condition_satisfied",
            resolvedAt: new Date(),
            reevaluatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(actions.id, action.id));
        await db.insert(actionEvents).values({
          id: id("aev"),
          workspaceId,
          actionId: action.id,
          type: "resolved",
          fromStatus: action.status,
          toStatus: "resolved",
          reason: "condition_satisfied",
        });
      }
    }
  }
  for (const rule of desired.values()) {
    const found = existing.find((a) => a.deduplicationKey === rule.key);
    if (!found)
      await db.insert(actions).values({
        id: id("act"),
        workspaceId,
        jobId: rule.jobId,
        kind: rule.kind,
        title: rule.title,
        explanation: rule.explanation,
        recommendation: rule.recommendation,
        priority: rule.priority,
        deduplicationKey: rule.key,
        resolutionCondition: rule.condition,
        requiresApproval: rule.approval ?? false,
        preparedContent: rule.prepared,
        payload: rule.payload ?? {},
        reevaluatedAt: new Date(),
      });
    else if (
      found.status === "resolved" &&
      found.resolutionReason === "condition_satisfied"
    )
      await db
        .update(actions)
        .set({
          status: "open",
          resolvedAt: null,
          resolutionReason: null,
          reevaluatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(actions.id, found.id));
    else
      await db
        .update(actions)
        .set({
          title: rule.title,
          explanation: rule.explanation,
          recommendation: rule.recommendation,
          priority: rule.priority,
          payload: rule.payload ?? found.payload,
          requiresApproval: rule.approval ?? found.requiresApproval,
          reevaluatedAt: new Date(),
        })
        .where(eq(actions.id, found.id));
  }
  const deterministicKinds = new Set([
    "hold_conflict",
    "missing_information",
    "invoice",
  ]);
  for (const action of existing.filter(
    (a) =>
      deterministicKinds.has(a.kind) &&
      !desired.has(a.deduplicationKey) &&
      a.status !== "resolved",
  )) {
    await db
      .update(actions)
      .set({
        status: "resolved",
        resolutionReason: "condition_satisfied",
        resolvedAt: new Date(),
        reevaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(actions.id, action.id));
    await db.insert(actionEvents).values({
      id: id("aev"),
      workspaceId,
      actionId: action.id,
      type: "resolved",
      fromStatus: action.status,
      toStatus: "resolved",
      reason: "condition_satisfied",
    });
  }
  await prepareSafeInvoiceDrafts(workspaceId);
}
