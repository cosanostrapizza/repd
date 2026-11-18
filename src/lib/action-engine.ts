import { and, eq } from "drizzle-orm";
import { db, id } from "@/db/client";
import { actionEvents, actions, holds, jobs, questions } from "@/db/schema";

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
};

function rulesFor(job: typeof jobs.$inferSelect, hasConflict: boolean): Rule[] {
  const rules: Rule[] = [];
  if (hasConflict)
    rules.push({
      key: `hold-conflict:${job.id}`,
      kind: "hold_conflict",
      title: "Resolve competing hold",
      explanation: `${job.title} overlaps another active booking.`,
      recommendation: "Review both holds and decide which client has priority.",
      priority: "urgent",
      condition: { type: "no_hold_conflict" },
    });
  if (job.lifecycleStatus === "inquiry" && !job.usageTerms)
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
  if (job.lifecycleStatus === "inquiry" && !job.shootStart)
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
  if (job.lifecycleStatus === "completed" && job.invoiceStatus === "not_ready")
    rules.push({
      key: `invoice-ready:${job.id}`,
      kind: "invoice",
      title: "Prepare invoice",
      explanation: `${job.title} is complete and has not been invoiced.`,
      recommendation:
        "Review the fee and payment terms, then mark the invoice ready.",
      priority: "routine",
      condition: {
        type: "job_field_equals",
        field: "invoiceStatus",
        value: "not_ready",
      },
    });
  return rules;
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
  const desired = new Map<string, Rule & { jobId: string }>();
  for (const job of allJobs) {
    const mine = activeHolds.filter((h) => h.jobId === job.id);
    const conflict = mine.some((a) =>
      activeHolds.some(
        (b) =>
          b.jobId !== job.id && a.startsAt < b.endsAt && a.endsAt > b.startsAt,
      ),
    );
    for (const rule of rulesFor(job, conflict))
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
        .set({ reevaluatedAt: new Date() })
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
}
