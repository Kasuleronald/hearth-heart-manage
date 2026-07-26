ALTER TABLE "events" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "report_attendance" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ministers" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "strengths" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "challenges_faced" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recommendations" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "report_notes" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "report_submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "report_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_report_submitted_by_users_id_fk" FOREIGN KEY ("report_submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;