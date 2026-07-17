import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { QuickSearch } from "@/components/quick-search";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (ready && !session) navigate({ to: "/login", replace: true });
  }, [ready, session, navigate]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!ready || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="ml-2 flex flex-1 items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="mr-2 h-4 w-4" /> Quick search
                <kbd className="ml-3 rounded border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
              </Button>
              <div className="flex items-center gap-3">
                <NotificationBell userId={session.userId} />
                <span className="text-sm text-muted-foreground">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">{session.fullName}</span>
                </span>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize text-secondary-foreground">
                  {session.role.replace("_", " ")}
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-6 lg:p-8">
            <Outlet />
          </main>
          <QuickSearch open={searchOpen} onOpenChange={setSearchOpen} />
        </div>
      </div>
    </SidebarProvider>
  );
}
