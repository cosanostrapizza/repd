"use client";

import { useActionState } from "react";
import {
  saveTreatmentCommitmentDecision,
  type AgentFormState,
} from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: AgentFormState = {};

export function TreatmentDecisionForm({
  objectiveId,
  deadline,
  prerequisite,
}: {
  objectiveId: string;
  deadline: string | null;
  prerequisite: string | null;
}) {
  const [state, action] = useActionState(
    saveTreatmentCommitmentDecision,
    initial,
  );
  return (
    <form action={action} className="objective-decisions">
      <input type="hidden" name="objectiveId" value={objectiveId} />
      <fieldset className="decision-fieldset">
        <legend>Can you commit to the treatment deadline?</legend>
        <p>
          {deadline ? `Requested deadline: ${deadline}. ` : ""}
          {prerequisite ?? "The producer’s deck has not been reviewed yet."}
        </p>
        <label className="decision-option">
          <input
            type="radio"
            name="treatmentDecision"
            value="commit_after_deck"
            required
          />
          <span>
            <strong>Commit, subject to reviewing the deck</strong>
            <small>Preserve the deck review as an explicit condition.</small>
          </span>
        </label>
        <label className="decision-option">
          <input
            type="radio"
            name="treatmentDecision"
            value="need_deck_first"
            required
          />
          <span>
            <strong>Review the deck before committing</strong>
            <small>Tell the producer the deadline is not accepted yet.</small>
          </span>
        </label>
        <label className="decision-option">
          <input
            type="radio"
            name="treatmentDecision"
            value="cannot_commit"
            required
          />
          <span>
            <strong>Cannot commit to the deadline</strong>
          </span>
        </label>
      </fieldset>
      {state.error && (
        <div className="form-message error" role="alert">
          {state.error}
        </div>
      )}
      <div className="form-actions">
        <SubmitButton>Prepare treatment response</SubmitButton>
      </div>
    </form>
  );
}
