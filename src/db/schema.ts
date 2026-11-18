import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...audit,
});
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...audit,
});
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("brand"),
    website: text("website"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    uniqueIndex("organizations_workspace_name").on(t.workspaceId, t.name),
  ],
);
export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [uniqueIndex("people_workspace_email").on(t.workspaceId, t.email)],
);
export const affiliations = pgTable("affiliations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  personId: text("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title"),
  startedOn: date("started_on"),
  endedOn: date("ended_on"),
  isPrimary: boolean("is_primary").notNull().default(false),
  ...audit,
});

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    clientOrganizationId: text("client_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    jobType: text("job_type", {
      enum: ["commercial", "editorial", "portrait", "event", "other"],
    })
      .notNull()
      .default("commercial"),
    lifecycleStatus: text("lifecycle_status", {
      enum: [
        "inquiry",
        "preproduction",
        "in_production",
        "completed",
        "cancelled",
      ],
    })
      .notNull()
      .default("inquiry"),
    bookingStatus: text("booking_status", {
      enum: ["unbooked", "first_hold", "second_hold", "confirmed", "released"],
    })
      .notNull()
      .default("unbooked"),
    shootStart: timestamp("shoot_start", { withTimezone: true }),
    shootEnd: timestamp("shoot_end", { withTimezone: true }),
    location: text("location"),
    feeCents: integer("fee_cents"),
    feeState: text("fee_state", { enum: ["proposed", "confirmed"] })
      .notNull()
      .default("proposed"),
    currency: text("currency").notNull().default("USD"),
    usageTerms: text("usage_terms"),
    deliverables: text("deliverables"),
    paymentTerms: text("payment_terms"),
    invoiceStatus: text("invoice_status", {
      enum: ["not_ready", "ready", "sent", "paid"],
    })
      .notNull()
      .default("not_ready"),
    notes: text("notes"),
    ...audit,
  },
  (t) => [uniqueIndex("jobs_workspace_id").on(t.workspaceId, t.id)],
);
export const jobParticipants = pgTable("job_participants", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  personId: text("person_id").references(() => people.id, {
    onDelete: "set null",
  }),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  role: text("role").notNull(),
  displayNameSnapshot: text("display_name_snapshot").notNull(),
  ...audit,
});
export const holds = pgTable("holds", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["first", "second", "confirmed"] }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["active", "released", "converted"] })
    .notNull()
    .default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  ...audit,
});

export const actions = pgTable(
  "actions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    personId: text("person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    recommendation: text("recommendation").notNull(),
    priority: text("priority", {
      enum: ["urgent", "blocking", "routine", "optional"],
    }).notNull(),
    status: text("status", {
      enum: [
        "open",
        "deferred",
        "pending_approval",
        "approved",
        "executing",
        "resolved",
      ],
    })
      .notNull()
      .default("open"),
    executionStatus: text("execution_status", {
      enum: ["not_requested", "ready", "executing", "succeeded", "failed"],
    })
      .notNull()
      .default("not_requested"),
    deduplicationKey: text("deduplication_key").notNull(),
    idempotencyKey: text("idempotency_key"),
    payloadSchemaVersion: integer("payload_schema_version")
      .notNull()
      .default(1),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    resolutionCondition: jsonb("resolution_condition")
      .$type<{
        type: string;
        field?: string;
        value?: string;
        questionIds?: string[];
      }>()
      .notNull(),
    resolutionReason: text("resolution_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    deferredUntil: timestamp("deferred_until", { withTimezone: true }),
    supersededById: text("superseded_by_id"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    preparedContent: text("prepared_content"),
    reevaluatedAt: timestamp("reevaluated_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    uniqueIndex("actions_workspace_dedup").on(
      t.workspaceId,
      t.deduplicationKey,
    ),
  ],
);
export const actionEvents = pgTable("action_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actionId: text("action_id")
    .notNull()
    .references(() => actions.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  direction: text("direction", { enum: ["incoming", "outgoing", "internal"] })
    .notNull()
    .default("incoming"),
  subject: text("subject"),
  sender: text("sender"),
  content: text("content"),
  externalRef: text("external_ref"),
  contentHash: text("content_hash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});
export const jobFields = pgTable(
  "job_fields",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label"),
    requirementState: text("requirement_state", {
      enum: ["required_now", "required_later", "optional", "not_applicable"],
    })
      .notNull()
      .default("optional"),
    requirementReason: text("requirement_reason"),
    acceptedRevisionId: text("accepted_revision_id"),
    ...audit,
  },
  (t) => [uniqueIndex("job_fields_identity").on(t.jobId, t.key)],
);
export const jobFieldRevisions = pgTable("job_field_revisions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  fieldId: text("field_id")
    .notNull()
    .references(() => jobFields.id, { onDelete: "cascade" }),
  sourceId: text("source_id").references(() => sources.id, {
    onDelete: "restrict",
  }),
  value: jsonb("value").$type<unknown>(),
  informationState: text("information_state", {
    enum: ["confirmed", "proposed", "unconfirmed", "missing", "conflicting"],
  }).notNull(),
  confidence: integer("confidence"),
  reviewStatus: text("review_status", {
    enum: ["pending", "accepted", "rejected"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const intakeReviews = pgTable("intake_reviews", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "restrict" }),
  targetJobId: text("target_job_id").references(() => jobs.id, {
    onDelete: "set null",
  }),
  kind: text("kind", {
    enum: ["new_job", "job_update", "producer_response"],
  }).notNull(),
  status: text("status", {
    enum: ["processing", "ready", "accepted", "rejected", "failed"],
  })
    .notNull()
    .default("processing"),
  proposedData: jsonb("proposed_data").$type<Record<string, unknown>>(),
  matchCandidates: jsonb("match_candidates")
    .$type<
      Array<{
        jobId: string;
        title: string;
        reason: string;
        confidence: number;
      }>
    >()
    .notNull()
    .default([]),
  analysis: jsonb("analysis").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  ...audit,
});
export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  fieldKey: text("field_key").notNull(),
  question: text("question").notNull(),
  whyItMatters: text("why_it_matters").notNull(),
  recipientPersonId: text("recipient_person_id").references(() => people.id, {
    onDelete: "set null",
  }),
  status: text("status", { enum: ["draft", "asked", "answered", "obsolete"] })
    .notNull()
    .default("draft"),
  askedAt: timestamp("asked_at", { withTimezone: true }),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  sourceId: text("source_id").references(() => sources.id, {
    onDelete: "set null",
  }),
  ...audit,
});
export const communications = pgTable("communications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  actionId: text("action_id").references(() => actions.id, {
    onDelete: "set null",
  }),
  recipientPersonId: text("recipient_person_id").references(() => people.id, {
    onDelete: "set null",
  }),
  toEmail: text("to_email"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", {
    enum: ["draft", "approved", "copied", "opened_in_client", "sent", "failed"],
  })
    .notNull()
    .default("draft"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  failureMessage: text("failure_message"),
  revision: integer("revision").notNull().default(1),
  ...audit,
});
export const aiRuns = pgTable("ai_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  sourceId: text("source_id").references(() => sources.id, {
    onDelete: "set null",
  }),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  status: text("status", { enum: ["running", "succeeded", "failed"] })
    .notNull()
    .default("running"),
  requestId: text("request_id"),
  inputHash: text("input_hash").notNull(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
export const invoiceDrafts = pgTable("invoice_drafts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  actionId: text("action_id").references(() => actions.id, {
    onDelete: "set null",
  }),
  status: text("status", { enum: ["draft", "ready", "approved"] })
    .notNull()
    .default("draft"),
  lineItems: jsonb("line_items")
    .$type<Array<{ description: string; amountCents: number }>>()
    .notNull()
    .default([]),
  billingName: text("billing_name"),
  billingEmail: text("billing_email"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  ...audit,
});

export type Job = typeof jobs.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type IntakeReview = typeof intakeReviews.$inferSelect;
export type Communication = typeof communications.$inferSelect;
