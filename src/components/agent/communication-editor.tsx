"use client";

import { useActionState, useState, useTransition } from "react";
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
  const [saveState, saveAction] = useActionState(saveCommunication, initial);
  const [rewriteState, rewriteAction] = useActionState(
    reviseCommunication,
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
  return (
    <div className="communication-workspace">
      <section className="card card-pad">
        <div className="section-title">
          <div>
            <p className="eyebrow">
              Prepared communication · revision {communication.revision}
            </p>
            <h2>Producer email</h2>
          </div>
          <span className={`state-pill ${communication.status}`}>
            {communication.status.replaceAll("_", " ")}
          </span>
        </div>
        <form action={saveAction}>
          <input
            type="hidden"
            name="communicationId"
            value={communication.id}
          />
          <div className="field">
            <label htmlFor="toEmail">To</label>
            <input
              id="toEmail"
              name="toEmail"
              type="email"
              defaultValue={communication.toEmail ?? ""}
              placeholder="Recipient email missing"
            />
          </div>
          <div className="field">
            <label htmlFor="subject">Subject</label>
            <input
              id="subject"
              name="subject"
              defaultValue={communication.subject}
            />
          </div>
          <div className="field">
            <label htmlFor="body">Message</label>
            <textarea
              id="body"
              name="body"
              rows={14}
              defaultValue={communication.body}
            />
          </div>
          <Message state={saveState} />
          <div className="form-actions">
            <SubmitButton className="button secondary">Save draft</SubmitButton>
          </div>
        </form>
      </section>
      <aside className="workspace-rail">
        <section className="card card-pad">
          <p className="eyebrow">Questions this should answer</p>
          {questions.map((q) => (
            <div className="question-row" key={q.id}>
              <strong>{q.question}</strong>
              <p>{q.whyItMatters}</p>
              <span className={`state-pill ${q.status}`}>{q.status}</span>
            </div>
          ))}
        </section>
        <section className="card card-pad">
          <p className="eyebrow">Ask Repd to revise</p>
          <form action={rewriteAction}>
            <input
              type="hidden"
              name="communicationId"
              value={communication.id}
            />
            <div className="field">
              <label htmlFor="tone">Tone</label>
              <select id="tone" name="tone">
                <option value="warm">Warm</option>
                <option value="direct">Direct</option>
                <option value="concise">More concise</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="instruction">Optional direction</label>
              <input
                id="instruction"
                name="instruction"
                placeholder="Make the opening less formal…"
              />
            </div>
            <Message state={rewriteState} />
            <SubmitButton className="button secondary">
              Regenerate draft
            </SubmitButton>
          </form>
        </section>
      </aside>
      <section className="approval-bar">
        <div>
          <strong>
            {communication.status === "draft"
              ? "Review required"
              : "Approved for handoff"}
          </strong>
          <p>
            {communication.status === "draft"
              ? "Approval records your decision. It does not send the email."
              : "Choose a real handoff method. Repd will not claim delivery until you confirm it."}
          </p>
        </div>
        <div className="approval-actions">
          {communication.status === "draft" && (
            <form action={approveCommunication}>
              <input
                type="hidden"
                name="communicationId"
                value={communication.id}
              />
              <button className="button">Approve draft</button>
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
