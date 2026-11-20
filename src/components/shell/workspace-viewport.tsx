"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Breadcrumb = {
  href?: string;
  label: string;
};

function routeBreadcrumbs(path: string, viewport: HTMLElement | null) {
  const context = viewport?.querySelector<HTMLElement>(
    "[data-workspace-current-label], [data-workspace-job-title], [data-workspace-record-title]",
  );
  const currentLabel = context?.dataset.workspaceCurrentLabel;
  const jobTitle = context?.dataset.workspaceJobTitle;
  const jobHref = context?.dataset.workspaceJobHref;
  const recordTitle = context?.dataset.workspaceRecordTitle;

  if (path === "/") return [{ label: "Today" }];
  if (path === "/jobs") return [{ label: "Jobs" }];
  if (path === "/jobs/new")
    return [{ href: "/jobs", label: "Jobs" }, { label: "New opportunity" }];
  if (path === "/inquiries/new")
    return [{ href: "/jobs", label: "Jobs" }, { label: "Add inquiry" }];
  if (path.startsWith("/inquiries/review/")) {
    const items: Breadcrumb[] = [{ href: "/jobs", label: "Jobs" }];
    if (jobTitle && jobHref) items.push({ href: jobHref, label: jobTitle });
    items.push({ label: currentLabel ?? "Review inquiry" });
    return items;
  }
  if (path.startsWith("/jobs/")) {
    const items: Breadcrumb[] = [{ href: "/jobs", label: "Jobs" }];
    const title = jobTitle ?? "Job";
    if (path.endsWith("/response")) {
      items.push({ href: jobHref, label: title });
      items.push({ label: currentLabel ?? "Producer update" });
    } else {
      items.push({ label: title });
    }
    return items;
  }
  if (path === "/actions")
    return [{ href: "/", label: "Today" }, { label: "Action history" }];
  if (path.startsWith("/actions/")) {
    if (jobTitle && jobHref)
      return [
        { href: "/jobs", label: "Jobs" },
        { href: jobHref, label: jobTitle },
        { label: currentLabel ?? "Review" },
      ];
    return [{ href: "/", label: "Today" }, { label: currentLabel ?? "Review" }];
  }
  if (path === "/calendar") return [{ label: "Calendar" }];
  if (path === "/contacts") return [{ label: "Contacts" }];
  if (path.startsWith("/people/") || path.startsWith("/organizations/"))
    return [
      { href: "/contacts", label: "Contacts" },
      { label: recordTitle ?? "Contact" },
    ];
  if (path === "/settings") return [{ label: "Settings" }];
  if (path === "/agent") return [{ label: "Ask Repd" }];
  return [{ label: currentLabel ?? "Workspace" }];
}

export function WorkspaceViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewport = useRef<HTMLDivElement>(null);
  const locationKey = useMemo(
    () => `${pathname}${searchParams.size ? `?${searchParams}` : ""}`,
    [pathname, searchParams],
  );
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>(() =>
    routeBreadcrumbs(pathname, null),
  );

  useLayoutEffect(() => {
    const root = viewport.current;
    if (!root) return;

    const update = () => {
      const next = routeBreadcrumbs(pathname, root);
      setBreadcrumbs((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useLayoutEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const storageKey = `repd:workspace-scroll:${locationKey}`;
    const saved = window.sessionStorage.getItem(storageKey);
    const savePosition = () =>
      window.sessionStorage.setItem(storageKey, String(root.scrollTop));
    const saveBeforeLinkNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("a[href]")) savePosition();
    };
    root.addEventListener("click", saveBeforeLinkNavigation, true);
    window.addEventListener("popstate", savePosition);
    window.addEventListener("beforeunload", savePosition);
    let restoreFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        if (window.location.hash) {
          root.querySelector(window.location.hash)?.scrollIntoView();
        } else {
          root.scrollTop = saved ? Number(saved) : 0;
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(restoreFrame);
      root.removeEventListener("click", saveBeforeLinkNavigation, true);
      window.removeEventListener("popstate", savePosition);
      window.removeEventListener("beforeunload", savePosition);
    };
  }, [locationKey]);

  return (
    <>
      <header className="workspace-header">
        <nav aria-label="Breadcrumb" className="workspace-breadcrumbs">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}:${index}`}>
              {index > 0 && <i aria-hidden="true">/</i>}
              {item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      </header>
      <div className="workspace-scroll" ref={viewport}>
        {children}
      </div>
    </>
  );
}
