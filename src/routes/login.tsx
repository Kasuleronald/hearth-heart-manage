import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Church, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { seedDefaultDepartments } from "@/lib/db";
import { createUser, getLoginLockoutMs, getSession, hasAnyUser, login } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { plural: cellTermPlural } = useCellTerm();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockoutMs, setLockoutMs] = useState(0);

  useEffect(() => {
    if (getSession()) {
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    hasAnyUser().then((exists) => setFirstRun(!exists));
  }, [navigate]);

  // Live-update the lockout countdown so the button re-enables on its own.
  useEffect(() => {
    if (lockoutMs <= 0) return;
    const t = window.setInterval(() => {
      const remaining = getLoginLockoutMs(username);
      setLockoutMs(remaining);
    }, 1000);
    return () => window.clearInterval(t);
  }, [lockoutMs, username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (firstRun) {
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (password !== confirmPassword) throw new Error("Passwords don't match");
        await createUser({ username, password, fullName, role: "admin" });
        await seedDefaultDepartments();
        await login(username, password);
        toast.success("Welcome to My Church");
      } else {
        await login(username, password);
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLockoutMs(getLoginLockoutMs(username));
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
            Members, households, {cellTermPlural.toLowerCase()}, events and attendance — all in one
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
                  minLength={firstRun ? MIN_PASSWORD_LENGTH : undefined}
                  required
                />
              </div>
              {firstRun && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                </div>
              )}
              {lockoutMs > 0 && (
                <p className="text-sm text-destructive">
                  Too many attempts. Try again in {Math.ceil(lockoutMs / 1000)}s.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy || lockoutMs > 0}>
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
