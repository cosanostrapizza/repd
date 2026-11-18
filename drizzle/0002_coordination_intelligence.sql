ALTER TABLE "jobs" ADD COLUMN "title_source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "proposed_budget_min_cents" integer;
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "proposed_budget_max_cents" integer;
--> statement-breakpoint
CREATE TABLE "coordination_objectives" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "job_id" text NOT NULL,
  "source_id" text,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "outcome" text NOT NULL,
  "summary" text NOT NULL,
  "state" text DEFAULT 'awaiting_decisions' NOT NULL,
  "next_action" text NOT NULL,
  "completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordination_dependencies" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "owner" text NOT NULL,
  "status" text NOT NULL,
  "result" text NOT NULL,
  "value" jsonb,
  "evidence" jsonb,
  "resolution_source" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordination_date_options" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "objective_id" text NOT NULL,
  "job_id" text NOT NULL,
  "source_id" text,
  "label" text NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "relationship" text NOT NULL,
  "tentative" boolean DEFAULT true NOT NULL,
  "hold_requested" boolean DEFAULT false NOT NULL,
  "hold_priority" text,
  "hold_state" text DEFAULT 'not_requested' NOT NULL,
  "decision" text,
  "evidence" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coordination_objectives" ADD CONSTRAINT "coordination_objectives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coordination_objectives" ADD CONSTRAINT "coordination_objectives_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coordination_objectives" ADD CONSTRAINT "coordination_objectives_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coordination_dependencies" ADD CONSTRAINT "coordination_dependencies_objective_id_coordination_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."coordination_objectives"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD CONSTRAINT "coordination_date_options_objective_id_coordination_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."coordination_objectives"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD CONSTRAINT "coordination_date_options_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD CONSTRAINT "coordination_date_options_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "coordination_objectives_job_kind" ON "coordination_objectives" USING btree ("workspace_id","job_id","kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "coordination_dependencies_objective_key" ON "coordination_dependencies" USING btree ("objective_id","key");
--> statement-breakpoint
CREATE UNIQUE INDEX "coordination_date_options_objective_label" ON "coordination_date_options" USING btree ("objective_id","label");
--> statement-breakpoint
ALTER TABLE "coordination_objectives" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "coordination_dependencies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "coordination_objectives" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "coordination_dependencies" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "coordination_date_options" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
