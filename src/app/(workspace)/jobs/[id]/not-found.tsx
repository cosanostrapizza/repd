import Link from "next/link";
export default function NotFound() {
  return (
    <div className="content">
      <div className="card empty">
        <h1>Job not found</h1>
        <p>It may have been removed, or it belongs to another workspace.</p>
        <Link href="/jobs" className="button">
          Back to jobs
        </Link>
      </div>
    </div>
  );
}
