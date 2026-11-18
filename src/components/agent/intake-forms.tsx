"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  acceptReviewAction,
  submitInquiry,
  submitJobResponse,
  type AgentFormState,
} from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: AgentFormState = {};
function StateMessage({ state }: { state: AgentFormState }) {
  return state.error ? (
    <div className="form-message error" role="alert">
      {state.error}
    </div>
  ) : state.success ? (
    <div className="form-message success" role="status">
      {state.success}
    </div>
  ) : null;
}

export function InquiryForm({
  configured,
  model,
}: {
  configured: boolean;
  model: string;
}) {
  const [state, action] = useActionState(submitInquiry, initial);
  return (
    <form action={action} className="intake-form">
      <div className="field">
        <label htmlFor="inquiry-content">Paste the producer’s message</label>
        <textarea
          id="inquiry-content"
          name="content"
          rows={14}
          required
          placeholder={`Hi Alex — We’re producing a campaign for…`}
        />
      </div>
      <div className={`provider-state ${configured ? "ready" : "unavailable"}`}>
        <span className="status-dot" />
        <div>
          <strong>
            {configured
              ? `AI ready · ${model}`
              : "AI analysis isn’t configured"}
          </strong>
          <p>
            {configured
              ? "Repd will preserve the source, assess the opportunity, and prepare a response. You only need to correct what it misunderstood."
              : "The inquiry can still be preserved, but extraction requires OPENAI_API_KEY. Manual job creation remains available."}
          </p>
        </div>
      </div>
      <StateMessage state={state} />
      <div className="form-actions">
        <Link href="/jobs/new" className="button secondary">
          Create manually
        </Link>
        <SubmitButton>
          {configured ? "Understand inquiry" : "Preserve inquiry"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function ResponseForm({
  jobId,
  configured,
}: {
  jobId: string;
  configured: boolean;
}) {
  const [state, action] = useActionState(submitJobResponse, initial);
  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="field">
        <label htmlFor="response-content">Paste the producer’s response</label>
        <textarea
          id="response-content"
          name="content"
          rows={12}
          required
          placeholder="Paste the reply exactly as received…"
        />
      </div>
      {!configured && (
        <div className="form-message error">
          AI reconciliation requires OPENAI_API_KEY. The source will still be
          preserved.
        </div>
      )}
      <StateMessage state={state} />
      <div className="form-actions">
        <SubmitButton>
          {configured ? "Review new information" : "Preserve response"}
        </SubmitButton>
      </div>
    </form>
  );
}

export type ReviewField = {
  key: string;
  label: string;
  value: unknown;
  state: string;
  confidence: number;
  evidence: { quote: string; rationale: string } | null;
  existing?: unknown;
};
export function ReviewAcceptanceForm({
  reviewId,
  targetJobId,
  kind,
  summary,
  assessment,
  recommendations,
  producerRequests,
  requestedDates,
  holdRequest,
  preparedResponse,
  fields,
  candidates = [],
}: {
  reviewId: string;
  targetJobId?: string | null;
  kind: "new_job" | "job_update" | "producer_response";
  summary: string;
  assessment: string;
  recommendations: string[];
  producerRequests: string[];
  requestedDates: Array<{
    label: string;
    relationship: "single" | "alternative" | "range";
  }>;
  holdRequest: { requested: boolean; kind: string | null; dates: string[] };
  preparedResponse: { subject: string; body: string };
  fields: ReviewField[];
  candidates?: Array<{ jobId: string; title: string; confidence: number }>;
}) {
  const [state, action] = useActionState(acceptReviewAction, initial);
  const visibleFacts = fields.filter(
    (field) =>
      field.value != null &&
      [
        "clientName",
        "location",
        "feeCents",
        "usageTerms",
        "deliverables",
        "producerName",
      ].includes(field.key),
  );
  const formatFact = (field: ReviewField) =>
    field.key === "feeCents" && typeof field.value === "number"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(field.value / 100)
      : String(field.value);
  return (
    <form action={action} className="briefing-review-form">
      <input type="hidden" name="reviewId" value={reviewId} />
      {targetJobId && (
        <input type="hidden" name="targetJobId" value={targetJobId} />
      )}
      <section className="briefing-block understanding-block">
        <p className="eyebrow">Repd’s understanding</p>
        <p className="briefing-summary">{summary}</p>
      </section>
      <section className="briefing-block">
        <p className="eyebrow">
          {kind === "producer_response"
            ? "Proposed changes"
            : "The opportunity"}
        </p>
        <div className="opportunity-list">
          {requestedDates.length > 0 && (
            <div>
              <span>Dates</span>
              <strong>
                {requestedDates.map((date) => date.label).join(" or ")}
              </strong>
              <small>
                {requestedDates.some(
                  (date) => date.relationship === "alternative",
                )
                  ? "Alternatives under consideration"
                  : "Proposed schedule"}
              </small>
            </div>
          )}
          {visibleFacts.map((field) => (
            <div key={field.key}>
              <span>{field.label}</span>
              <strong>{formatFact(field)}</strong>
              <small>{field.state}</small>
            </div>
          ))}
          {holdRequest.requested && (
            <div>
              <span>Booking</span>
              <strong>
                {holdRequest.kind === "first"
                  ? "First hold requested"
                  : holdRequest.kind === "second"
                    ? "Second hold requested"
                    : "Hold requested"}
              </strong>
              <small>Requested—not granted</small>
            </div>
          )}
        </div>
      </section>
      {producerRequests.length > 0 && kind === "producer_response" && (
        <section className="briefing-block">
          <p className="eyebrow">What the producer said</p>
          <ul className="plain-list">
            {producerRequests.map((request) => (
              <li key={request}>{request}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="briefing-block assessment-block">
        <p className="eyebrow">Repd’s assessment</p>
        <p>{assessment}</p>
      </section>
      <section className="briefing-block">
        <p className="eyebrow">Recommended next move</p>
        <ol className="recommendation-list">
          {recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ol>
      </section>
      {kind !== "producer_response" && (
        <section className="briefing-block prepared-response">
          <div>
            <p className="eyebrow">Prepared response</p>
            <p className="trust-note">
              Editable now and again before handoff. Creating the job does not
              send it.
            </p>
          </div>
          <div className="field">
            <label htmlFor="preparedSubject">Subject</label>
            <input
              id="preparedSubject"
              name="preparedSubject"
              defaultValue={preparedResponse.subject}
            />
          </div>
          <div className="field">
            <label htmlFor="preparedBody">Message</label>
            <textarea
              id="preparedBody"
              name="preparedBody"
              rows={10}
              defaultValue={preparedResponse.body}
            />
          </div>
        </section>
      )}
      <details className="briefing-block correction-panel">
        <summary>Edit details and inspect evidence</summary>
        <p className="trust-note">
          Corrections change Repd’s interpretation. They do not confirm a
          business term.
        </p>
        {!targetJobId && candidates.length > 0 && (
          <div className="field match-choice">
            <label htmlFor="targetJobId">Create new or match existing</label>
            <select id="targetJobId" name="targetJobId">
              <option value="">Create a new job</option>
              {candidates.map((candidate) => (
                <option value={candidate.jobId} key={candidate.jobId}>
                  Match to {candidate.title} (
                  {Math.round(candidate.confidence * 100)}% similarity)
                </option>
              ))}
            </select>
            <p className="trust-note">
              Repd never merges a possible duplicate automatically.
            </p>
          </div>
        )}
        <div className="review-fields compact-review-fields">
          {fields.map((field) => (
            <div className="review-field" key={field.key}>
              <div className="review-field-head">
                <div>
                  <span className="eyebrow">{field.label}</span>
                  {field.existing !== undefined &&
                    field.existing !== null &&
                    String(field.existing) !== String(field.value ?? "") && (
                      <div className="existing-value">
                        Current: {String(field.existing)}
                      </div>
                    )}
                </div>
                <span className={`state-pill ${field.state}`}>
                  {field.state}
                </span>
              </div>
              <input
                aria-label={field.label}
                name={`field_${field.key}`}
                defaultValue={
                  field.value == null
                    ? ""
                    : String(
                        field.key === "feeCents" &&
                          typeof field.value === "number"
                          ? field.value / 100
                          : field.value,
                      )
                }
                placeholder="Not found"
              />
              <label className="reject-interpretation">
                <input
                  type="checkbox"
                  name={`decision_${field.key}`}
                  value="reject"
                />
                Ignore this interpretation
              </label>
              {field.evidence && (
                <details className="evidence">
                  <summary>Why Repd understood this</summary>
                  <blockquote>“{field.evidence.quote}”</blockquote>
                  <p>
                    {field.evidence.rationale} ·{" "}
                    {Math.round(field.confidence * 100)}% confidence
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      </details>
      <StateMessage state={state} />
      <div className="form-actions briefing-primary-actions">
        <SubmitButton>
          {kind === "producer_response"
            ? "Accept coherent update"
            : targetJobId
              ? "Update job & review next steps"
              : "Create job & review next steps"}
        </SubmitButton>
      </div>
    </form>
  );
}
