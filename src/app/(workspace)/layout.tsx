import { Bell } from "lucide-react";
import { AppNav, MobileNav } from "@/components/app-nav";
import { requireContext } from "@/lib/auth";
import { logout } from "@/lib/server-actions";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const initials = ctx.user.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>repd
        </div>
        <div className="workspace-name">{ctx.workspace.name}</div>
        <AppNav />
        <div className="sidebar-footer">
          <div className="avatar">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 13 }}>
              {ctx.user.name}
            </strong>
            <span style={{ color: "#94a199", fontSize: 11 }}>{ctx.role}</span>
          </div>
          <form action={logout} style={{ marginLeft: "auto" }}>
            <button className="button ghost small" title="Sign out">
              ↗
            </button>
          </form>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="brand" style={{ display: "none", margin: 0 }}>
            <span className="brand-mark">R</span>repd
          </div>
          <button className="button ghost" aria-label="Notifications">
            <Bell size={19} />
          </button>
        </header>
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
