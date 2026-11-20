"use client";

export default function JobError({ reset }: { reset: () => void }) {
  return (
    <div className="content narrow-content">
      <section className="job-error" role="alert">
        <p className="eyebrow">Job workspace</p>
        <h1>We couldn’t load this job.</h1>
        <p>
          The record is still intact. Try loading it again; no changes were
          made.
        </p>
        <button className="button" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
