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
import type { Action, Job, Organization } from "@/db/schema";
import { bookingLabels, formatMoney, lifecycleLabels } from "@/lib/domain";
import type { JobActivityItem } from "@/lib/job-activity";
import type { DisplayedJobFact, JobFactRevision } from "@/lib/job-facts";
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
  facts,
  currency,
}: {
  label: string;
  value: string;
  fieldKey?: string;
  facts: DisplayedJobFact[];
  currency: string;
}) {
  const tracked = fieldKey
    ? facts.find((fact) => fact.key === fieldKey)
    : undefined;
  const current = tracked?.current;
  const previous = tracked?.history.find(
    (revision) =>
      revision.id !== tracked.acceptedRevisionId &&
      revision.reviewStatus === "accepted",
  );
  const formatRevisionValue = (revision: JobFactRevision | undefined) => {
    if (!revision || revision.value == null || revision.value === "")
      return "No value recorded";
    if (fieldKey === "feeCents" && typeof revision.value === "number")
      return formatMoney(revision.value, currency);
    if (Array.isArray(revision.value)) return revision.value.join(", ");
    if (typeof revision.value === "object")
      return JSON.stringify(revision.value);
    return String(revision.value);
  };
  const stateLabel = current
    ? current.informationState === "proposed"
      ? "Proposed · not confirmed"
      : current.informationState === "unconfirmed"
        ? "Unconfirmed"
        : current.informationState === "conflicting"
          ? "Conflicting sources"
          : current.informationState === "missing"
            ? "Missing"
            : "Confirmed"
    : null;
  return (
    <div
      className="job-field-row fact-row"
      data-agent-context-kind="field"
      data-agent-context-id={fieldKey}
      data-agent-context-label={`${label}: ${value}`}
    >
      <dt>{label}</dt>
      <dd>
        <div className="fact-value-line">
          <strong>{value}</strong>
          {tracked?.contribution && current && (
            <details className="inline-contribution">
              <summary role="button" aria-label={tracked.contribution.title}>
                <Sparkles size={13} aria-hidden="true" />
              </summary>
              <div className="contribution-popover">
                <p className="contribution-title">
                  <Sparkles size={13} aria-hidden="true" />
                  <strong>{tracked.contribution.title}</strong>
                </p>
                <span className={`state-pill ${current.informationState}`}>
                  {stateLabel}
                </span>
                <dl>
                  <div>
                    <dt>Current source value</dt>
                    <dd>{formatRevisionValue(current)}</dd>
                  </div>
                  {previous && (
                    <div>
                      <dt>Previous accepted value</dt>
                      <dd>{formatRevisionValue(previous)}</dd>
                    </div>
                  )}
                </dl>
                <p>
                  {current.informationState === "confirmed"
                    ? "This accepted revision is applied to the job record."
                    : current.informationState === "missing"
                      ? "No confirmed value was applied."
                      : "The record preserves this state and does not treat the value as confirmed."}
                </p>
                {current.source && (
                  <a href={`#source-${current.source.id}`}>
                    View source evidence
                  </a>
                )}
                <a href="#edit-job">Correct the job record</a>
              </div>
            </details>
          )}
        </div>
        {current && (
          <span className="field-provenance">
            <span className={`fact-state ${current.informationState}`}>
              {stateLabel}
            </span>
            {current.confidence != null
              ? ` · ${current.confidence}% confidence`
              : ""}
            {current.source && (
              <a href={`#source-${current.source.id}`}>
                {` · ${current.source.label}`}
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
  facts,
}: {
  state: WorkspaceState;
  organizations: Organization[];
  participants: ParticipantRow[];
  facts: DisplayedJobFact[];
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
            fieldKey="shootStart"
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Location"
            value={display(job.location)}
            fieldKey="location"
            facts={facts}
            currency={job.currency}
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
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Fee status"
            value={job.feeState}
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Indicative budget"
            value={budget}
            fieldKey="budgetRange"
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Usage & exclusivity"
            value={display(job.usageTerms)}
            fieldKey="usageTerms"
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Deliverables"
            value={display(job.deliverables)}
            fieldKey="deliverables"
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Payment terms"
            value={display(job.paymentTerms)}
            fieldKey="paymentTerms"
            facts={facts}
            currency={job.currency}
          />
          <FactRow
            label="Invoice status"
            value={job.invoiceStatus.replaceAll("_", " ")}
            facts={facts}
            currency={job.currency}
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

function ArtifactContribution({
  action,
  artifactStatus,
  kind,
}: {
  action: Action;
  artifactStatus: string;
  kind: "communication" | "invoice";
}) {
  const delivered = kind === "communication" && artifactStatus === "sent";
  const approved =
    action.status === "approved" || artifactStatus === "approved";
  return (
    <details className="inline-contribution artifact-contribution">
      <summary role="button" aria-label={`Inspect Repd's prepared ${kind}`}>
        <Sparkles size={13} aria-hidden="true" />
      </summary>
      <div className="contribution-popover">
        <p className="contribution-title">
          <Sparkles size={13} aria-hidden="true" />
          <strong>Repd prepared this {kind}</strong>
        </p>
        <span
          className={`state-pill ${delivered ? "sent" : approved ? "approved" : "proposed"}`}
        >
          {delivered
            ? "Delivery confirmed"
            : approved
              ? "Approved internally"
              : "Awaiting review"}
        </span>
        <p>{action.explanation}</p>
        <p>
          {delivered
            ? "The audit trail records explicit delivery confirmation."
            : kind === "invoice"
              ? "This is an internal draft. It has not been numbered, issued, or sent."
              : "No message is treated as sent until delivery is explicitly confirmed."}
        </p>
        <Link href={`/actions/${action.id}`}>
          {approved ? "Open approved artifact" : "Review and correct"}
        </Link>
      </div>
    </details>
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
        {state.messages.map((message) => {
          const action = state.allActions.find(
            (candidate) => candidate.id === message.actionId,
          );
          return (
            <article
              className="artifact-row"
              key={message.id}
              data-agent-context-kind="artifact"
              data-agent-context-id={message.id}
              data-agent-context-label={`Communication: ${message.subject}`}
            >
              <FileText size={17} />
              <div>
                <strong>{message.subject}</strong>
                <span>Communication · revision {message.revision}</span>
              </div>
              {action && (
                <ArtifactContribution
                  action={action}
                  artifactStatus={message.status}
                  kind="communication"
                />
              )}
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
          );
        })}
        {state.invoiceDrafts.map((draft) => {
          const action = state.allActions.find(
            (candidate) => candidate.id === draft.actionId,
          );
          return (
            <article
              className="artifact-row"
              key={draft.id}
              data-agent-context-kind="artifact"
              data-agent-context-id={draft.id}
              data-agent-context-label="Invoice draft"
            >
              <FileText size={17} />
              <div>
                <strong>Invoice draft</strong>
                <span>{draft.status} · internal draft, not issued or sent</span>
              </div>
              {action && (
                <ArtifactContribution
                  action={action}
                  artifactStatus={draft.status}
                  kind="invoice"
                />
              )}
              <small className={`record-state ${draft.status}`}>
                {draft.status}
              </small>
              {draft.actionId && (
                <Link
                  className="quiet-link"
                  href={`/actions/${draft.actionId}`}
                >
                  Review
                </Link>
              )}
            </article>
          );
        })}
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
              data-agent-context-kind="source"
              data-agent-context-id={source.id}
              data-agent-context-label={
                source.subject ?? source.type.replaceAll("_", " ")
              }
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
  const kindLabel = (item: JobActivityItem) => {
    if (item.kind === "source_received") return "Incoming information";
    if (item.kind === "approval") return "Review & approval";
    if (item.kind === "handoff") return "Handoff";
    if (item.kind === "delivery_confirmation") return "Delivery confirmation";
    if (item.kind === "artifact_prepared") return "Agent contribution";
    if (item.kind === "failure") return "Exception";
    if (item.category === "human") return "Human action";
    if (item.category === "agent") return "Agent action";
    return "System update";
  };
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
                  <span>
                    {item.actorLabel} · {kindLabel(item)}
                  </span>
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
