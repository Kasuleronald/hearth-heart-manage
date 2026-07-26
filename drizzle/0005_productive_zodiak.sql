CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notices_org_idx" ON "notices" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notices" AS PERMISSIVE FOR ALL TO "app_user" USING ("notices"."organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("notices"."organization_id" = current_setting('app.current_org_id', true)::uuid);