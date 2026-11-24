"use client";

import { useActionState, useEffect, useState } from "react";
import {
  approveInvoiceDraft,
  saveInvoiceDraft,
  type AgentFormState,
} from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

export function InvoiceDraftEditor({
  draft,
  fallbackDescription,
  currency,
  actionId,
}: {
  draft: {
    id: string;
    billingName: string | null;
    billingEmail: string | null;
    paymentTerms: string | null;
    notes: string | null;
    status: string;
    lineItems: Array<{ description: string; amountCents: number }>;
  };
  fallbackDescription: string;
  currency: string;
  actionId: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [state, action] = useActionState(
    async (previous: AgentFormState, data: FormData) => {
      const result = await saveInvoiceDraft(previous, data);
      if (result.success) setDirty(false);
      return result;
    },
    {} as AgentFormState,
  );
  const [approvalState, approvalAction] = useActionState(
    approveInvoiceDraft,
    {} as AgentFormState,
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const line = draft.lineItems[0];
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((line?.amountCents ?? 0) / 100);
  return (
    <div className="invoice-editor">
      <div className="invoice-state-line">
        <span className={`state-pill ${draft.status}`}>
          {draft.status === "approved" ? "Approved" : "Ready for review"}
        </span>
        <span className="invoice-external-state">
          <strong>Not issued or sent</strong>
          <small>This draft has not been issued or sent.</small>
        </span>
      </div>
      <div className="invoice-document" aria-label="Invoice draft summary">
        <div>
          <span>Bill to</span>
          <strong>{draft.billingName ?? "Billing client missing"}</strong>
          {draft.billingEmail && <small>{draft.billingEmail}</small>}
        </div>
        <div>
          <span>Amount</span>
          <strong>{amount}</strong>
          <small>{draft.paymentTerms ?? "Payment terms missing"}</small>
        </div>
        <div className="invoice-document-line">
          <span>{line?.description ?? fallbackDescription}</span>
          <strong>{amount}</strong>
        </div>
      </div>
      <form action={action} onChange={() => setDirty(true)}>
        <input type="hidden" name="draftId" value={draft.id} />
        <input type="hidden" name="actionId" value={actionId} />
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
      {draft.status !== "approved" && (
        <form action={approvalAction} className="invoice-approval">
          <input type="hidden" name="draftId" value={draft.id} />
          <div>
            <strong>Approval records your decision only.</strong>
            <p>
              It does not assign an invoice number, issue, or send this invoice.
            </p>
          </div>
          <button className="button" disabled={dirty}>
            {dirty ? "Save edits before approval" : "Approve invoice draft"}
          </button>
          {approvalState.error && (
            <div className="form-message error">{approvalState.error}</div>
          )}
          {approvalState.success && (
            <div className="form-message success">{approvalState.success}</div>
          )}
        </form>
      )}
    </div>
  );
}
