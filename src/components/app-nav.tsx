"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  Bot,
  SunMedium,
  UsersRound,
} from "lucide-react";

const links = [
  { href: "/", label: "Today", icon: SunMedium },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/people", label: "Relationships", icon: UsersRound },
  { href: "/agent", label: "Ask Repd", icon: Bot },
];
export function AppNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={
            path === href || (href !== "/" && path.startsWith(href))
              ? "active"
              : ""
          }
        >
          <Icon aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Mobile primary">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={
            path === href || (href !== "/" && path.startsWith(href))
              ? "active"
              : ""
          }
        >
          <Icon aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
