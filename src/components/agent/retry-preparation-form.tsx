"use client";

import { useActionState } from "react";
import {
  retryTreatmentPreparation,
  type AgentFormState,
} from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: AgentFormState = {};

export function RetryPreparationForm({
  actionId,
  compact = false,
}: {
  actionId: string;
  compact?: boolean;
}) {
  const [state, action] = useActionState(
    retryTreatmentPreparation,
    initialState,
  );
  return (
    <form action={action} className="retry-preparation-form">
      <input type="hidden" name="actionId" value={actionId} />
      <SubmitButton className={`button secondary${compact ? " small" : ""}`}>
        Retry preparation
      </SubmitButton>
      <span className="retry-progress" aria-live="polite">
        {state.error ?? state.success ?? ""}
      </span>
    </form>
  );
}
