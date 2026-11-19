"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Bot, Check, LoaderCircle, Maximize2, Minimize2, Send, X } from "lucide-react";
import {
  sendAgentMessage,
  type AgentPanelState,
} from "@/lib/agent-server-actions";

const initialState: AgentPanelState = {};

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function AgentPanel({
  expanded = false,
  initialThreadId,
  initialMessages = [],
}: {
  expanded?: boolean;
  initialThreadId?: string;
  initialMessages?: ConversationMessage[];
}) {
  const path = usePathname();
  const contextJobId = path.match(/^\/jobs\/([^/]+)/)?.[1] ?? "";
  const [open, setOpen] = useState(expanded);
  const [wide, setWide] = useState(false);
  const [state, action, pending] = useActionState(sendAgentMessage, {
    ...initialState,
    threadId: initialThreadId,
  });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.response) form.current?.reset();
  }, [state.response]);
  useEffect(() => {
    if (expanded || path === "/agent") return;
    document.documentElement.classList.toggle("agent-panel-open", open);
    document.documentElement.classList.toggle("agent-panel-wide", open && wide);
    return () => {
      document.documentElement.classList.remove("agent-panel-open", "agent-panel-wide");
    };
  }, [expanded, open, path, wide]);

  const content = (
    <section className={expanded ? "agent-workspace" : "agent-drawer"} aria-label="Repd agent">
      <header className="agent-head">
        <div><span className="agent-mark"><Bot size={18} /></span><div><strong>Ask Repd</strong><small>Works across every job</small></div></div>
        {!expanded && <div className="agent-head-actions"><button className="button ghost small" onClick={() => setWide((value) => !value)} aria-label={wide ? "Use default panel width" : "Expand agent panel"}>{wide ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button><button className="button ghost small" onClick={() => setOpen(false)} aria-label="Close agent"><X size={18} /></button></div>}
      </header>
      <div className="agent-conversation">
        {!initialMessages.length && !state.response && (
          <div className="agent-welcome">
            <h2>What should Repd handle?</h2>
            <p>Ask about today’s priorities, a job’s status, or record a treatment decision. Repd will show its work and stop for approval before anything is sent.</p>
            <div className="agent-prompts">
              <span>What needs my attention today?</span>
              <span>What’s holding up the New Balance job?</span>
            </div>
          </div>
        )}
        {initialMessages.length > 0 && (
          <div className="agent-history-list">
            {initialMessages.map((message) => (
              <article className={`agent-message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "You" : "Repd"}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        )}
        {state.events && (
          <details className="agent-execution" open={state.status === "failed"}>
            <summary>{state.status === "failed" ? "Execution needs attention" : "View execution details"}</summary>
            <ol className="agent-events">
              {state.events.map((event) => (
                <li className={event.status === "failed" ? "failed" : ""} key={event.id}>
                  {event.status === "failed" ? <X size={14} /> : <Check size={14} />}
                  <div><strong>{event.label}</strong>{event.detail && <span>{event.detail}</span>}</div>
                </li>
              ))}
            </ol>
          </details>
        )}
        {state.response && (
          <div className={`agent-response ${state.status ?? ""}`}>
            <p>{state.response}</p>
            {state.links?.map((link) => <Link className="button secondary small" href={link.href} key={link.href}>{link.label}</Link>)}
          </div>
        )}
        {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      </div>
      <form ref={form} action={action} className="agent-composer">
        <input type="hidden" name="threadId" value={state.threadId ?? ""} />
        <input type="hidden" name="contextJobId" value={contextJobId} />
        <textarea name="content" rows={expanded ? 3 : 2} aria-label="Instruction to Repd" placeholder={contextJobId ? "Ask about this job…" : "Ask Repd to check or prepare something…"} required minLength={3} />
        <button className="button" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}<span>{pending ? "Working" : "Send to Repd"}</span></button>
      </form>
      <p className="agent-boundary">This sends an instruction to Repd. External messages still require your approval and delivery confirmation.</p>
      {!expanded && <Link className="agent-expand" href="/agent">Open full workspace →</Link>}
    </section>
  );

  if (expanded) return content;
  if (path === "/agent") return null;
  return (
    <>
      {!open && <button className="agent-launcher" onClick={() => setOpen(true)}><Bot size={20} /> Ask Repd</button>}
      {open && content}
    </>
  );
}
