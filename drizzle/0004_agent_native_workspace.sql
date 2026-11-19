ALTER TABLE "actions" ADD COLUMN "objective_id" text;
--> statement-breakpoint
CREATE TABLE "agent_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "job_id" text,
  "title" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "thread_id" text NOT NULL,
  "job_id" text,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "thread_id" text NOT NULL,
  "user_message_id" text,
  "job_id" text,
  "action_id" text,
  "communication_id" text,
  "status" text DEFAULT 'running' NOT NULL,
  "summary" text,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_run_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "type" text NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "label" text NOT NULL,
  "detail" text,
  "job_id" text,
  "action_id" text,
  "communication_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_message_id_agent_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_threads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "agent_threads" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "agent_messages" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "agent_runs" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "agent_run_events" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
