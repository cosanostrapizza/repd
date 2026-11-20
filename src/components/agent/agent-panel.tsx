"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Bot,
  Check,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Send,
  X,
} from "lucide-react";
import type { AgentPageContext } from "@/lib/agent-context";
import {
  sendAgentMessage,
  type AgentPanelState,
} from "@/lib/agent-server-actions";

const initialState: AgentPanelState = {};
const openAgentEvent = "repd:open-agent";
const focusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  links?: Array<{ href: string; label: string }>;
  currentOutcome?: {
    state: string;
    label: string;
    detail: string;
    href: string;
    actionId: string;
  } | null;
};

function contextFromPage(
  path: string,
  selectedElement?: Element | null,
): AgentPageContext {
  const jobRoot = document.querySelector<HTMLElement>("[data-agent-job-id]");
  const jobId =
    jobRoot?.dataset.agentJobId ?? path.match(/^\/jobs\/([^/]+)/)?.[1];
  const title = jobRoot?.dataset.agentJobTitle;
  const contextual = selectedElement?.closest<HTMLElement>(
    "[data-agent-context-kind]",
  );
  const rawKind = contextual?.dataset.agentContextKind;
  const kind =
    rawKind === "field" ||
    rawKind === "artifact" ||
    rawKind === "source" ||
    rawKind === "section"
      ? rawKind
      : undefined;
  const label = contextual?.dataset.agentContextLabel;
  return {
    route: path,
    ...(jobId ? { job: { id: jobId, ...(title ? { title } : {}) } } : {}),
    ...(kind && label
      ? { selected: { kind, id: contextual?.dataset.agentContextId, label } }
      : {}),
  };
}

function contextDescription(context: AgentPageContext) {
  if (context.selected && context.job)
    return `${context.job.title ?? "Current job"} · ${context.selected.label}`;
  if (context.job) return context.job.title ?? "Current job";
  return "Workspace-wide";
}

function subscribeToMobileViewport(callback: () => void) {
  const media = window.matchMedia("(max-width: 900px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function mobileViewportSnapshot() {
  return window.matchMedia("(max-width: 900px)").matches;
}

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
  const router = useRouter();
  const [open, setOpen] = useState(expanded);
  const [wide, setWide] = useState(false);
  const mobileModal = useSyncExternalStore(
    subscribeToMobileViewport,
    mobileViewportSnapshot,
    () => false,
  );
  const [pageContext, setPageContext] = useState<AgentPageContext>({
    route: path,
  });
  const [state, action, pending] = useActionState(sendAgentMessage, {
    ...initialState,
    threadId: initialThreadId,
  });
  const form = useRef<HTMLFormElement>(null);
  const surface = useRef<HTMLElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const lastContextElement = useRef<Element | null>(null);
  const handledSubmission = useRef<string | null>(null);

  const contextJobId = pageContext.job?.id ?? "";
  const serializedContext = useMemo(
    () => JSON.stringify(pageContext),
    [pageContext],
  );
  const messages = useMemo(() => {
    const byId = new Map(
      initialMessages.map((message) => [message.id, message]),
    );
    const submission = state.submission;
    if (submission) {
      byId.set(submission.userMessageId, {
        id: submission.userMessageId,
        role: "user",
        content: submission.content,
      });
      byId.set(submission.assistantMessageId, {
        id: submission.assistantMessageId,
        role: "assistant",
        content: submission.response,
        links: state.links,
      });
    }
    return [...byId.values()];
  }, [initialMessages, state.links, state.submission]);

  function captureContext(element?: Element | null) {
    const selectedElement = element?.closest("[data-agent-context-kind]")
      ? element
      : lastContextElement.current;
    const next = contextFromPage(path, selectedElement);
    setPageContext(next);
    return next;
  }

  function showPanel(opener?: HTMLElement | null) {
    const active = document.activeElement as HTMLElement | null;
    returnFocus.current =
      opener ??
      (active && active !== document.body
        ? active
        : document.querySelector<HTMLElement>(".global-agent-launcher"));
    captureContext(opener);
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    const target = returnFocus.current;
    window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus();
    });
  }

  useEffect(() => {
    function rememberContext(event: PointerEvent | FocusEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-agent-context-kind]"))
        lastContextElement.current = target;
    }
    document.addEventListener("pointerdown", rememberContext, true);
    document.addEventListener("focusin", rememberContext, true);
    return () => {
      document.removeEventListener("pointerdown", rememberContext, true);
      document.removeEventListener("focusin", rememberContext, true);
    };
  }, []);

  useEffect(() => {
    lastContextElement.current = null;
    const frame = window.requestAnimationFrame(() => captureContext());
    let observer: MutationObserver | null = null;
    if (path.startsWith("/jobs/"))
      observer = new MutationObserver(() => {
        if (!document.querySelector("[data-agent-job-id]")) return;
        captureContext();
        observer?.disconnect();
      });
    if (observer)
      observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
    // The current page DOM is intentionally sampled after a route transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const submission = state.submission;
    if (!submission || handledSubmission.current === submission.runId) return;
    handledSubmission.current = submission.runId;
    form.current?.reset();
    router.refresh();
  }, [router, state.submission]);

  useEffect(() => {
    function handleOpen(event: Event) {
      const source =
        event instanceof CustomEvent &&
        event.detail?.opener instanceof HTMLElement
          ? event.detail.opener
          : null;
      showPanel(source);
    }
    window.addEventListener(openAgentEvent, handleOpen);
    return () => window.removeEventListener(openAgentEvent, handleOpen);
    // The handler must capture the current pathname.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (path === "/agent") return;
        event.preventDefault();
        if (open) composer.current?.focus();
        else showPanel();
        return;
      }
      if (event.key === "Escape" && open && !expanded) {
        event.preventDefault();
        closePanel();
        return;
      }
      if (
        event.key === "Tab" &&
        open &&
        !expanded &&
        window.matchMedia("(max-width: 900px)").matches
      ) {
        const focusable = Array.from(
          surface.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
            [],
        );
        const first = focusable.at(0);
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
    // The current open state is part of keyboard behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, open, path]);

  useEffect(() => {
    if (open) composer.current?.focus();
  }, [open]);

  useEffect(() => {
    if (expanded || path === "/agent") return;
    document.documentElement.classList.toggle("agent-panel-open", open);
    document.documentElement.classList.toggle("agent-panel-wide", open && wide);
    document.documentElement.classList.toggle("agent-panel-modal", open);
    return () => {
      document.documentElement.classList.remove(
        "agent-panel-open",
        "agent-panel-wide",
        "agent-panel-modal",
      );
    };
  }, [expanded, open, path, wide]);

  useEffect(() => {
    conversation.current?.scrollTo({
      top: conversation.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, state.events]);

  const content = (
    <section
      ref={surface}
      className={expanded ? "agent-workspace" : "agent-drawer"}
      aria-label="Ask Repd"
      role={expanded ? "region" : "dialog"}
      aria-modal={!expanded ? mobileModal : undefined}
      aria-describedby="agent-context-description"
    >
      <header className="agent-head">
        <div>
          <span className="agent-mark">
            <Bot size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Ask Repd</strong>
            <small id="agent-context-description">
              {contextDescription(pageContext)}
            </small>
          </div>
        </div>
        {!expanded && (
          <div className="agent-head-actions">
            <button
              type="button"
              className="button ghost small"
              onClick={() => setWide((value) => !value)}
              aria-label={
                wide ? "Use default panel width" : "Expand agent panel"
              }
              aria-pressed={wide}
            >
              {wide ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              type="button"
              className="button ghost small"
              onClick={closePanel}
              aria-label="Close agent"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </header>
      <div ref={conversation} className="agent-conversation" aria-live="polite">
        {!messages.length && !pending && (
          <div className="agent-welcome">
            <h2>What should Repd handle?</h2>
            <p>
              Ask about current work or prepare a supported artifact. Repd uses
              the current workspace context and stops at existing approval
              boundaries.
            </p>
            <div className="agent-prompts" aria-label="Suggested instructions">
              {[
                "What needs my attention today?",
                contextJobId
                  ? "What is holding up this job?"
                  : "Which jobs are blocked?",
                "Prepare invoices for completed jobs that are ready.",
              ].map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => {
                    if (composer.current) composer.current.value = prompt;
                    composer.current?.focus();
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <div className="agent-history-list">
            {messages.map((message) => (
              <article
                className={`agent-message ${message.role}${
                  message.id === state.submission?.assistantMessageId
                    ? ` agent-response ${state.status ?? ""}`
                    : ""
                }`}
                key={message.id}
              >
                <span>{message.role === "user" ? "You" : "Repd"}</span>
                <p>{message.content}</p>
                {message.links?.map((link) => (
                  <Link
                    className="button secondary small"
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
                {message.currentOutcome && (
                  <div
                    className={`conversation-outcome ${message.currentOutcome.state}`}
                  >
                    <small>Current business state</small>
                    <strong>{message.currentOutcome.label}</strong>
                    <p>{message.currentOutcome.detail}</p>
                    <Link
                      className="button secondary small"
                      href={message.currentOutcome.href}
                    >
                      {message.currentOutcome.state === "ready"
                        ? "Review reply"
                        : "Open current workflow"}
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {pending && (
          <div className="agent-running" role="status">
            <LoaderCircle className="spin" size={16} />
            <span>Repd is working in this session…</span>
          </div>
        )}
        {state.events && (
          <details className="agent-execution" open={state.status === "failed"}>
            <summary>
              {state.status === "failed"
                ? "Execution needs attention"
                : "View execution details"}
            </summary>
            <ol className="agent-events">
              {state.events.map((event) => (
                <li
                  className={event.status === "failed" ? "failed" : ""}
                  key={event.id}
                >
                  {event.status === "failed" ? (
                    <X size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  <div>
                    <strong>{event.label}</strong>
                    {event.detail && <span>{event.detail}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </details>
        )}
        {state.error && (
          <p className="form-message error" role="alert">
            {state.error}
          </p>
        )}
      </div>
      <form ref={form} action={action} className="agent-composer">
        <input type="hidden" name="threadId" value={state.threadId ?? ""} />
        <input type="hidden" name="contextJobId" value={contextJobId} />
        <input type="hidden" name="pageContext" value={serializedContext} />
        <textarea
          ref={composer}
          name="content"
          rows={expanded ? 3 : 2}
          aria-label="Instruction to Repd"
          placeholder={
            contextJobId
              ? "Ask about this job…"
              : "Ask Repd to check or prepare something…"
          }
          required
          minLength={3}
        />
        <button className="button" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Send size={18} />
          )}
          <span>{pending ? "Working" : "Send to Repd"}</span>
        </button>
      </form>
      <p className="agent-boundary">
        Repd can prepare supported work here. External messages and issued
        artifacts still require the existing approval and handoff steps.
      </p>
      {!expanded && (
        <Link className="agent-expand" href="/agent">
          Open full workspace →
        </Link>
      )}
    </section>
  );

  if (expanded) return content;
  if (path === "/agent" || !open) return null;
  return content;
}
