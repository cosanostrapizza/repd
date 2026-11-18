import Link from "next/link";
import { SignupForm } from "@/components/forms";
export default function SignupPage() {
  return (
    <>
      <p className="eyebrow">Start organized</p>
      <h1 style={{ fontSize: 38 }}>Create your workspace</h1>
      <p className="muted">
        Your jobs and relationships stay isolated to your team.
      </p>
      <SignupForm />
      <p className="muted" style={{ marginTop: 22 }}>
        Already have an account?{" "}
        <Link href="/login" style={{ fontWeight: 700 }}>
          Sign in
        </Link>
      </p>
    </>
  );
}
