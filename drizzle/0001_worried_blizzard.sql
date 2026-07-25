ALTER TABLE "departments" ADD COLUMN "allowed_modules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "requisition_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;