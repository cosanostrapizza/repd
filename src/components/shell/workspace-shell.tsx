"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { AgentPanel } from "@/components/agent/agent-panel";
import { AppNav, UtilityNav } from "@/components/app-nav";
import { logout } from "@/lib/server-actions";

const sidebarPreferenceKey = "repd:sidebar-collapsed";
const agentOpenEvent = "repd:open-agent";

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  currentOutcome?: {
    state: string;
    label: string;
    detail: string;
    href: string;
    actionId: string;
  } | null;
};

export function WorkspaceShell({
  children,
  workspaceName,
  userName,
  role,
  initials,
  initialThreadId,
  initialMessages,
}: {
  children: React.ReactNode;
  workspaceName: string;
  userName: string;
  role: string;
  initials: string;
  initialThreadId?: string;
  initialMessages: ConversationMessage[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const mobileClose = useRef<HTMLButtonElement>(null);
  const mobilePanel = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(
        window.localStorage.getItem(sidebarPreferenceKey) === "true",
      );
      setPreferenceReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!preferenceReady) return;
    window.localStorage.setItem(sidebarPreferenceKey, String(collapsed));
  }, [collapsed, preferenceReady]);

  useEffect(() => {
    document.documentElement.classList.toggle("mobile-nav-open", mobileOpen);
    if (mobileOpen) mobileClose.current?.focus();
    return () => document.documentElement.classList.remove("mobile-nav-open");
  }, [mobileOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === "\\" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (window.matchMedia("(max-width: 900px)").matches) {
          setMobileOpen((value) => !value);
        } else {
          setCollapsed((value) => !value);
        }
      }
      if (event.key === "Escape" && mobileOpen) {
        event.preventDefault();
        setMobileOpen(false);
        mobileTrigger.current?.focus();
      }
      if (event.key === "Tab" && mobileOpen) {
        const focusable = Array.from(
          mobilePanel.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function openAgent() {
    setMobileOpen(false);
    window.dispatchEvent(new Event(agentOpenEvent));
  }

  const sidebarContent = (isCollapsed: boolean, mobile = false) => (
    <>
      <div className="sidebar-head">
        <div className="brand" aria-label="Repd">
          <span className="brand-mark" aria-hidden>
            R
          </span>
          <span className="brand-wordmark">repd</span>
        </div>
        {mobile ? (
          <button
            ref={mobileClose}
            type="button"
            className="icon-button"
            aria-label="Close navigation"
            onClick={() => {
              setMobileOpen(false);
              mobileTrigger.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="sidebar-toggle icon-button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={
              isCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            aria-expanded={!isCollapsed}
            data-tooltip={isCollapsed ? "Expand navigation (⌘\\)" : undefined}
          >
            {isCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>
        )}
      </div>
      <p className="workspace-name" title={workspaceName}>
        {workspaceName}
      </p>
      <AppNav
        collapsed={isCollapsed}
        onNavigate={mobile ? () => setMobileOpen(false) : undefined}
      />
      <div className="sidebar-utilities">
        <button
          type="button"
          className="nav-agent-button"
          onClick={openAgent}
          aria-label={isCollapsed ? "Ask Repd" : undefined}
          data-tooltip={isCollapsed ? "Ask Repd" : undefined}
        >
          <Bot aria-hidden size={17} strokeWidth={1.8} />
          <span>Ask Repd</span>
        </button>
        <UtilityNav
          collapsed={isCollapsed}
          onNavigate={mobile ? () => setMobileOpen(false) : undefined}
        />
        <div className="sidebar-footer">
          <div className="avatar" aria-hidden>
            {initials}
          </div>
          <div className="sidebar-user">
            <strong>{userName}</strong>
            <span>{role}</span>
          </div>
          <form action={logout}>
            <button
              className="icon-button"
              aria-label="Sign out"
              data-tooltip={isCollapsed ? "Sign out" : undefined}
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <div className={`app-shell${collapsed ? " sidebar-is-collapsed" : ""}`}>
      <aside className="sidebar desktop-sidebar">
        {sidebarContent(collapsed)}
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            ref={mobileTrigger}
            type="button"
            className="mobile-menu-button icon-button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="topbar-brand brand" aria-label="Repd">
            <span className="brand-mark" aria-hidden>
              R
            </span>
            <span className="brand-wordmark">repd</span>
          </div>
          <span
            className="topbar-shortcut"
            aria-label="Toggle navigation with Command or Control plus backslash"
          >
            <kbd>⌘/Ctrl</kbd>
            <kbd>\\</kbd>
          </span>
        </header>
        {children}
      </main>
      {mobileOpen && (
        <div className="mobile-nav-layer">
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={mobilePanel}
            className="sidebar mobile-sidebar"
            aria-label="Mobile navigation"
            role="dialog"
            aria-modal="true"
          >
            {sidebarContent(false, true)}
          </aside>
        </div>
      )}
      <AgentPanel
        initialThreadId={initialThreadId}
        initialMessages={initialMessages}
      />
    </div>
  );
}
