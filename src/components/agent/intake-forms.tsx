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
              ? "Repd will preserve this source, extract a proposal, and ask you to review every value."
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
  fields,
  candidates = [],
}: {
  reviewId: string;
  targetJobId?: string | null;
  fields: ReviewField[];
  candidates?: Array<{ jobId: string; title: string; confidence: number }>;
}) {
  const [state, action] = useActionState(acceptReviewAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="reviewId" value={reviewId} />
      {targetJobId && (
        <input type="hidden" name="targetJobId" value={targetJobId} />
      )}
      {!targetJobId && candidates.length > 0 && (
        <div className="field match-choice">
          <label htmlFor="targetJobId">Create new or merge</label>
          <select id="targetJobId" name="targetJobId">
            <option value="">Create a new job</option>
            {candidates.map((candidate) => (
              <option value={candidate.jobId} key={candidate.jobId}>
                Merge into {candidate.title} (
                {Math.round(candidate.confidence * 100)}% similarity)
              </option>
            ))}
          </select>
          <p className="trust-note">
            Merging is your decision. Repd never merges a possible duplicate
            automatically.
          </p>
        </div>
      )}
      <div className="review-fields">
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
              <span className={`state-pill ${field.state}`}>{field.state}</span>
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
            <label className="field-decision">
              <span>Decision</span>
              <select name={`decision_${field.key}`} defaultValue="accept">
                <option value="accept">Accept proposal</option>
                <option value="reject">Reject and keep current</option>
              </select>
            </label>
            {field.evidence && (
              <details className="evidence">
                <summary>Source evidence</summary>
                <blockquote>“{field.evidence.quote}”</blockquote>
                <p>
                  {field.evidence.rationale} ·{" "}
                  {Math.round(field.confidence * 100)}% extraction confidence
                </p>
              </details>
            )}
          </div>
        ))}
      </div>
      <StateMessage state={state} />
      <div className="form-actions">
        <SubmitButton>
          {targetJobId
            ? "Accept selected understanding"
            : "Create job from review"}
        </SubmitButton>
      </div>
    </form>
  );
}
