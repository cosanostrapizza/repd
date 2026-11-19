import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  actions,
  agentMessages,
  communications,
  jobFields,
  jobParticipants,
  jobs,
  organizations,
  people,
  sources,
} from "@/db/schema";
import {
  createConditionalFollowUp,
  prepareAgentCommunication,
  prepareReadyInvoiceDrafts,
} from "@/lib/agent-business-commands";
import {
  getJobWorkspaceState,
  getWorkspaceTodayState,
} from "@/lib/workspace-state";
import { recordTreatmentCommitmentDecision } from "@/lib/services/intake";

export type AgentToolRisk = "read" | "write_internal" | "prepare_for_approval";
export type AgentToolContext = {
  workspaceId: string;
  userId: string;
  runId: string;
  threadId: string;
};
const searchSchema = z.object({ query: z.string().trim().min(1) });
const jobSchema = z.object({ jobId: z.string().min(1) });

export const agentTools = {
  search_business_records: {
    description:
      "Find jobs by title, client, or participant. Returns durable entity IDs and ambiguity evidence.",
    risk: "read",
    input: searchSchema,
    async execute({ query }: { query: string }, context: AgentToolContext) {
      const pattern = `%${query}%`;
      const rows = await db
        .select({
          jobId: jobs.id,
          title: jobs.title,
          clientName: organizations.name,
          personId: people.id,
          personName: people.name,
          role: jobParticipants.role,
        })
        .from(jobs)
        .leftJoin(
          organizations,
          eq(jobs.clientOrganizationId, organizations.id),
        )
        .leftJoin(jobParticipants, eq(jobParticipants.jobId, jobs.id))
        .leftJoin(people, eq(jobParticipants.personId, people.id))
        .where(
          and(
            eq(jobs.workspaceId, context.workspaceId),
            or(
              ilike(jobs.title, pattern),
              ilike(organizations.name, pattern),
              ilike(people.name, pattern),
            ),
          ),
        )
        .orderBy(desc(jobs.updatedAt));
      const grouped = new Map<
        string,
        {
          jobId: string;
          title: string;
          clientName: string | null;
          participants: Array<{ personId: string; name: string; role: string }>;
        }
      >();
      for (const row of rows) {
        const item = grouped.get(row.jobId) ?? {
          jobId: row.jobId,
          title: row.title,
          clientName: row.clientName,
          participants: [],
        };
        if (
          row.personId &&
          row.personName &&
          !item.participants.some((p) => p.personId === row.personId)
        )
          item.participants.push({
            personId: row.personId,
            name: row.personName,
            role: row.role ?? "participant",
          });
        grouped.set(row.jobId, item);
      }
      return { query, matches: [...grouped.values()].slice(0, 12) };
    },
  },
  read_job_state: {
    description:
      "Read the canonical job projection, including lifecycle, active work, dependencies, holds, artifacts, and source-backed situation.",
    risk: "read",
    input: jobSchema,
    async execute({ jobId }: { jobId: string }, context: AgentToolContext) {
      const state = await getJobWorkspaceState(context.workspaceId, jobId);
      if (!state) throw new Error("Job not found in this workspace.");
      return {
        job: state.job,
        clientName: state.clientName,
        situation: state.situation,
        workItems: state.workItems,
        dependencies: state.activeObjectives.flatMap(
          ({ objective, dependencies }) =>
            dependencies.map((dependency) => ({
              ...dependency,
              objectiveId: objective.id,
            })),
        ),
        communications: state.messages.map((message) => ({
          id: message.id,
          recipientPersonId: message.recipientPersonId,
          subject: message.subject,
          status: message.status,
          sentAt: message.sentAt,
        })),
        invoiceDrafts: state.invoiceDrafts,
        holds: state.holds,
      };
    },
  },
  read_workspace_attention: {
    description:
      "Read canonical cross-job attention, Repd work, external dependencies, and recent changes.",
    risk: "read",
    input: z.object({}),
    async execute(_: Record<string, never>, context: AgentToolContext) {
      const today = await getWorkspaceTodayState(context.workspaceId);
      return {
        attention: today.attention,
        repdHandling: today.repdHandling,
        waiting: today.waiting,
        recent: today.recent,
      };
    },
  },
  inspect_job_evidence: {
    description:
      "Inspect commercial fields, their certainty/provenance, communications, and source evidence for one job.",
    risk: "read",
    input: jobSchema,
    async execute({ jobId }: { jobId: string }, context: AgentToolContext) {
      const [job, fields, evidence, messages] = await Promise.all([
        db
          .select()
          .from(jobs)
          .where(
            and(eq(jobs.id, jobId), eq(jobs.workspaceId, context.workspaceId)),
          )
          .limit(1),
        db
          .select()
          .from(jobFields)
          .where(
            and(
              eq(jobFields.jobId, jobId),
              eq(jobFields.workspaceId, context.workspaceId),
            ),
          ),
        db
          .select()
          .from(sources)
          .where(
            and(
              eq(sources.jobId, jobId),
              eq(sources.workspaceId, context.workspaceId),
            ),
          )
          .orderBy(desc(sources.capturedAt))
          .limit(12),
        db
          .select()
          .from(communications)
          .where(
            and(
              eq(communications.jobId, jobId),
              eq(communications.workspaceId, context.workspaceId),
            ),
          )
          .orderBy(desc(communications.updatedAt))
          .limit(12),
      ]);
      if (!job[0]) throw new Error("Job not found in this workspace.");
      return {
        job: job[0],
        fields,
        sources: evidence.map((source) => ({
          id: source.id,
          type: source.type,
          direction: source.direction,
          subject: source.subject,
          sender: source.sender,
          content: source.content,
          capturedAt: source.capturedAt,
        })),
        communications: messages,
      };
    },
  },
  inspect_agent_history: {
    description:
      "Inspect recent durable messages in this agent thread for prior resolved references and completed work.",
    risk: "read",
    input: z.object({ limit: z.number().int().min(1).max(20).default(8) }),
    async execute({ limit }: { limit: number }, context: AgentToolContext) {
      return db
        .select({
          id: agentMessages.id,
          role: agentMessages.role,
          content: agentMessages.content,
          jobId: agentMessages.jobId,
          metadata: agentMessages.metadata,
        })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.workspaceId, context.workspaceId),
            eq(agentMessages.threadId, context.threadId),
          ),
        )
        .orderBy(desc(agentMessages.createdAt))
        .limit(limit);
    },
  },
  prepare_producer_communication: {
    description:
      "Prepare, but never send, a producer communication. A required conditional sentence is validated verbatim. The result always requires approval.",
    risk: "prepare_for_approval",
    input: z.object({
      jobId: z.string().min(1),
      personId: z.string().min(1),
      subject: z.string().min(1).max(180),
      body: z.string().min(1).max(8000),
      purpose: z.string().min(1).max(500),
      requiredConditionalText: z.string().max(1000).nullable().optional(),
      idempotencyKey: z.string().min(8).max(220),
    }),
    async execute(
      input: {
        jobId: string;
        personId: string;
        subject: string;
        body: string;
        purpose: string;
        requiredConditionalText?: string | null;
        idempotencyKey: string;
      },
      context: AgentToolContext,
    ) {
      return prepareAgentCommunication({
        ...input,
        workspaceId: context.workspaceId,
        userId: context.userId,
      });
    },
  },
  create_conditional_follow_up: {
    description:
      "Create one durable internal follow-up evaluated from Repd records at a deadline. It does not claim inbox monitoring.",
    risk: "write_internal",
    input: z.object({
      jobId: z.string().min(1),
      personId: z.string().nullable().optional(),
      communicationId: z.string().nullable().optional(),
      dueAt: z.iso.datetime(),
      expectedEvent: z.string().min(1).max(500),
      nextAction: z.string().min(1).max(500),
      idempotencyKey: z.string().min(8).max(220),
    }),
    async execute(
      input: {
        jobId: string;
        personId?: string | null;
        communicationId?: string | null;
        dueAt: string;
        expectedEvent: string;
        nextAction: string;
        idempotencyKey: string;
      },
      context: AgentToolContext,
    ) {
      return createConditionalFollowUp({
        ...input,
        workspaceId: context.workspaceId,
        dueAt: new Date(input.dueAt),
      });
    },
  },
  prepare_ready_invoices: {
    description:
      "Prepare idempotent internal invoice drafts for all completed eligible jobs and list missing inputs. Never issue or send invoices.",
    risk: "prepare_for_approval",
    input: z.object({}),
    async execute(_: Record<string, never>, context: AgentToolContext) {
      return prepareReadyInvoiceDrafts(context.workspaceId);
    },
  },
  record_treatment_commitment: {
    description:
      "Record an explicit treatment-deadline decision through the existing authoritative command and prepare its approval-gated reply.",
    risk: "prepare_for_approval",
    input: z.object({
      objectiveId: z.string().min(1),
      decision: z.enum([
        "cannot_commit",
        "need_deck_first",
        "commit_after_deck",
      ]),
      condition: z.string().nullable(),
    }),
    async execute(
      input: {
        objectiveId: string;
        decision: "cannot_commit" | "need_deck_first" | "commit_after_deck";
        condition: string | null;
      },
      context: AgentToolContext,
    ) {
      const actionId = await recordTreatmentCommitmentDecision({
        workspaceId: context.workspaceId,
        userId: context.userId,
        ...input,
      });
      const [action] = await db
        .select()
        .from(actions)
        .where(
          and(
            eq(actions.id, actionId),
            eq(actions.workspaceId, context.workspaceId),
          ),
        )
        .limit(1);
      const communicationId =
        (action?.payload as { communicationId?: string } | null)
          ?.communicationId ?? null;
      return {
        actionId,
        communicationId,
        approvalRequired: true,
        externalDelivery: false,
      };
    },
  },
};

export type AgentToolName = keyof typeof agentTools;
export function toolCatalog() {
  return Object.entries(agentTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    risk: tool.risk,
  }));
}

export async function executeAgentTool(
  name: string,
  rawInput: unknown,
  context: AgentToolContext,
) {
  const tool = agentTools[name as AgentToolName] as
    | {
        risk: AgentToolRisk;
        input: z.ZodType;
        execute: (input: never, context: AgentToolContext) => Promise<unknown>;
      }
    | undefined;
  if (!tool) throw new Error(`Unknown or unauthorized tool: ${name}`);
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success)
    throw new Error(`Invalid ${name} input: ${z.prettifyError(parsed.error)}`);
  return {
    risk: tool.risk,
    output: await tool.execute(parsed.data as never, context),
  };
}
