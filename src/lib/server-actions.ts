"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, ensureDatabase, id } from "@/db/client";
import {
  actionEvents,
  actions,
  activities,
  affiliations,
  holds,
  jobParticipants,
  jobs,
  organizations,
  people,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { clearSession, createSession, requireContext } from "./auth";
import { reevaluateWorkspace } from "./action-engine";
import {
  type BookingStatus,
  type LifecycleStatus,
  validateJobStatus,
} from "./domain";

const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;
const dateValue = (data: FormData, key: string) => {
  const value = optional(data, key);
  return value ? new Date(value) : null;
};

export type FormState = { error?: string; success?: string };

export async function login(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  await ensureDatabase();
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return { error: "Email or password is incorrect." };
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id))
    .limit(1);
  if (!membership) return { error: "This account has no workspace." };
  await createSession(user.id, membership.workspaceId);
  redirect("/");
}

export async function signup(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  await ensureDatabase();
  const parsed = z
    .object({
      name: z.string().min(2),
      workspace: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    })
    .safeParse({
      name: text(formData, "name"),
      workspace: text(formData, "workspace"),
      email: text(formData, "email").toLowerCase(),
      password: text(formData, "password"),
    });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  const exists = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (exists.length)
    return { error: "An account already exists for this email." };
  const userId = id("usr"),
    workspaceId = id("ws");
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: parsed.data.workspace,
      slug: `${parsed.data.workspace.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${workspaceId.slice(-5)}`,
    });
    await tx
      .insert(workspaceMembers)
      .values({ userId, workspaceId, role: "owner" });
  });
  await createSession(userId, workspaceId);
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function createJob(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const title = text(formData, "title");
  if (title.length < 2) return { error: "Give the job a clear title." };
  const lifecycle = text(formData, "lifecycleStatus") as LifecycleStatus;
  const booking = text(formData, "bookingStatus") as BookingStatus;
  const errors = validateJobStatus(lifecycle, booking);
  if (errors.length) return { error: errors[0] };
  const jobId = id("job");
  let organizationId: string | null = optional(
    formData,
    "clientOrganizationId",
  );
  const newClient = optional(formData, "newClient");
  if (newClient) {
    const existing = await db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.workspaceId, ctx.workspaceId),
          eq(organizations.name, newClient),
        ),
      )
      .limit(1);
    organizationId = existing[0]?.id ?? id("org");
    if (!existing[0])
      await db.insert(organizations).values({
        id: organizationId,
        workspaceId: ctx.workspaceId,
        name: newClient,
        kind: "brand",
      });
  }
  const start = dateValue(formData, "shootStart"),
    end = dateValue(formData, "shootEnd");
  if (start && end && end <= start)
    return { error: "End time must be after the start time." };
  const fee = optional(formData, "fee");
  const feeState =
    text(formData, "feeState") === "confirmed" ? "confirmed" : "proposed";
  await db.insert(jobs).values({
    id: jobId,
    workspaceId: ctx.workspaceId,
    title,
    clientOrganizationId: organizationId,
    lifecycleStatus: lifecycle,
    bookingStatus: booking,
    shootStart: start,
    shootEnd: end,
    location: optional(formData, "location"),
    feeCents: fee ? Math.round(Number(fee) * 100) : null,
    feeState,
    usageTerms: optional(formData, "usageTerms"),
    deliverables: optional(formData, "deliverables"),
    paymentTerms: optional(formData, "paymentTerms"),
    notes: optional(formData, "notes"),
  });
  await db.insert(activities).values({
    id: id("activity"),
    workspaceId: ctx.workspaceId,
    jobId,
    actorUserId: ctx.userId,
    type: "job_created",
    summary: "Job created",
  });
  await reevaluateWorkspace(ctx.workspaceId);
  redirect(`/jobs/${jobId}`);
}

export async function updateJob(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const jobId = text(formData, "jobId");
  const [current] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!current) return { error: "Job not found." };
  const lifecycle = text(formData, "lifecycleStatus") as LifecycleStatus;
  const booking = text(formData, "bookingStatus") as BookingStatus;
  const errors = validateJobStatus(lifecycle, booking);
  if (errors.length) return { error: errors[0] };
  const start = dateValue(formData, "shootStart"),
    end = dateValue(formData, "shootEnd");
  if (start && end && end <= start)
    return { error: "End time must be after the start time." };
  const fee = optional(formData, "fee");
  const feeState =
    text(formData, "feeState") === "confirmed" ? "confirmed" : "proposed";
  const invoiceStatus = text(formData, "invoiceStatus") as
    "not_ready" | "ready" | "sent" | "paid";
  await db
    .update(jobs)
    .set({
      title: text(formData, "title"),
      lifecycleStatus: lifecycle,
      bookingStatus: booking,
      shootStart: start,
      shootEnd: end,
      location: optional(formData, "location"),
      feeCents: fee ? Math.round(Number(fee) * 100) : null,
      feeState,
      usageTerms: optional(formData, "usageTerms"),
      deliverables: optional(formData, "deliverables"),
      paymentTerms: optional(formData, "paymentTerms"),
      notes: optional(formData, "notes"),
      invoiceStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, ctx.workspaceId)));
  await db.insert(activities).values({
    id: id("activity"),
    workspaceId: ctx.workspaceId,
    jobId,
    actorUserId: ctx.userId,
    type: "job_updated",
    summary: "Job details updated",
    metadata: {
      lifecycleFrom: current.lifecycleStatus,
      lifecycleTo: lifecycle,
      bookingFrom: current.bookingStatus,
      bookingTo: booking,
    },
  });
  await reevaluateWorkspace(ctx.workspaceId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
  revalidatePath("/jobs");
  return { success: "Job updated." };
}

export async function addParticipant(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const jobId = text(formData, "jobId");
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!job) return { error: "Job not found." };
  const name = text(formData, "name"),
    email = optional(formData, "email")?.toLowerCase() ?? null,
    role = text(formData, "role") || "Producer";
  if (!name) return { error: "Enter the contact’s name." };
  let person = email
    ? (
        await db
          .select()
          .from(people)
          .where(
            and(
              eq(people.workspaceId, ctx.workspaceId),
              eq(people.email, email),
            ),
          )
          .limit(1)
      )[0]
    : undefined;
  if (!person) {
    const personId = id("person");
    await db
      .insert(people)
      .values({ id: personId, workspaceId: ctx.workspaceId, name, email });
    person = (
      await db.select().from(people).where(eq(people.id, personId)).limit(1)
    )[0];
  }
  await db.insert(jobParticipants).values({
    id: id("participant"),
    workspaceId: ctx.workspaceId,
    jobId,
    personId: person!.id,
    role,
    displayNameSnapshot: name,
  });
  revalidatePath(`/jobs/${jobId}`);
  return { success: "Contact added and saved to People." };
}

export async function createContact(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const kind = text(formData, "recordType");
  const name = text(formData, "name");
  if (!name) return { error: "Name is required." };
  if (kind === "organization") {
    const duplicate = await db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.workspaceId, ctx.workspaceId),
          eq(organizations.name, name),
        ),
      )
      .limit(1);
    if (duplicate.length)
      return {
        error:
          "An organization with this name already exists. Open that record instead.",
      };
    await db.insert(organizations).values({
      id: id("org"),
      workspaceId: ctx.workspaceId,
      name,
      kind: text(formData, "kind") || "brand",
      website: optional(formData, "website"),
      notes: optional(formData, "notes"),
    });
  } else {
    const email = optional(formData, "email")?.toLowerCase() ?? null;
    if (email) {
      const duplicate = await db
        .select()
        .from(people)
        .where(
          and(eq(people.workspaceId, ctx.workspaceId), eq(people.email, email)),
        )
        .limit(1);
      if (duplicate.length)
        return {
          error:
            "A person with this email already exists. Open that record instead.",
        };
    }
    await db.insert(people).values({
      id: id("person"),
      workspaceId: ctx.workspaceId,
      name,
      email,
      phone: optional(formData, "phone"),
      notes: optional(formData, "notes"),
    });
  }
  revalidatePath("/people");
  return {
    success: `${kind === "organization" ? "Organization" : "Person"} added.`,
  };
}

export async function archiveRelationship(formData: FormData) {
  const ctx = await requireContext();
  const recordType = text(formData, "recordType"),
    recordId = text(formData, "recordId");
  if (recordType === "organization")
    await db
      .update(organizations)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(organizations.id, recordId),
          eq(organizations.workspaceId, ctx.workspaceId),
        ),
      );
  else
    await db
      .update(people)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(people.id, recordId), eq(people.workspaceId, ctx.workspaceId)),
      );
  revalidatePath("/people");
  redirect("/people");
}

export async function addAffiliation(formData: FormData) {
  const ctx = await requireContext();
  const personId = text(formData, "personId"),
    organizationId = text(formData, "organizationId");
  const [person] = await db
    .select()
    .from(people)
    .where(
      and(eq(people.id, personId), eq(people.workspaceId, ctx.workspaceId)),
    )
    .limit(1);
  const [org] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (person && org)
    await db.insert(affiliations).values({
      id: id("aff"),
      workspaceId: ctx.workspaceId,
      personId,
      organizationId,
      title: optional(formData, "title"),
      startedOn: optional(formData, "startedOn"),
      isPrimary: formData.get("isPrimary") === "on",
    });
  revalidatePath(`/people/${personId}`);
}

export async function addHold(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const jobId = text(formData, "jobId");
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!job) return { error: "Job not found." };
  const startsAt = dateValue(formData, "startsAt"),
    endsAt = dateValue(formData, "endsAt");
  if (!startsAt || !endsAt || endsAt <= startsAt)
    return { error: "Choose a valid start and end." };
  const kind = text(formData, "kind") as "first" | "second" | "confirmed";
  await db.insert(holds).values({
    id: id("hold"),
    workspaceId: ctx.workspaceId,
    jobId,
    kind,
    startsAt,
    endsAt,
    expiresAt: dateValue(formData, "expiresAt"),
  });
  const bookingStatus =
    kind === "first"
      ? "first_hold"
      : kind === "second"
        ? "second_hold"
        : "confirmed";
  const lifecycleStatus =
    kind === "confirmed" && job.lifecycleStatus === "inquiry"
      ? "preproduction"
      : job.lifecycleStatus;
  await db
    .update(jobs)
    .set({
      bookingStatus,
      lifecycleStatus,
      shootStart: job.shootStart ?? startsAt,
      shootEnd: job.shootEnd ?? endsAt,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
  await reevaluateWorkspace(ctx.workspaceId);
  revalidatePath("/calendar");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/");
  return { success: "Hold added." };
}

export async function transitionHold(formData: FormData) {
  const ctx = await requireContext();
  const holdId = text(formData, "holdId"),
    transition = text(formData, "transition");
  const [hold] = await db
    .select()
    .from(holds)
    .where(and(eq(holds.id, holdId), eq(holds.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!hold) return;
  if (transition === "release") {
    await db
      .update(holds)
      .set({
        status: "released",
        releasedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(holds.id, holdId));
    await db
      .update(jobs)
      .set({ bookingStatus: "released", updatedAt: new Date() })
      .where(
        and(eq(jobs.id, hold.jobId), eq(jobs.workspaceId, ctx.workspaceId)),
      );
  }
  if (transition === "confirm") {
    await db
      .update(holds)
      .set({ status: "converted", updatedAt: new Date() })
      .where(eq(holds.id, holdId));
    await db.insert(holds).values({
      id: id("hold"),
      workspaceId: ctx.workspaceId,
      jobId: hold.jobId,
      kind: "confirmed",
      status: "active",
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
    });
    await db
      .update(jobs)
      .set({
        bookingStatus: "confirmed",
        lifecycleStatus: "preproduction",
        updatedAt: new Date(),
      })
      .where(
        and(eq(jobs.id, hold.jobId), eq(jobs.workspaceId, ctx.workspaceId)),
      );
  }
  await reevaluateWorkspace(ctx.workspaceId);
  revalidatePath("/calendar");
  revalidatePath(`/jobs/${hold.jobId}`);
  revalidatePath("/");
}

export async function transitionAction(formData: FormData) {
  const ctx = await requireContext();
  const actionId = text(formData, "actionId"),
    transition = text(formData, "transition");
  const [action] = await db
    .select()
    .from(actions)
    .where(
      and(eq(actions.id, actionId), eq(actions.workspaceId, ctx.workspaceId)),
    )
    .limit(1);
  if (!action) return;
  let status = action.status,
    reason: string | null = null,
    resolvedAt: Date | null = action.resolvedAt,
    deferredUntil: Date | null = action.deferredUntil;
  if (transition === "dismiss") {
    status = "resolved";
    reason = "dismissed_by_user";
    resolvedAt = new Date();
  }
  if (transition === "resolve") {
    status = "resolved";
    reason = "completed_by_user";
    resolvedAt = new Date();
  }
  if (transition === "approve") status = "approved";
  if (transition === "defer") {
    status = "deferred";
    deferredUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  await db
    .update(actions)
    .set({
      status,
      resolutionReason: reason,
      resolvedAt,
      deferredUntil,
      updatedAt: new Date(),
    })
    .where(
      and(eq(actions.id, actionId), eq(actions.workspaceId, ctx.workspaceId)),
    );
  await db.insert(actionEvents).values({
    id: id("aev"),
    workspaceId: ctx.workspaceId,
    actionId,
    type: transition,
    fromStatus: action.status,
    toStatus: status,
    reason,
  });
  revalidatePath("/");
  revalidatePath("/actions");
}
