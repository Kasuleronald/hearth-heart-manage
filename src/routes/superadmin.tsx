import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pure layout — /superadmin/orgs is a nested child route (see routeTree.gen.ts)
// and only ever renders through this Outlet. The login page itself lives at
// the index child, superadmin.index.tsx (/superadmin exactly).
export const Route = createFileRoute("/superadmin")({
  component: () => <Outlet />,
});
