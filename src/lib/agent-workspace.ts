import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";
import { db, id } from "@/db/client";
import {
  actions,
  agentMessages,
  agentRunEvents,
  agentRuns,
  agentThreads,
  jobParticipants,
  jobs,
  organizations,
  people,
} from "@/db/schema";
import { recordTreatmentCommitmentDecision } from "@/lib/services/intake";
import {
  getJobWorkspaceState,
  getWorkspaceTodayState,
} from "@/lib/workspace-state";

type Candidate = {
  jobId: string;
  title: string;
  clientName: string | null;
  people: string[];
  updatedAt: Date;
  score: number;
};

function mentioned(text: string, value: string) {
  const normalized = text.toLocaleLowerCase();
  const name = value.toLocaleLowerCase();
  const first = name.split(/\s+/)[0];
  return normalized.includes(name) || (first.length >= 3 && normalized.includes(first));
}

async function resolveJob(
  workspaceId: string,
  content: string,
  contextJobId?: string | null,
) {
  const rows = await db
    .select({
      job: jobs,
      clientName: organizations.name,
      personName: people.name,
    })
    .from(jobs)
    .leftJoin(organizations, eq(jobs.clientOrganizationId, organizations.id))
    .leftJoin(jobParticipants, eq(jobParticipants.jobId, jobs.id))
    .leftJoin(people, eq(jobParticipants.personId, people.id))
    .where(
      and(eq(jobs.workspaceId, workspaceId), ne(jobs.lifecycleStatus, "cancelled")),
    );
  const byJob = new Map<string, Candidate>();
  for (const row of rows) {
    const candidate = byJob.get(row.job.id) ?? {
      jobId: row.job.id,
      title: row.job.title,
      clientName: row.clientName,
      people: [],
      updatedAt: row.job.updatedAt,
      score: contextJobId === row.job.id ? 2 : 0,
    };
    if (row.personName && !candidate.people.includes(row.personName))
      candidate.people.push(row.personName);
    byJob.set(row.job.id, candidate);
  }
  for (const candidate of byJob.values()) {
    if (mentioned(content, candidate.title)) candidate.score += 8;
    if (candidate.clientName && mentioned(content, candidate.clientName))
      candidate.score += 8;
    if (candidate.people.some((person) => mentioned(content, person)))
      candidate.score += 10;
  }
  const mentionedCandidates = [...byJob.values()].filter(
    (candidate) => candidate.score > 2,
  );
  const newest = mentionedCandidates.sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  if (
    newest.length > 1 &&
    newest[0].updatedAt.getTime() > newest[1].updatedAt.getTime()
  )
    newest[0].score += 1;
  const ranked = [...byJob.values()]
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  if (!ranked.length) return { match: null, ambiguous: [] as Candidate[] };
  const best = ranked[0].score;
  const plausible = ranked.filter((candidate) => candidate.score === best);
  return {
    match: plausible.length === 1 ? plausible[0] : null,
    ambiguous: plausible.length > 1 ? plausible : [],
  };
}

type AgentIntent =
  | { kind: "today" }
  | { kind: "job_status" }
  | {
      kind: "treatment";
      decision: "cannot_commit" | "need_deck_first" | "commit_after_deck";
    }
  | { kind: "unknown" };

function classifyIntent(content: string): AgentIntent {
  const normalized = content.toLocaleLowerCase();
  if (
    /what (?:do i need|needs my attention)|deal with today|what.*today/.test(
      normalized,
    )
  )
    return { kind: "today" as const };
  if (
    /tell .*?(?:can|able to) (?:meet|make|commit)|commit.*treatment|treatment deadline/.test(
      normalized,
    )
  ) {
    const decision = /cannot|can't|unable/.test(normalized)
      ? "cannot_commit"
      : /need .*deck|deck .*before/.test(normalized) &&
          !/if .*deck|subject to .*deck/.test(normalized)
        ? "need_deck_first"
        : "commit_after_deck";
    return { kind: "treatment" as const, decision };
  }
  if (/what.*(?:happening|holding up|status)|where.*(?:job|project)/.test(normalized))
    return { kind: "job_status" as const };
  return { kind: "unknown" as const };
}

async function event(
  workspaceId: string,
  runId: string,
  sequence: number,
  values: Omit<typeof agentRunEvents.$inferInsert, "id" | "workspaceId" | "runId" | "sequence">,
) {
  await db.insert(agentRunEvents).values({
    id: id("agent_event"),
    workspaceId,
    runId,
    sequence,
    ...values,
  });
}

export async function executeAgentMessage(args: {
  workspaceId: string;
  userId: string;
  content: string;
  threadId?: string | null;
  contextJobId?: string | null;
}) {
  const now = new Date();
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
      title: args.content.length > 52 ? `${args.content.slice(0, 49)}…` : args.content,
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
  });
  await db.insert(agentRuns).values({
    id: runId,
    workspaceId: args.workspaceId,
    threadId,
    userMessageId,
    jobId: args.contextJobId ?? null,
  });

  let sequence = 1;
  const intent = classifyIntent(args.content);
  let response = "";
  let jobId: string | null = args.contextJobId ?? null;
  let actionId: string | null = null;
  let communicationId: string | null = null;
  let status: "completed" | "waiting_for_user" | "failed" = "completed";
  let clarification = false;
  try {
    if (intent.kind === "today") {
      await event(args.workspaceId, runId, sequence++, {
        type: "check",
        status: "started",
        label: "Reviewing workspace priorities",
      });
      const today = await getWorkspaceTodayState(args.workspaceId);
      await event(args.workspaceId, runId, sequence++, {
        type: "check",
        label: "Prioritized current work",
        detail: `${today.attention.length} items need attention; ${today.waiting.length} are waiting externally.`,
      });
      response = today.attention.length
        ? `You have ${today.attention.length} item${today.attention.length === 1 ? "" : "s"} that need attention. ${today.attention
            .slice(0, 3)
            .map((item) => `${item.jobTitle}: ${item.title}`)
            .join(" · ")}`
        : "Nothing requires a decision or approval right now. I’ll keep the waiting work visible on Today.";
    } else {
      await event(args.workspaceId, runId, sequence++, {
        type: "search",
        status: "started",
        label: "Finding the relevant job",
      });
      const resolution = await resolveJob(
        args.workspaceId,
        args.content,
        args.contextJobId,
      );
      if (resolution.ambiguous.length) {
        status = "waiting_for_user";
        clarification = true;
        response = `I found more than one plausible job: ${resolution.ambiguous
          .map((candidate) => candidate.title)
          .join(", ")}. Which one do you mean?`;
        await event(args.workspaceId, runId, sequence++, {
          type: "clarification_required",
          label: "Clarification needed",
          detail: response,
        });
      } else if (!resolution.match) {
        status = "waiting_for_user";
        clarification = true;
        response =
          "I couldn’t identify a single job from that instruction. Name the client, project, or producer and I’ll continue.";
        await event(args.workspaceId, runId, sequence++, {
          type: "clarification_required",
          label: "Job not resolved",
          detail: response,
        });
      } else {
        jobId = resolution.match.jobId;
        await db
          .update(agentRuns)
          .set({ jobId })
          .where(eq(agentRuns.id, runId));
        await event(args.workspaceId, runId, sequence++, {
          type: "search",
          label: `Found ${resolution.match.title}`,
          detail: resolution.match.clientName ?? undefined,
          jobId,
        });
        const state = await getJobWorkspaceState(args.workspaceId, jobId);
        if (!state) throw new Error("The resolved job is no longer available.");
        if (intent.kind === "job_status") {
          await event(args.workspaceId, runId, sequence++, {
            type: "check",
            label: "Checked current work and waiting conditions",
            detail: `${state.workItems.length} active work items.`,
            jobId,
          });
          response = `${state.job.title}: ${state.situation} ${
            state.primary
              ? `The recommended next action is “${state.primary.title}.”`
              : "No action currently needs your attention."
          }`;
        } else if (intent.kind === "treatment") {
          const treatment = state.activeObjectives
            .flatMap((group) => group.dependencies)
            .find((dependency) => dependency.key === "treatment_deadline");
          if (!treatment)
            throw new Error(
              "This job has no recorded treatment-deadline dependency to update.",
            );
          await event(args.workspaceId, runId, sequence++, {
            type: "check",
            label: "Checked the treatment obligation",
            detail: treatment.result,
            jobId,
          });
          try {
            actionId = await recordTreatmentCommitmentDecision({
              workspaceId: args.workspaceId,
              userId: args.userId,
              objectiveId: treatment.objectiveId,
              decision: intent.decision,
              condition: /deck (?:arrives?|is here) tomorrow/i.test(args.content)
                ? "the promised deck arrives tomorrow and can be reviewed"
                : null,
            });
            const [updatedAction] = await db
              .select()
              .from(actions)
              .where(eq(actions.id, actionId))
              .limit(1);
            communicationId = (updatedAction?.payload as { communicationId?: string })
              ?.communicationId ?? null;
            await event(args.workspaceId, runId, sequence++, {
              type: "record_change",
              label: "Recorded the treatment decision",
              detail: treatment.result,
              jobId,
              actionId,
            });
            await event(args.workspaceId, runId, sequence++, {
              type: "artifact_preparation",
              label: "Prepared the producer reply",
              jobId,
              actionId,
              communicationId,
            });
            await event(args.workspaceId, runId, sequence++, {
              type: "approval_required",
              label: "Reply is ready for approval",
              detail: "No message has been sent.",
              jobId,
              actionId,
              communicationId,
            });
            response = `I recorded the conditional treatment commitment for ${state.job.title}${/deck (?:arrives?|is here) tomorrow/i.test(args.content) ? ", including that the deck must arrive tomorrow," : ""} and prepared a reply for approval. Nothing has been sent.`;
          } catch (error) {
            const refreshed = await getJobWorkspaceState(args.workspaceId, jobId);
            actionId = refreshed?.failures[0]?.action?.id ?? null;
            await event(args.workspaceId, runId, sequence++, {
              type: "record_change",
              label: "Recorded the treatment decision",
              detail: "The decision is durable even though preparation failed.",
              jobId,
              actionId,
            });
            await event(args.workspaceId, runId, sequence++, {
              type: "failure",
              status: "failed",
              label: "Reply preparation failed",
              detail: error instanceof Error ? error.message : "Preparation failed.",
              jobId,
              actionId,
            });
            status = "failed";
            response = `I recorded the treatment decision for ${state.job.title}, but reply preparation failed. The decision is safe and the failed preparation is available to retry in the job.`;
          }
        } else {
          response = `I found ${state.job.title}. I can summarize its current state or record a treatment-deadline decision. I can’t safely perform that instruction yet.`;
        }
      }
    }
  } catch (error) {
    status = "failed";
    response = error instanceof Error ? error.message : "Repd could not complete that request.";
    await event(args.workspaceId, runId, sequence++, {
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
    await event(args.workspaceId, runId, sequence++, {
      type: "completed",
      label: "Finished",
      jobId,
      actionId,
      communicationId,
    });
  const assistantMessageId = id("message");
  const links = jobId ? [{ href: `/jobs/${jobId}`, label: "Open job" }] : [];
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
      completedAt: now,
    })
    .where(eq(agentRuns.id, runId));
  await db
    .update(agentThreads)
    .set({ jobId, updatedAt: now })
    .where(eq(agentThreads.id, threadId));
  const events = await db
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId))
    .orderBy(agentRunEvents.sequence);
  return { threadId, runId, response, status, jobId, actionId, links, events };
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
  const [messages, runs] = await Promise.all([
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
        and(eq(agentRuns.workspaceId, workspaceId), eq(agentRuns.threadId, thread.id)),
      )
      .orderBy(desc(agentRuns.startedAt))
      .limit(8),
  ]);
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
  return { thread, messages, runs: runEvents };
}
