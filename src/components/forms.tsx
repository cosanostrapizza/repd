"use client";
import { useActionState } from "react";
import Link from "next/link";
import {
  addHold,
  addParticipant,
  createContact,
  createJob,
  login,
  signup,
  updateJob,
  type FormState,
} from "@/lib/server-actions";
import { SubmitButton } from "./submit-button";
import type { Job, Organization } from "@/db/schema";
import { bookingLabels, lifecycleLabels } from "@/lib/domain";

const initial: FormState = {};
function Message({ state }: { state: FormState }) {
  return state.error ? (
    <div className="form-message error" role="alert">
      {state.error}
    </div>
  ) : state.success ? (
    <div className="form-message success" role="status">
      {state.success}
    </div>
  ) : null;
}
const datetime = (value: Date | null) =>
  value
    ? new Date(value.getTime() - value.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";

export function LoginForm() {
  const [state, action] = useActionState(login, initial);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Message state={state} />
      <SubmitButton className="button accent">Sign in</SubmitButton>
    </form>
  );
}
export function SignupForm() {
  const [state, action] = useActionState(signup, initial);
  return (
    <form action={action}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="signup-name">Name</label>
          <input id="signup-name" name="name" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="signup-workspace">Workspace name</label>
          <input
            id="signup-workspace"
            name="workspace"
            required
            placeholder="Your studio"
          />
        </div>
        <div className="field full">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="field full">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <Message state={state} />
      <SubmitButton className="button accent">Create workspace</SubmitButton>
    </form>
  );
}

function StatusFields({ job }: { job?: Job }) {
  return (
    <>
      <div className="field">
        <label htmlFor="lifecycleStatus">Lifecycle</label>
        <select
          id="lifecycleStatus"
          name="lifecycleStatus"
          defaultValue={job?.lifecycleStatus ?? "inquiry"}
        >
          {Object.entries(lifecycleLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="bookingStatus">Booking</label>
        <select
          id="bookingStatus"
          name="bookingStatus"
          defaultValue={job?.bookingStatus ?? "unbooked"}
        >
          {Object.entries(bookingLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
export function JobForm({
  organizations,
  job,
}: {
  organizations: Organization[];
  job?: Job;
}) {
  const [state, action] = useActionState(job ? updateJob : createJob, initial);
  return (
    <form action={action}>
      {job && <input type="hidden" name="jobId" value={job.id} />}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="title">Job title</label>
          <input
            id="title"
            name="title"
            defaultValue={job?.title}
            required
            placeholder="e.g. Summer campaign"
          />
        </div>
        {!job && (
          <>
            <div className="field">
              <label htmlFor="clientOrganizationId">Existing client</label>
              <select
                id="clientOrganizationId"
                name="clientOrganizationId"
                defaultValue=""
              >
                <option value="">No client selected</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="newClient">Or add a new client</label>
              <input
                id="newClient"
                name="newClient"
                placeholder="Client or brand name"
              />
            </div>
          </>
        )}
        <StatusFields job={job} />
        <div className="field">
          <label htmlFor="shootStart">Shoot starts</label>
          <input
            id="shootStart"
            name="shootStart"
            type="datetime-local"
            defaultValue={datetime(job?.shootStart ?? null)}
          />
        </div>
        <div className="field">
          <label htmlFor="shootEnd">Shoot ends</label>
          <input
            id="shootEnd"
            name="shootEnd"
            type="datetime-local"
            defaultValue={datetime(job?.shootEnd ?? null)}
          />
        </div>
        <div className="field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            defaultValue={job?.location ?? ""}
            placeholder="Studio or city"
          />
        </div>
        <div className="field">
          <label htmlFor="fee">Fee (USD)</label>
          <input
            id="fee"
            name="fee"
            type="number"
            min="0"
            step="1"
            defaultValue={job?.feeCents ? job.feeCents / 100 : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="feeState">Fee status</label>
          <select
            id="feeState"
            name="feeState"
            defaultValue={job?.feeState ?? "proposed"}
          >
            <option value="proposed">Proposed</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor="usageTerms">Usage / licensing</label>
          <textarea
            id="usageTerms"
            name="usageTerms"
            defaultValue={job?.usageTerms ?? ""}
            placeholder="Media, territory, term, exclusivity…"
          />
        </div>
        <div className="field">
          <label htmlFor="deliverables">Deliverables</label>
          <textarea
            id="deliverables"
            name="deliverables"
            defaultValue={job?.deliverables ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="paymentTerms">Payment terms</label>
          <textarea
            id="paymentTerms"
            name="paymentTerms"
            defaultValue={job?.paymentTerms ?? ""}
            placeholder="Net 30…"
          />
        </div>
        {job && (
          <div className="field">
            <label htmlFor="invoiceStatus">Invoice status</label>
            <select
              id="invoiceStatus"
              name="invoiceStatus"
              defaultValue={job.invoiceStatus}
            >
              <option value="not_ready">Not ready</option>
              <option value="ready">Ready</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        )}
        <div className="field full">
          <label htmlFor="job-notes">Internal notes</label>
          <textarea
            id="job-notes"
            name="notes"
            defaultValue={job?.notes ?? ""}
          />
        </div>
      </div>
      <Message state={state} />
      <div className="form-actions">
        {!job && (
          <Link className="button secondary" href="/jobs">
            Cancel
          </Link>
        )}
        <SubmitButton>{job ? "Save changes" : "Create job"}</SubmitButton>
      </div>
    </form>
  );
}
export function ParticipantForm({ jobId }: { jobId: string }) {
  const [state, action] = useActionState(addParticipant, initial);
  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="participant-name">Name</label>
          <input id="participant-name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="participant-email">Email</label>
          <input id="participant-email" name="email" type="email" />
        </div>
        <div className="field full">
          <label htmlFor="participant-role">Role on this job</label>
          <input id="participant-role" name="role" defaultValue="Producer" />
        </div>
      </div>
      <Message state={state} />
      <div className="form-actions">
        <SubmitButton className="button secondary">Add contact</SubmitButton>
      </div>
    </form>
  );
}
export function HoldForm({
  jobId,
  start,
  end,
}: {
  jobId: string;
  start: Date | null;
  end: Date | null;
}) {
  const [state, action] = useActionState(addHold, initial);
  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="hold-kind">Hold type</label>
          <select id="hold-kind" name="kind">
            <option value="first">First hold</option>
            <option value="second">Second hold</option>
            <option value="confirmed">Confirmed booking</option>
          </select>
        </div>
        <div />
        <div className="field">
          <label htmlFor="hold-start">Starts</label>
          <input
            id="hold-start"
            type="datetime-local"
            name="startsAt"
            defaultValue={datetime(start)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="hold-end">Ends</label>
          <input
            id="hold-end"
            type="datetime-local"
            name="endsAt"
            defaultValue={datetime(end)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="hold-expires">Expires (optional)</label>
          <input id="hold-expires" type="datetime-local" name="expiresAt" />
        </div>
      </div>
      <Message state={state} />
      <div className="form-actions">
        <SubmitButton className="button secondary">Add hold</SubmitButton>
      </div>
    </form>
  );
}
export function ContactForm() {
  const [state, action] = useActionState(createContact, initial);
  return (
    <form action={action}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="contact-type">Record type</label>
          <select id="contact-type" name="recordType">
            <option value="person">Person</option>
            <option value="organization">Organization</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="contact-name">Name</label>
          <input id="contact-name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="contact-email">Email</label>
          <input id="contact-email" name="email" type="email" />
        </div>
        <div className="field">
          <label htmlFor="contact-phone">Phone</label>
          <input id="contact-phone" name="phone" />
        </div>
        <div className="field">
          <label htmlFor="contact-kind">Organization type</label>
          <select id="contact-kind" name="kind">
            <option value="brand">Brand</option>
            <option value="agency">Agency</option>
            <option value="production_company">Production company</option>
            <option value="studio">Studio</option>
            <option value="publication">Publication</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="contact-website">Website</label>
          <input id="contact-website" name="website" type="url" />
        </div>
      </div>
      <Message state={state} />
      <div className="form-actions">
        <SubmitButton>Add record</SubmitButton>
      </div>
    </form>
  );
}
