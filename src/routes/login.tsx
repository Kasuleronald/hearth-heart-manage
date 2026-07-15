import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Church, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createUser, getSession, hasAnyUser, login } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getSession()) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    hasAnyUser().then((exists) => setFirstRun(!exists));
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (firstRun) {
        if (password.length < 6) throw new Error("Password must be at least 6 characters");
        await createUser({ username, password, fullName, role: "admin" });
        await login(username, password);
        toast.success("Welcome to My Church");
      } else {
        await login(username, password);
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (firstRun === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 gradient-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary shadow-lg">
            <Church className="h-6 w-6" />
          </div>
          <span className="font-display text-2xl font-semibold">My Church</span>
        </div>
        <div>
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Shepherd your flock with clarity.
          </h2>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            Members, households, cell fellowships, events and attendance — all in one
            reverent, local-first workspace.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          Data stays on this device. Cloud sync coming soon.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 shadow-xl">
          <CardContent className="p-8">
            <div className="mb-6 lg:hidden flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
                <Church className="h-5 w-5" />
              </div>
              <span className="font-display text-xl font-semibold">My Church</span>
            </div>
            <h1 className="font-display text-2xl font-semibold">
              {firstRun ? "Create the first admin" : "Welcome back"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {firstRun
                ? "Set up your administrator account to get started."
                : "Sign in to continue to your church workspace."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {firstRun && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Pastor Jane Doe"
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={firstRun ? "new-password" : "current-password"}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {firstRun ? "Create account & sign in" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
