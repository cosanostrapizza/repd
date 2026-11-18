CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text,
	"job_id" text,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"schema_version" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"request_id" text,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"error_code" text,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" text NOT NULL,
	"action_id" text,
	"recipient_person_id" text,
	"to_email" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"failure_message" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_job_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"proposed_data" jsonb,
	"match_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analysis" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" text NOT NULL,
	"action_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"billing_name" text,
	"billing_email" text,
	"payment_terms" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"job_id" text NOT NULL,
	"field_key" text NOT NULL,
	"question" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"recipient_person_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"asked_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "execution_status" text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "payload_schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "approved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "job_fields" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "job_fields" ADD COLUMN "requirement_state" text DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_fields" ADD COLUMN "requirement_reason" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_type" text DEFAULT 'commercial' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "fee_state" text DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "direction" text DEFAULT 'incoming' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "sender" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_reviews" ADD CONSTRAINT "intake_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_reviews" ADD CONSTRAINT "intake_reviews_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_reviews" ADD CONSTRAINT "intake_reviews_target_job_id_jobs_id_fk" FOREIGN KEY ("target_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "ai_runs" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "communications" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "intake_reviews" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "invoice_drafts" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "questions" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
