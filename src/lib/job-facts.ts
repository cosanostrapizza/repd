import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiRuns, jobFieldRevisions, jobFields, sources } from "@/db/schema";

export type JobFactInformationState =
  "confirmed" | "proposed" | "unconfirmed" | "missing" | "conflicting";

export type JobFactRevision = {
  id: string;
  value: unknown;
  informationState: JobFactInformationState;
  confidence: number | null;
  reviewStatus: "pending" | "accepted" | "rejected";
  createdAt: Date;
  source: {
    id: string;
    label: string;
    sender: string | null;
    capturedAt: Date;
  } | null;
};

export type DisplayedJobFact = {
  key: string;
  label: string;
  requirementReason: string | null;
  acceptedRevisionId: string;
  current: JobFactRevision;
  history: JobFactRevision[];
  contribution: {
    kind:
      | "field_reconciled"
      | "discrepancy_identified"
      | "proposed_term_captured"
      | "missing_information_identified";
    title: string;
    agentRunId: string;
  } | null;
};

type FieldInput = {
  id: string;
  key: string;
  label: string | null;
  requirementReason: string | null;
  acceptedRevisionId: string | null;
};

type RevisionInput = {
  id: string;
  fieldId: string;
  sourceId: string | null;
  value: unknown;
  informationState: JobFactInformationState;
  confidence: number | null;
  reviewStatus: "pending" | "accepted" | "rejected";
  createdAt: Date;
  source: {
    id: string;
    type: string;
    subject: string | null;
    sender: string | null;
    capturedAt: Date;
  } | null;
};

function valuesDiffer(left: unknown, right: unknown) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function contributionFor(
  current: JobFactRevision,
  history: JobFactRevision[],
  agentRunId: string | undefined,
): DisplayedJobFact["contribution"] {
  // A sparkle is evidence of a meaningful, persisted contribution. A source
  // revision alone is not enough to attribute the work to Repd.
  if (!agentRunId) return null;
  if (current.informationState === "conflicting")
    return {
      kind: "discrepancy_identified",
      title: "Repd identified conflicting source information",
      agentRunId,
    };
  if (current.informationState === "missing")
    return {
      kind: "missing_information_identified",
      title: "Repd identified missing information",
      agentRunId,
    };
  if (
    current.informationState === "proposed" ||
    current.informationState === "unconfirmed"
  )
    return {
      kind: "proposed_term_captured",
      title: "Repd captured an unconfirmed term from the source",
      agentRunId,
    };
  const priorAccepted = history.find(
    (revision) =>
      revision.id !== current.id && revision.reviewStatus === "accepted",
  );
  if (priorAccepted && valuesDiffer(priorAccepted.value, current.value))
    return {
      kind: "field_reconciled",
      title: "Repd reconciled a changed value from a new source",
      agentRunId,
    };
  return null;
}

export function projectDisplayedJobFacts(input: {
  fields: FieldInput[];
  revisions: RevisionInput[];
  successfulSourceRuns: Array<{ id: string; sourceId: string | null }>;
}): DisplayedJobFact[] {
  const runBySourceId = new Map<string, string>();
  for (const run of input.successfulSourceRuns)
    if (run.sourceId && !runBySourceId.has(run.sourceId))
      runBySourceId.set(run.sourceId, run.id);
  const revisionsByField = new Map<string, JobFactRevision[]>();
  for (const revision of input.revisions) {
    const projected: JobFactRevision = {
      id: revision.id,
      value: revision.value,
      informationState: revision.informationState,
      confidence: revision.confidence,
      reviewStatus: revision.reviewStatus,
      createdAt: revision.createdAt,
      source: revision.source
        ? {
            id: revision.source.id,
            label:
              revision.source.subject ??
              revision.source.type.replaceAll("_", " "),
            sender: revision.source.sender,
            capturedAt: revision.source.capturedAt,
          }
        : null,
    };
    const history = revisionsByField.get(revision.fieldId) ?? [];
    history.push(projected);
    revisionsByField.set(revision.fieldId, history);
  }

  return input.fields.flatMap((field) => {
    if (!field.acceptedRevisionId) return [];
    const history = (revisionsByField.get(field.id) ?? []).sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    const current = history.find(
      (revision) => revision.id === field.acceptedRevisionId,
    );
    if (!current) return [];
    const agentRunId = current.source
      ? runBySourceId.get(current.source.id)
      : undefined;
    return [
      {
        key: field.key,
        label: field.label ?? field.key,
        requirementReason: field.requirementReason,
        acceptedRevisionId: field.acceptedRevisionId,
        current,
        history,
        contribution: contributionFor(current, history, agentRunId),
      },
    ];
  });
}

export async function getDisplayedJobFacts(workspaceId: string, jobId: string) {
  const [fieldRows, revisionRows, successfulSourceRuns] = await Promise.all([
    db
      .select({
        id: jobFields.id,
        key: jobFields.key,
        label: jobFields.label,
        requirementReason: jobFields.requirementReason,
        acceptedRevisionId: jobFields.acceptedRevisionId,
      })
      .from(jobFields)
      .where(
        and(eq(jobFields.workspaceId, workspaceId), eq(jobFields.jobId, jobId)),
      ),
    db
      .select({ revision: jobFieldRevisions, source: sources })
      .from(jobFieldRevisions)
      .innerJoin(jobFields, eq(jobFieldRevisions.fieldId, jobFields.id))
      .leftJoin(sources, eq(jobFieldRevisions.sourceId, sources.id))
      .where(
        and(
          eq(jobFieldRevisions.workspaceId, workspaceId),
          eq(jobFields.jobId, jobId),
        ),
      )
      .orderBy(desc(jobFieldRevisions.createdAt)),
    db
      .select({ id: aiRuns.id, sourceId: aiRuns.sourceId })
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.workspaceId, workspaceId),
          eq(aiRuns.purpose, "inquiry_extraction"),
          eq(aiRuns.status, "succeeded"),
        ),
      )
      .orderBy(desc(aiRuns.createdAt)),
  ]);

  return projectDisplayedJobFacts({
    fields: fieldRows,
    revisions: revisionRows.map(({ revision, source }) => ({
      ...revision,
      source,
    })),
    successfulSourceRuns,
  });
}
