import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession, canManageUsers } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/superadmin-preview")({
  component: SuperAdminPreviewPage,
});

// A static, non-functional concept preview of a future SuperAdmin console
// (multi-church hosting) — gated to the real Admin role rather than any
// separate credential, since there's no server-side multi-tenancy to back a
// real feature yet. See docs/FEATURE_BRIEF.md's non-goals.
function SuperAdminPreviewPage() {
  const navigate = useNavigate();
  const { session } = useSession();

  useEffect(() => {
    if (session && !canManageUsers(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canManageUsers(session.role)) return null;

  return (
    <div>
      <PageHeader
        title="SuperAdmin console (concept)"
        description="A clickable preview only — no real data, no multi-church backend yet."
      />
      <iframe
        src={`${import.meta.env.BASE_URL}superadmin-preview.html`}
        title="SuperAdmin console concept preview"
        className="h-[80vh] w-full rounded-md border"
      />
    </div>
  );
}
