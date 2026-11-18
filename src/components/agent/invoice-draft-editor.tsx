"use client";

import { useActionState } from "react";
import { saveInvoiceDraft, type AgentFormState } from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

export function InvoiceDraftEditor({
  draft,
  fallbackDescription,
  currency,
}: {
  draft: {
    id: string;
    billingName: string | null;
    billingEmail: string | null;
    paymentTerms: string | null;
    notes: string | null;
    lineItems: Array<{ description: string; amountCents: number }>;
  };
  fallbackDescription: string;
  currency: string;
}) {
  const [state, action] = useActionState(
    saveInvoiceDraft,
    {} as AgentFormState,
  );
  const line = draft.lineItems[0];
  return (
    <form action={action} className="invoice-editor">
      <input type="hidden" name="draftId" value={draft.id} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="billingName">Bill to</label>
          <input
            id="billingName"
            name="billingName"
            defaultValue={draft.billingName ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="billingEmail">Billing email</label>
          <input
            id="billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={draft.billingEmail ?? ""}
          />
        </div>
        <div className="field full">
          <label htmlFor="description">Line item</label>
          <input
            id="description"
            name="description"
            required
            defaultValue={line?.description ?? fallbackDescription}
          />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount ({currency})</label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={(line?.amountCents ?? 0) / 100}
          />
        </div>
        <div className="field">
          <label htmlFor="paymentTerms">Payment terms</label>
          <input
            id="paymentTerms"
            name="paymentTerms"
            defaultValue={draft.paymentTerms ?? ""}
          />
        </div>
        <div className="field full">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={draft.notes ?? ""}
          />
        </div>
      </div>
      {state.error && <div className="form-message error">{state.error}</div>}
      {state.success && (
        <div className="form-message success">{state.success}</div>
      )}
      <div className="form-actions">
        <SubmitButton className="button secondary">
          Save invoice draft
        </SubmitButton>
      </div>
    </form>
  );
}
