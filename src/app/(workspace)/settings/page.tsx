import { LogOut } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { logout } from "@/lib/server-actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireContext();

  return (
    <div className="content narrow-content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
          <p className="muted">Your workspace and signed-in account.</p>
        </div>
      </div>
      <section
        className="settings-section"
        aria-labelledby="workspace-settings"
      >
        <h2 id="workspace-settings">Workspace</h2>
        <div className="field-rows">
          <div className="field-row">
            <span>Name</span>
            <strong>{ctx.workspace.name}</strong>
          </div>
          <div className="field-row">
            <span>Your role</span>
            <strong>{ctx.role}</strong>
          </div>
        </div>
      </section>
      <section className="settings-section" aria-labelledby="account-settings">
        <h2 id="account-settings">Account</h2>
        <div className="field-rows">
          <div className="field-row">
            <span>Name</span>
            <strong>{ctx.user.name}</strong>
          </div>
          <div className="field-row">
            <span>Email</span>
            <strong>{ctx.user.email}</strong>
          </div>
        </div>
        <form action={logout} className="settings-actions">
          <button className="button secondary">
            <LogOut size={16} /> Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
