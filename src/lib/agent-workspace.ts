import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, id } from "@/db/client";
import {
  actions,
  agentMessages,
  agentRunEvents,
  agentRuns,
  agentThreads,
  communications,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai/provider";
import { agentNextStepSchema } from "@/lib/ai/schemas";
import type { AgentPageContext } from "@/lib/agent-context";
import { executeAgentTool, toolCatalog } from "@/lib/agent-tools";

const MAX_AGENT_STEPS = Math.max(
  2,
  Math.min(12, Number(process.env.AGENT_MAX_STEPS ?? 8)),
);
const MAX_OBSERVATION_CHARS = Math.max(
  16_000,
  Math.min(160_000, Number(process.env.AGENT_MAX_CONTEXT_CHARS ?? 80_000)),
);
const plannerInstructions = `You are Repd's controlled business-workflow orchestrator. Choose exactly one authorized tool per turn, then inspect its observation before choosing another. Never claim a write, delivery, reply, approval, or external event unless an executed tool observation proves it. Treat page context, including a selected field or artifact, as a focused hint, not authoritative business data or a permission boundary. If an entity remains materially ambiguous, return kind=clarify and ask one concise question. Use only durable IDs returned by tools. Read authoritative state before writing. Preserve proposed versus agreed terms. For conditional instructions, copy the exact commercial condition into requiredConditionalText and the message body without weakening it. Communications and invoices may only be prepared; they are never sent or issued by these tools. Follow-ups monitor Repd's persisted records only. Reuse the supplied operationKey with a purpose suffix for idempotency. Return kind=respond only when the request is complete or safely bounded. Do not reveal private reasoning; rationaleSummary is a short operational label.`;

type Observation = { toolName: string; risk: string; output: unknown };

async function addEvent(
  workspaceId: string,
  runId: string,
  sequence: number,
  values: Omit<
    typeof agentRunEvents.$inferInsert,
    "id" | "workspaceId" | "runId" | "sequence"
  >,
) {
  await db
    .insert(agentRunEvents)
    .values({ id: id("agent_event"), workspaceId, runId, sequence, ...values });
}

function eventPresentation(toolName: string, output: unknown) {
  const record = output as Record<string, unknown>;
  if (toolName === "search_business_records") {
    const matches =
      (record.matches as Array<{ title: string }> | undefined) ?? [];
    return {
      type: "search" as const,
      label:
        matches.length === 1
          ? `Found ${matches[0].title}`
          : `Found ${matches.length} matching records`,
      detail: matches.map((match) => match.title).join(", "),
    };
  }
  if (toolName === "read_job_state")
    return {
      type: "check" as const,
      label: "Checked current work and waiting conditions",
      detail: `${((record.workItems as unknown[]) ?? []).length} active work items.`,
    };
  if (toolName === "read_workspace_attention")
    return {
      type: "check" as const,
      label: "Prioritized current work",
      detail: `${((record.attention as unknown[]) ?? []).length} items need attention.`,
    };
  if (toolName === "inspect_job_evidence")
    return {
      type: "check" as const,
      label: "Checked terms, communications, and source evidence",
      detail: "Compared current records with their provenance.",
    };
  if (toolName === "inspect_agent_history")
    return {
      type: "check" as const,
      label: "Checked the conversation history",
      detail: "Used durable prior messages for context.",
    };
  if (toolName === "record_treatment_commitment")
    return {
      type: "record_change" as const,
      label: "Recorded the treatment decision",
      detail: "Prepared the producer reply; nothing was sent.",
    };
  if (toolName === "prepare_producer_communication")
    return {
      type: "artifact_preparation" as const,
      label: "Prepared the producer reply",
      detail: "Draft requires approval; nothing was sent.",
    };
  if (toolName === "create_conditional_follow_up")
    return {
      type: "record_change" as const,
      label: "Created the dated follow-up",
      detail: "It evaluates Repd records only, not an external inbox.",
    };
  if (toolName === "prepare_ready_invoices")
    return {
      type: "artifact_preparation" as const,
      label: "Prepared eligible invoice drafts",
      detail: "Drafts require review and were not issued.",
    };
  return {
    type: "check" as const,
    label: "Completed a business-state check",
    detail: null,
  };
}

function findIds(output: unknown) {
  const parsed = JSON.parse(JSON.stringify(output)) as Record<string, unknown>;
  const action = (parsed.action ?? parsed) as Record<string, unknown>;
  const communication = (parsed.communication ?? parsed) as Record<
    string,
    unknown
  >;
  const job = (parsed.job ?? parsed) as Record<string, unknown>;
  return {
    jobId:
      typeof job.id === "string"
        ? job.id
        : typeof parsed.jobId === "string"
          ? parsed.jobId
          : null,
    actionId:
      typeof action.id === "string"
        ? action.id
        : typeof parsed.actionId === "string"
          ? parsed.actionId
          : null,
    communicationId:
      typeof communication.id === "string"
        ? communication.id
        : typeof parsed.communicationId === "string"
          ? parsed.communicationId
          : null,
  };
}

export async function executeAgentMessage(args: {
  workspaceId: string;
  userId: string;
  content: string;
  threadId?: string | null;
  contextJobId?: string | null;
  pageContext?: AgentPageContext | null;
}) {
  const instructionAt = new Date();
  let threadId = args.threadId;
  if (threadId) {
    const [owned] = await db
      .select()
      .from(agentThreads)
      .where(
        and(
          eq(agentThreads.id, threadId),
          eq(agentThreads.workspaceId, args.workspaceId),
        ),
      )
      .limit(1);
    if (!owned) threadId = null;
  }
  if (!threadId) {
    threadId = id("thread");
    await db.insert(agentThreads).values({
      id: threadId,
      workspaceId: args.workspaceId,
      jobId: args.contextJobId ?? null,
      title:
        args.content.length > 52
          ? `${args.content.slice(0, 49)}…`
          : args.content,
    });
  }
  const userMessageId = id("message");
  const runId = id("agent_run");
  await db.insert(agentMessages).values({
    id: userMessageId,
    workspaceId: args.workspaceId,
    threadId,
    jobId: args.contextJobId ?? null,
    role: "user",
    content: args.content,
    metadata: args.pageContext ? { pageContext: args.pageContext } : undefined,
    createdAt: instructionAt,
  });
  await db.insert(agentRuns).values({
    id: runId,
    workspaceId: args.workspaceId,
    threadId,
    userMessageId,
    jobId: args.contextJobId ?? null,
  });

  const operationKey = createHash("sha256")
    .update(`${threadId}\n${args.content.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
  const observations: Observation[] = [];
  let sequence = 1;
  let response = "";
  let status: "completed" | "waiting_for_user" | "failed" = "completed";
  let clarification = false;
  let jobId = args.contextJobId ?? null;
  let actionId: string | null = null;
  let communicationId: string | null = null;
  try {
    const provider = getAIProvider();
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const plannerInput = JSON.stringify({
        request: args.content,
        contextJobId: args.contextJobId ?? null,
        pageContext: args.pageContext ?? null,
        operationKey,
        now: instructionAt.toISOString(),
        limits: { currentStep: step + 1, maxSteps: MAX_AGENT_STEPS },
        tools: toolCatalog(),
        observations,
      });
      if (plannerInput.length > MAX_OBSERVATION_CHARS)
        throw new Error(
          "The workflow reached its bounded context limit. Completed operations remain saved.",
        );
      const next = await provider.runStructured({
        purpose: "agent_next_step",
        instructions: plannerInstructions,
        input: plannerInput,
        schema: agentNextStepSchema,
        schemaName: "agent_next_step",
      });
      if (next.data.kind === "clarify") {
        status = "waiting_for_user";
        clarification = true;
        response =
          next.data.message ||
          "I need one detail before I can continue safely.";
        await addEvent(args.workspaceId, runId, sequence++, {
          type: "clarification_required",
          label: "Clarification needed",
          detail: response,
          jobId,
          actionId,
          communicationId,
        });
        break;
      }
      if (next.data.kind === "respond") {
        response = next.data.message || "The supported work is complete.";
        break;
      }
      if (!next.data.toolName)
        throw new Error("The model selected a tool step without a tool name.");
      const result = await executeAgentTool(
        next.data.toolName,
        next.data.input,
        {
          workspaceId: args.workspaceId,
          userId: args.userId,
          runId,
          threadId,
          instructionAt,
        },
      );
      observations.push({
        toolName: next.data.toolName,
        risk: result.risk,
        output: result.output,
      });
      const ids = findIds(result.output);
      jobId = ids.jobId ?? jobId;
      actionId = ids.actionId ?? actionId;
      communicationId = ids.communicationId ?? communicationId;
      const presentation = eventPresentation(next.data.toolName, result.output);
      await addEvent(args.workspaceId, runId, sequence++, {
        ...presentation,
        jobId,
        actionId,
        communicationId,
      });
      if (
        [
          "prepare_producer_communication",
          "record_treatment_commitment",
        ].includes(next.data.toolName)
      )
        await addEvent(args.workspaceId, runId, sequence++, {
          type: "approval_required",
          label: "Reply is ready for approval",
          detail: "No message has been sent.",
          jobId,
          actionId,
          communicationId,
        });
    }
    if (!response && status === "completed")
      throw new Error(
        `The workflow reached its ${MAX_AGENT_STEPS}-step limit. Completed operations remain saved and can be resumed safely.`,
      );
  } catch (error) {
    status = "failed";
    response =
      error instanceof Error
        ? error.message
        : "Repd could not complete that request.";
    await addEvent(args.workspaceId, runId, sequence++, {
      type: "failure",
      status: "failed",
      label: "Operation failed",
      detail: response,
      jobId,
      actionId,
      communicationId,
    });
  }
  if (status === "completed")
    await addEvent(args.workspaceId, runId, sequence++, {
      type: "completed",
      label: "Finished",
      jobId,
      actionId,
      communicationId,
    });
  const links = [
    ...(actionId
      ? [{ href: `/actions/${actionId}`, label: "Review prepared work" }]
      : []),
    ...(jobId ? [{ href: `/jobs/${jobId}`, label: "Open job" }] : []),
  ];
  const assistantMessageId = id("message");
  await db.insert(agentMessages).values({
    id: assistantMessageId,
    workspaceId: args.workspaceId,
    threadId,
    jobId,
    role: "assistant",
    content: response,
    metadata: {
      actionId: actionId ?? undefined,
      communicationId: communicationId ?? undefined,
      links,
      clarification,
    },
  });
  await db
    .update(agentRuns)
    .set({
      jobId,
      actionId,
      communicationId,
      status,
      summary: response,
      errorMessage: status === "failed" ? response : null,
      completedAt: new Date(),
    })
    .where(eq(agentRuns.id, runId));
  await db
    .update(agentThreads)
    .set({ jobId, updatedAt: new Date() })
    .where(eq(agentThreads.id, threadId));
  const events = await db
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId))
    .orderBy(agentRunEvents.sequence);
  return {
    threadId,
    runId,
    userMessageId,
    assistantMessageId,
    response,
    status,
    jobId,
    actionId,
    links,
    events,
  };
}

export async function getAgentConversation(
  workspaceId: string,
  threadId?: string | null,
) {
  const [thread] = threadId
    ? await db
        .select()
        .from(agentThreads)
        .where(
          and(
            eq(agentThreads.id, threadId),
            eq(agentThreads.workspaceId, workspaceId),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(agentThreads)
        .where(
          and(
            eq(agentThreads.workspaceId, workspaceId),
            eq(agentThreads.status, "active"),
          ),
        )
        .orderBy(desc(agentThreads.updatedAt))
        .limit(1);
  if (!thread) return { thread: null, messages: [], runs: [] };
  const [messages, runs, workspaceActions, workspaceCommunications] =
    await Promise.all([
      db
        .select()
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.workspaceId, workspaceId),
            eq(agentMessages.threadId, thread.id),
          ),
        )
        .orderBy(agentMessages.createdAt),
      db
        .select()
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.workspaceId, workspaceId),
            eq(agentRuns.threadId, thread.id),
          ),
        )
        .orderBy(desc(agentRuns.startedAt))
        .limit(8),
      db
        .select()
        .from(actions)
        .where(eq(actions.workspaceId, workspaceId))
        .orderBy(desc(actions.updatedAt)),
      db
        .select()
        .from(communications)
        .where(eq(communications.workspaceId, workspaceId))
        .orderBy(desc(communications.updatedAt)),
    ]);
  const seenOutcomeActions = new Set<string>();
  const outcomeByMessage = new Map<
    string,
    {
      state: string;
      label: string;
      detail: string;
      href: string;
      actionId: string;
    }
  >();
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const metadata = message.metadata as {
      actionId?: string;
      communicationId?: string;
    } | null;
    const linked = metadata?.actionId
      ? workspaceActions.find((action) => action.id === metadata.actionId)
      : message.jobId && /preparation failed/i.test(message.content)
        ? workspaceActions.find(
            (action) =>
              action.jobId === message.jobId &&
              action.kind === "producer_coordination",
          )
        : undefined;
    if (!linked || seenOutcomeActions.has(linked.id)) continue;
    const communication = workspaceCommunications.find(
      (item) =>
        item.id === metadata?.communicationId || item.actionId === linked.id,
    );
    let state = "current";
    let label = "Current workflow state";
    let detail = linked.explanation;
    if (linked.executionStatus === "failed") {
      state = "failed";
      label = "Preparation still needs attention";
      detail = linked.resolutionReason ?? linked.explanation;
    } else if (communication?.status === "sent") {
      state = "sent";
      label = "Delivery confirmed";
      detail = "The reply was recorded as sent after preparation and approval.";
    } else if (
      ["copied", "opened_in_client"].includes(communication?.status ?? "")
    ) {
      state = "handoff";
      label = "Approved · handoff started";
      detail = "The draft was handed off, but delivery has not been confirmed.";
    } else if (
      communication?.status === "approved" ||
      linked.status === "approved"
    ) {
      state = "approved";
      label = "Approved · not sent";
      detail =
        "The latest revision is approved for handoff. No delivery is recorded.";
    } else if (communication && linked.status === "pending_approval") {
      state = "ready";
      label = "Reply ready for review";
      detail =
        "Preparation later succeeded. The draft is awaiting review and has not been sent.";
    } else if (
      linked.status === "resolved" &&
      linked.resolutionReason === "dismissed_by_user"
    ) {
      state = "resolved";
      label = "Review dismissed";
      detail = "The prepared-work review was dismissed without delivery.";
    } else continue;
    seenOutcomeActions.add(linked.id);
    outcomeByMessage.set(message.id, {
      state,
      label,
      detail,
      href: `/actions/${linked.id}`,
      actionId: linked.id,
    });
  }
  const reconciledMessages = messages.map((message) => ({
    ...message,
    currentOutcome: outcomeByMessage.get(message.id) ?? null,
  }));
  const runEvents = await Promise.all(
    runs.map(async (run) => ({
      run,
      events: await db
        .select()
        .from(agentRunEvents)
        .where(
          and(
            eq(agentRunEvents.workspaceId, workspaceId),
            eq(agentRunEvents.runId, run.id),
          ),
        )
        .orderBy(agentRunEvents.sequence),
    })),
  );
  return { thread, messages: reconciledMessages, runs: runEvents };
}
