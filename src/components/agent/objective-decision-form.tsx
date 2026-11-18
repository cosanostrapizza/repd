"use client";

import { useActionState } from "react";
import { saveInquiryDecisions, type AgentFormState } from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: AgentFormState = {};

export function ObjectiveDecisionForm({
  objectiveId,
  dateOptions,
  askCategoryConflict,
}: {
  objectiveId: string;
  dateOptions: Array<{
    id: string;
    label: string;
    holdRequested: boolean;
    holdPriority: "first" | "second" | "unspecified" | null;
    holdState: string;
    decision: "offer" | "defer" | "decline" | null;
    checkResult: string;
  }>;
  askCategoryConflict: boolean;
}) {
  const [state, action] = useActionState(saveInquiryDecisions, initial);
  return (
    <form action={action} className="objective-decisions">
      <input type="hidden" name="objectiveId" value={objectiveId} />
      <fieldset className="decision-fieldset">
        <legend>Are you interested?</legend>
        <p>
          Repd will use this to shape the response—not as a database status.
        </p>
        <label className="decision-option">
          <input type="radio" name="interest" value="yes" required />
          <span>
            <strong>Yes, explore the opportunity</strong>
            <small>Prepare an interested response and clarify key terms.</small>
          </span>
        </label>
        <label className="decision-option">
          <input type="radio" name="interest" value="maybe" required />
          <span>
            <strong>Maybe, depending on terms</strong>
            <small>
              Keep the response conditional and commercially focused.
            </small>
          </span>
        </label>
        <label className="decision-option">
          <input type="radio" name="interest" value="no" required />
          <span>
            <strong>No, decline</strong>
            <small>
              Prepare a polite decline and ask no follow-up questions.
            </small>
          </span>
        </label>
      </fieldset>

      {dateOptions.length > 0 && (
        <fieldset className="decision-fieldset">
          <legend>How should we handle the dates?</legend>
          <p>
            Each option is separate. A requested hold is not active until you
            offer it.
          </p>
          {dateOptions.map((option) => (
            <div className="date-decision" key={option.id}>
              <div>
                <strong>{option.label}</strong>
                <span>
                  {option.holdRequested
                    ? `${option.holdPriority ?? "unspecified"} hold requested · ${option.holdState}`
                    : "No hold requested"}
                </span>
                <small>{option.checkResult}</small>
              </div>
              <select
                aria-label={`Decision for ${option.label}`}
                name={`dateDecision_${option.id}`}
                defaultValue={option.decision ?? "defer"}
              >
                {option.holdRequested && (
                  <option value="offer">Offer requested hold</option>
                )}
                <option value="defer">Do not commit yet</option>
                <option value="decline">Decline this date</option>
              </select>
            </div>
          ))}
        </fieldset>
      )}

      {askCategoryConflict && (
        <fieldset className="decision-fieldset">
          <legend>Any relevant category conflicts?</legend>
          <p>
            Repd checked recorded history, but no contract repository is
            connected.
          </p>
          <label className="decision-option compact-option">
            <input
              type="radio"
              name="categoryConflict"
              value="none_known"
              required
            />
            <span>
              <strong>No known conflict</strong>
            </span>
          </label>
          <label className="decision-option compact-option">
            <input
              type="radio"
              name="categoryConflict"
              value="possible"
              required
            />
            <span>
              <strong>There may be a conflict</strong>
            </span>
          </label>
          <label className="decision-option compact-option">
            <input
              type="radio"
              name="categoryConflict"
              value="unsure"
              required
            />
            <span>
              <strong>I’m not sure</strong>
            </span>
          </label>
        </fieldset>
      )}

      {state.error && (
        <div className="form-message error" role="alert">
          {state.error}
        </div>
      )}
      <div className="form-actions">
        <SubmitButton>Prepare the right response</SubmitButton>
      </div>
    </form>
  );
}
