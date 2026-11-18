import Link from "next/link";
import { LoginForm } from "@/components/forms";
export default function LoginPage() {
  return (
    <>
      <p className="eyebrow">Welcome back</p>
      <h1 style={{ fontSize: 38 }}>Sign in to Repd</h1>
      <p className="muted">See what needs your attention today.</p>
      <LoginForm />
      <p className="muted" style={{ marginTop: 22 }}>
        New here?{" "}
        <Link href="/signup" style={{ color: "var(--ink)", fontWeight: 700 }}>
          Create a workspace
        </Link>
      </p>
      <div
        style={{
          borderTop: "1px solid var(--line)",
          marginTop: 22,
          paddingTop: 18,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        Demo: <strong>alex@repd.demo</strong> / <strong>creativelife</strong>
      </div>
    </>
  );
}
