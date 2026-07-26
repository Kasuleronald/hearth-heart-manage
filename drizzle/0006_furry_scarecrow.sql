CREATE TABLE "member_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"email" text,
	"gender" text,
	"birth_month" integer,
	"birth_day" integer,
	"birth_year" integer,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_registrations" ADD CONSTRAINT "member_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_registrations" ADD CONSTRAINT "member_registrations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_registrations" ADD CONSTRAINT "member_registrations_created_member_id_members_id_fk" FOREIGN KEY ("created_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_registrations_org_idx" ON "member_registrations" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "member_registrations" AS PERMISSIVE FOR ALL TO "app_user" USING ("member_registrations"."organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("member_registrations"."organization_id" = current_setting('app.current_org_id', true)::uuid);