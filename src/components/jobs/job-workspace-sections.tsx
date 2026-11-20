import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  MoreHorizontal,
  Pencil,
  Sparkles,
  UserRound,
} from "lucide-react";
import { RetryPreparationForm } from "@/components/agent/retry-preparation-form";
import { TreatmentDecisionForm } from "@/components/agent/treatment-decision-form";
import { HoldForm, JobForm, ParticipantForm } from "@/components/forms";
import type { Job, Organization, Source } from "@/db/schema";
import { bookingLabels, formatMoney, lifecycleLabels } from "@/lib/domain";
import type { JobActivityItem } from "@/lib/job-activity";
import { transitionHold } from "@/lib/server-actions";
import {
  getJobWorkspaceState,
  type WorkspaceWorkItem,
} from "@/lib/workspace-state";
import { formatCalendarDate } from "@/lib/calendar-date";

type WorkspaceState = NonNullable<
  Awaited<ReturnType<typeof getJobWorkspaceState>>
>;

type ParticipantRow = {
  participant: {
    id: string;
    personId: string | null;
    role: string;
    displayNameSnapshot: string;
  };
  person: { id: string; name: string } | null;
  organization: string | null;
};

type FieldRow = {
  field: {
    id: string;
    key: string;
    label: string | null;
    requirementReason: string | null;
  };
  revision: {
    id: string;
    sourceId: string | null;
    informationState:
      "confirmed" | "proposed" | "unconfirmed" | "missing" | "conflicting";
    confidence: number | null;
    createdAt: Date;
  } | null;
};

function workLabel(item: WorkspaceWorkItem) {
  if (item.action?.executionStatus === "failed") return "Failed — retry";
  if (item.action?.status === "pending_approval") return "Ready for review";
  if (item.action?.status === "approved") return "Approved for handoff";
  if (item.responsibility === "repd") return "Repd is working";
  if (item.responsibility === "external") return "Waiting";
  return "Needs your attention";
}

function workAction(item: WorkspaceWorkItem) {
  if (["pending_approval", "approved"].includes(item.action?.status ?? ""))
    return item.kind === "invoice" ? "Review invoice" : "Review reply";
  if (item.kind === "treatment_commitment") return "Decide treatment";
  if (item.kind === "hold_conflict") return "Review conflict";
  return "Review";
}

export function JobHeader({
  job,
  client,
}: {
  job: Job;
  client: string | null;
}) {
  return (
    <header className="job-document-header">
      <div className="job-document-header-inner">
        <nav className="job-breadcrumb" aria-label="Breadcrumb">
          <Link href="/jobs">Jobs</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{job.title}</span>
        </nav>
        <div className="job-document-title-row">
          <div>
            <h1>{job.title}</h1>
            <p className="job-client-line">
              {client ?? "Client not identified"}
              <span aria-hidden="true">·</span>
              <span>{job.jobType}</span>
            </p>
          </div>
          <details className="job-overflow">
            <summary aria-label="More job actions">
              <MoreHorizontal size={18} />
            </summary>
            <div className="job-overflow-menu">
              <Link href={`/jobs/${job.id}/response`}>Add producer update</Link>
              <a href="#edit-job">Edit record</a>
            </div>
          </details>
        </div>
        <div className="job-header-meta detail-meta">
          <span className="job-status-text">
            <i className={`status-mark ${job.lifecycleStatus}`} />
            {lifecycleLabels[job.lifecycleStatus]}
          </span>
          <span className="badge">{bookingLabels[job.bookingStatus]}</span>
          <span>Updated {job.updatedAt.toLocaleDateString()}</span>
        </div>
      </div>
    </header>
  );
}

export function JobNextSteps({ state }: { state: WorkspaceState }) {
  const activeObjective = state.activeObjectives[0];
  const treatmentDecision = activeObjective?.dependencies.find(
    (dependency) =>
      dependency.key === "treatment_deadline" &&
      dependency.status === "needs_decision",
  );
  const treatmentValue = treatmentDecision?.value as {
    dueDate?: string | null;
    prerequisite?: string | null;
  } | null;
  const failureItem = state.failures[0];
  return (
    <section
      id="next-steps"
      className="job-section"
      aria-labelledby="next-steps-heading"
    >
      <div className="job-section-heading">
        <div>
          <p className="eyebrow">Next steps</p>
          <h2 id="next-steps-heading">Who has the next move</h2>
        </div>
        <span className="section-summary">
          {state.workItems.length
            ? `${state.workItems.length} current ${state.workItems.length === 1 ? "item" : "items"}`
            : "No current action required"}
        </span>
      </div>
      <div className="owner-groups compact-owner-groups">
        <div className="owner-group">
          <h3>
            <Sparkles size={15} /> Needs you{" "}
            <span>{state.needsYou.length}</span>
          </h3>
          {state.needsYou.map((item) => (
            <article
              className={`work-item ${item.state}`}
              key={`${item.source}:${item.id}`}
            >
              <div>
                <small>{workLabel(item)}</small>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              {item.action?.executionStatus === "failed" ? (
                <RetryPreparationForm actionId={item.action.id} compact />
              ) : (
                <Link className="button secondary small" href={item.href}>
                  {workAction(item)}
                </Link>
              )}
            </article>
          ))}
          {!state.needsYou.length && (
            <p className="owner-empty">
              <CheckCircle2 size={15} /> Nothing needs your decision right now.
            </p>
          )}
          {treatmentDecision && activeObjective && (
            <div className="contextual-control">
              <TreatmentDecisionForm
                objectiveId={activeObjective.objective.id}
                deadline={treatmentValue?.dueDate ?? null}
                prerequisite={treatmentValue?.prerequisite ?? null}
              />
            </div>
          )}
          {failureItem?.action && (
            <p className="trust-line">
              The saved decision is unchanged. Retrying only prepares the reply
              and cannot create a duplicate decision.
            </p>
          )}
        </div>
        {state.repdHandling.length > 0 && (
          <div className="owner-group">
            <h3>
              <Sparkles size={15} /> Repd is handling
              <span>{state.repdHandling.length}</span>
            </h3>
            {state.repdHandling.map((item) => (
              <Link
                href={item.href}
                className="work-item compact"
                key={item.id}
              >
                <div>
                  <small>{workLabel(item)}</small>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
        {state.waitingOnOthers.length > 0 && (
          <div className="owner-group">
            <h3>
              <Clock3 size={15} /> Waiting on others
              <span>{state.waitingOnOthers.length}</span>
            </h3>
            {state.waitingOnOthers.map((item) => (
              <article className="work-item compact waiting" key={item.id}>
                <div>
                  <small>Waiting</small>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <Link
                  href={`/jobs/${state.job.id}/response`}
                  className="quiet-link"
                >
                  Add update
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
      {state.treatmentCommitment && (
        <div className="inline-recorded-commitment">
          <CheckCircle2 size={15} />
          <div>
            <strong>Conditional treatment commitment recorded</strong>
            <span>
              {state.treatmentCommitment.result.replace(/^Alex /, "You ")}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function FactRow({
  label,
  value,
  fieldKey,
  fields,
  sources,
}: {
  label: string;
  value: string;
  fieldKey?: string;
  fields: FieldRow[];
  sources: Source[];
}) {
  const tracked = fieldKey
    ? fields.find(({ field }) => field.key === fieldKey)
    : undefined;
  const source = tracked?.revision?.sourceId
    ? sources.find((item) => item.id === tracked.revision?.sourceId)
    : undefined;
  return (
    <div className="job-field-row fact-row">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {(tracked?.revision || source) && (
          <span className="field-provenance">
            {tracked?.revision?.informationState.replaceAll("_", " ")}
            {tracked?.revision?.confidence != null
              ? ` · ${tracked.revision.confidence}% confidence`
              : ""}
            {source && (
              <a href={`#source-${source.id}`}>
                {` · ${source.subject ?? source.type.replaceAll("_", " ")}`}
              </a>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}

export function JobRecord({
  state,
  organizations,
  participants,
  fields,
}: {
  state: WorkspaceState;
  organizations: Organization[];
  participants: ParticipantRow[];
  fields: FieldRow[];
}) {
  const { job } = state;
  const display = (value: unknown) =>
    value == null || value === "" ? "Not known" : String(value);
  const shoot = job.shootDate
    ? formatCalendarDate(job.shootDate, { weekday: "short" })
    : job.shootStart
      ? `${job.shootStart.toLocaleString()}${job.shootEnd ? ` – ${job.shootEnd.toLocaleString()}` : ""}`
      : "Not known";
  const budget =
    job.proposedBudgetMinCents != null && job.proposedBudgetMaxCents != null
      ? `${formatMoney(job.proposedBudgetMinCents, job.currency)}–${formatMoney(job.proposedBudgetMaxCents, job.currency)}`
      : "Not known";
  return (
    <section
      className="job-section job-record"
      aria-labelledby="job-record-heading"
    >
      <div className="job-section-heading">
        <div>
          <p className="eyebrow">Job record</p>
          <h2 id="job-record-heading">Canonical terms</h2>
        </div>
      </div>

      <div className="job-record-group">
        <h3>Schedule</h3>
        <dl className="job-field-list">
          <FactRow
            label="Shoot"
            value={shoot}
            fieldKey="shootDate"
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Location"
            value={display(job.location)}
            fieldKey="location"
            fields={fields}
            sources={state.documents}
          />
        </dl>
        <div className="structured-objects">
          {state.dateOptions.map((option) => (
            <div className="record-row" key={option.id}>
              <div>
                <strong>{option.label}</strong>
                <span>
                  {option.clientSelected
                    ? "Selected date"
                    : "Historical option"}
                  {option.holdRequested
                    ? ` · ${option.holdPriority ?? "unspecified"} hold`
                    : ""}
                </span>
              </div>
              <small className={`record-state ${option.holdState}`}>
                {option.holdState === "released"
                  ? "Released"
                  : option.holdState === "granted"
                    ? "Active hold"
                    : option.holdState.replaceAll("_", " ")}
              </small>
            </div>
          ))}
          {state.holds.active
            .concat(state.holds.released, state.holds.converted)
            .map((hold) => (
              <div className="record-row" key={hold.id}>
                <div>
                  <strong>
                    {hold.kind === "confirmed"
                      ? "Confirmed booking"
                      : `${hold.kind} hold`}
                  </strong>
                  <span>{hold.startsAt.toLocaleDateString()}</span>
                </div>
                <div className="record-actions">
                  <small className={`record-state ${hold.status}`}>
                    {hold.status}
                  </small>
                  {hold.status === "active" && (
                    <form action={transitionHold}>
                      <input type="hidden" name="holdId" value={hold.id} />
                      {hold.kind !== "confirmed" && (
                        <button
                          className="quiet-button"
                          name="transition"
                          value="confirm"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        className="quiet-button danger"
                        name="transition"
                        value="release"
                      >
                        Release
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          {!state.dateOptions.length &&
            !state.holds.active.length &&
            !state.holds.released.length &&
            !state.holds.converted.length && (
              <p className="compact-empty">
                No date options or holds recorded.
              </p>
            )}
        </div>
        <details className="inline-edit">
          <summary>Add a hold</summary>
          <HoldForm jobId={job.id} start={job.shootStart} end={job.shootEnd} />
        </details>
      </div>

      <div className="job-record-group">
        <h3>Commercial terms</h3>
        <dl className="job-field-list">
          <FactRow
            label="Creative fee"
            value={formatMoney(job.feeCents, job.currency)}
            fieldKey="feeCents"
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Fee status"
            value={job.feeState}
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Indicative budget"
            value={budget}
            fieldKey="proposedBudget"
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Usage & exclusivity"
            value={display(job.usageTerms)}
            fieldKey="usageTerms"
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Deliverables"
            value={display(job.deliverables)}
            fieldKey="deliverables"
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Payment terms"
            value={display(job.paymentTerms)}
            fieldKey="paymentTerms"
            fields={fields}
            sources={state.documents}
          />
          <FactRow
            label="Invoice status"
            value={job.invoiceStatus.replaceAll("_", " ")}
            fields={fields}
            sources={state.documents}
          />
        </dl>
      </div>

      <div className="job-record-group">
        <h3>People and organizations</h3>
        <div className="structured-objects">
          {participants.map(({ participant, person, organization }) => (
            <Link
              href={person ? `/people/${person.id}` : "#"}
              className="record-row"
              key={participant.id}
            >
              <div className="person-record">
                <span className="avatar small-avatar">
                  <UserRound size={15} />
                </span>
                <span>
                  <strong>{participant.displayNameSnapshot}</strong>
                  <small>
                    {participant.role}
                    {organization ? ` · ${organization}` : ""}
                  </small>
                </span>
              </div>
            </Link>
          ))}
          {!participants.length && (
            <p className="compact-empty">No job participants recorded.</p>
          )}
        </div>
        <details className="inline-edit">
          <summary>Add a person</summary>
          <ParticipantForm jobId={job.id} />
        </details>
      </div>

      {job.notes && (
        <div className="job-record-group">
          <h3>Internal notes</h3>
          <p className="job-notes">{job.notes}</p>
        </div>
      )}

      <details id="edit-job" className="job-edit-panel">
        <summary>
          <Pencil size={14} /> Edit job details
        </summary>
        <div className="job-edit-body">
          <JobForm organizations={organizations} job={job} />
        </div>
      </details>
    </section>
  );
}

export function JobArtifacts({ state }: { state: WorkspaceState }) {
  const hasArtifacts = state.messages.length || state.invoiceDrafts.length;
  return (
    <section
      id="artifacts"
      className="job-section"
      aria-labelledby="artifacts-heading"
    >
      <div className="job-section-heading">
        <div>
          <p className="eyebrow">Documents & artifacts</p>
          <h2 id="artifacts-heading">Prepared and source material</h2>
        </div>
      </div>
      <div className="artifact-list">
        {state.messages.map((message) => (
          <article className="artifact-row" key={message.id}>
            <FileText size={17} />
            <div>
              <strong>{message.subject}</strong>
              <span>Communication · revision {message.revision}</span>
            </div>
            <small className={`record-state ${message.status}`}>
              {message.status.replaceAll("_", " ")}
            </small>
            {message.actionId && (
              <Link
                className="quiet-link"
                href={`/actions/${message.actionId}`}
              >
                Review
              </Link>
            )}
          </article>
        ))}
        {state.invoiceDrafts.map((draft) => (
          <article className="artifact-row" key={draft.id}>
            <FileText size={17} />
            <div>
              <strong>Invoice draft</strong>
              <span>{draft.status} · internal draft, not issued or sent</span>
            </div>
            {draft.actionId && (
              <Link className="quiet-link" href={`/actions/${draft.actionId}`}>
                Review
              </Link>
            )}
          </article>
        ))}
        {!hasArtifacts && (
          <p className="compact-empty">No prepared artifacts yet.</p>
        )}
      </div>
      {state.activeQuestions.length > 0 && (
        <details className="artifact-disclosure">
          <summary>Open questions · {state.activeQuestions.length}</summary>
          <div>
            {state.activeQuestions.map((question) => (
              <div className="record-row" key={question.id}>
                <div>
                  <strong>{question.question}</strong>
                  <span>{question.whyItMatters}</span>
                </div>
                <small className="record-state">{question.status}</small>
              </div>
            ))}
          </div>
        </details>
      )}
      <details className="artifact-disclosure" open>
        <summary>Source documents · {state.documents.length}</summary>
        <div>
          {state.documents.map((source) => (
            <details
              id={`source-${source.id}`}
              className="source-document compact-source"
              key={source.id}
            >
              <summary>
                <FileText size={15} />{" "}
                {source.subject ?? source.type.replaceAll("_", " ")}
              </summary>
              <pre>{source.content ?? "This source has no text preview."}</pre>
            </details>
          ))}
          {!state.documents.length && (
            <p className="compact-empty">No source documents captured.</p>
          )}
        </div>
      </details>
    </section>
  );
}

export function JobActivityTimeline({ items }: { items: JobActivityItem[] }) {
  return (
    <section
      id="activity"
      className="job-section"
      aria-labelledby="activity-heading"
    >
      <div className="job-section-heading">
        <div>
          <p className="eyebrow">Activity</p>
          <h2 id="activity-heading">Job history</h2>
        </div>
      </div>
      <div className="job-timeline">
        {items.map((item) => {
          const content = (
            <>
              <i
                className={`timeline-mark ${item.category} ${item.status ?? ""}`}
              />
              <div>
                <div className="timeline-meta">
                  <span>{item.actorLabel}</span>
                  <time dateTime={item.occurredAt.toISOString()}>
                    {item.occurredAt.toLocaleString()}
                  </time>
                </div>
                <strong>{item.summary}</strong>
                {item.detail && <p>{item.detail}</p>}
              </div>
            </>
          );
          return item.href ? (
            <Link className="timeline-row" href={item.href} key={item.id}>
              {content}
            </Link>
          ) : (
            <div className="timeline-row" key={item.id}>
              {content}
            </div>
          );
        })}
        {!items.length && (
          <p className="compact-empty">
            No activity has been recorded for this job.
          </p>
        )}
      </div>
    </section>
  );
}
