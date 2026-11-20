"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  ContactRound,
  Settings,
  SunMedium,
  type LucideIcon,
} from "lucide-react";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matches?: (path: string) => boolean;
};

const primary: NavigationItem[] = [
  { href: "/", label: "Today", icon: SunMedium },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
];

const secondary: NavigationItem[] = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  {
    href: "/contacts",
    label: "Contacts",
    icon: ContactRound,
    matches: (path) =>
      path === "/contacts" ||
      path.startsWith("/people/") ||
      path.startsWith("/organizations/"),
  },
];

const utilities: NavigationItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(path: string, item: NavigationItem) {
  if (item.matches?.(path)) return true;
  if (item.href === "/") return path === "/";
  return path === item.href || path.startsWith(`${item.href}/`);
}

function NavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavigationItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const Icon = item.icon;
  const active = isActive(path, item);

  return (
    <Link
      href={item.href}
      className={active ? "active" : ""}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      data-tooltip={collapsed ? item.label : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden size={17} strokeWidth={1.8} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="nav" aria-label="Workspace navigation">
      <div className="nav-section nav-primary">
        {primary.map((item) => (
          <NavItem
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
            key={item.href}
          />
        ))}
      </div>
      <div className="nav-section nav-secondary">
        <p className="nav-section-label">Workspace</p>
        {secondary.map((item) => (
          <NavItem
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
            key={item.href}
          />
        ))}
      </div>
    </nav>
  );
}

export function UtilityNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="nav utility-nav" aria-label="Account navigation">
      {utilities.map((item) => (
        <NavItem
          item={item}
          collapsed={collapsed}
          onNavigate={onNavigate}
          key={item.href}
        />
      ))}
    </nav>
  );
}
