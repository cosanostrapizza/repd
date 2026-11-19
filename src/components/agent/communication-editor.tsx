"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  approveCommunication,
  confirmCommunicationSent,
  recordCommunicationHandoff,
  reviseCommunication,
  saveCommunication,
  type AgentFormState,
} from "@/lib/agent-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: AgentFormState = {};
function Message({ state }: { state: AgentFormState }) {
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

export function CommunicationEditor({
  communication,
  actionId: _actionId,
  questions,
}: {
  communication: {
    id: string;
    toEmail: string | null;
    subject: string;
    body: string;
    status: string;
    revision: number;
  };
  actionId: string;
  questions: Array<{
    id: string;
    question: string;
    whyItMatters: string;
    status: string;
  }>;
}) {
  void _actionId;
  const [dirty, setDirty] = useState(false);
  const [saveState, saveAction] = useActionState(
    async (previous: AgentFormState, data: FormData) => {
      const result = await saveCommunication(previous, data);
      if (result.success) setDirty(false);
      return result;
    },
    initial,
  );
  const [rewriteState, rewriteAction] = useActionState(
    reviseCommunication,
    initial,
  );
  const [approveState, approveAction] = useActionState(
    approveCommunication,
    initial,
  );
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const handoff = async (method: "copy" | "client") => {
    if (method === "copy") {
      await navigator.clipboard.writeText(
        `Subject: ${communication.subject}\n\n${communication.body}`,
      );
      setCopied(true);
    }
    const data = new FormData();
    data.set("communicationId", communication.id);
    data.set("method", method);
    startTransition(() => recordCommunicationHandoff(data));
  };
  const mailto = `mailto:${encodeURIComponent(communication.toEmail ?? "")}?subject=${encodeURIComponent(communication.subject)}&body=${encodeURIComponent(communication.body)}`;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <div className="communication-workspace compact-communication">
      <section className="communication-draft">
        <div className="communication-title">
          <div>
            <p className="eyebrow">
              Prepared reply · revision {communication.revision}
            </p>
            <h2>Reply to the producer</h2>
          </div>
          <span className={`state-pill ${communication.status}`}>
            {communication.status.replaceAll("_", " ")}
          </span>
        </div>
        <form action={saveAction} onChange={() => setDirty(true)}>
          <input
            type="hidden"
            name="communicationId"
            value={communication.id}
          />
          <div className="communication-address">
            <label>
              <span>To</span>
              <input
                aria-label="To"
                name="toEmail"
                type="email"
                defaultValue={communication.toEmail ?? ""}
                placeholder="Recipient email missing"
              />
            </label>
            <label>
              <span>Subject</span>
              <input
                aria-label="Subject"
                name="subject"
                defaultValue={communication.subject}
              />
            </label>
          </div>
          <div className="field">
            <label htmlFor="body">Draft</label>
            <textarea
              id="body"
              name="body"
              rows={10}
              defaultValue={communication.body}
            />
          </div>
          <Message state={saveState} />
          <div className="draft-actions">
            <SubmitButton className="button secondary small">
              Save edits
            </SubmitButton>
            <span>Edits remain a draft until approved.</span>
          </div>
        </form>
        <details className="communication-tools">
          <summary>Revise with Repd</summary>
          <form action={rewriteAction}>
            <input
              type="hidden"
              name="communicationId"
              value={communication.id}
            />
            <div className="inline-fields">
              <label className="field">
                <span>Tone</span>
                <select name="tone">
                  <option value="warm">Warm</option>
                  <option value="direct">Direct</option>
                  <option value="concise">More concise</option>
                </select>
              </label>
              <label className="field grow">
                <span>Direction</span>
                <input
                  name="instruction"
                  placeholder="Make the opening less formal…"
                />
              </label>
              <SubmitButton className="button secondary small">
                Revise
              </SubmitButton>
            </div>
            <Message state={rewriteState} />
          </form>
        </details>
        {questions.length > 0 && (
          <details className="communication-tools">
            <summary>
              Supporting context · {questions.length} open{" "}
              {questions.length === 1 ? "item" : "items"}
            </summary>
            {questions.map((q) => (
              <div className="question-row" key={q.id}>
                <strong>{q.question}</strong>
                <span className={`state-pill ${q.status}`}>{q.status}</span>
              </div>
            ))}
          </details>
        )}
      </section>
      <section className="approval-bar">
        <div>
          <strong>
            {communication.status === "draft"
              ? "Review required"
              : "Approved for handoff"}
          </strong>
          <p>
            {communication.status === "draft"
              ? "Approval does not send this email."
              : "Choose a handoff method, then confirm only after sending."}
          </p>
          <Message state={approveState} />
        </div>
        <div className="approval-actions">
          {communication.status === "draft" && (
            <form action={approveAction}>
              <input
                type="hidden"
                name="communicationId"
                value={communication.id}
              />
              <button className="button" disabled={dirty}>
                {dirty ? "Save edits before approval" : "Approve draft"}
              </button>
            </form>
          )}
          {["approved", "copied", "opened_in_client"].includes(
            communication.status,
          ) && (
            <>
              <button
                className="button secondary"
                disabled={pending}
                onClick={() => handoff("copy")}
              >
                {copied ? "Copied" : "Copy email"}
              </button>
              <a
                className="button"
                href={mailto}
                onClick={() => handoff("client")}
              >
                Open email client
              </a>
              <form action={confirmCommunicationSent}>
                <input
                  type="hidden"
                  name="communicationId"
                  value={communication.id}
                />
                <button
                  className="button ghost"
                  title="Only use this after sending from your email client"
                >
                  I sent it
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
