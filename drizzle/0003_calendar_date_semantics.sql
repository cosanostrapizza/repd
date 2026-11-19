ALTER TABLE "jobs" ADD COLUMN "shoot_date" date;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD COLUMN "starts_on" date;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD COLUMN "ends_on" date;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD COLUMN "client_selected" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD COLUMN "client_selection_source_id" text;
--> statement-breakpoint
ALTER TABLE "coordination_date_options" ADD CONSTRAINT "coordination_date_options_client_selection_source_id_sources_id_fk" FOREIGN KEY ("client_selection_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
