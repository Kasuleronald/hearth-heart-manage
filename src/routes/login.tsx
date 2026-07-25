import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getLoginLockoutMs, login, useSession } from "@/lib/auth";
import { requestPasswordResetFn } from "@/server/auth";
import { useCellTerm } from "@/lib/terminology";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, ready } = useSession();
  const { plural: cellTermPlural } = useCellTerm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockoutMs, setLockoutMs] = useState(0);

  useEffect(() => {
    if (ready && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [ready, session, navigate]);

  // Live-update the lockout countdown so the button re-enables on its own.
  useEffect(() => {
    if (lockoutMs <= 0) return;
    const t = window.setInterval(() => {
      const remaining = getLoginLockoutMs(email);
      setLockoutMs(remaining);
    }, 1000);
    return () => window.clearInterval(t);
  }, [lockoutMs, email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await login(email, password);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      if (s.needsEmailUpdate) {
        toast.warning("Your account has a placeholder email", {
          description:
            s.role === "admin"
              ? "Open Users and update it to your real email — you'll need it to sign in going forward."
              : "Ask an admin to update it to your real email in Users — you'll need it to sign in going forward.",
          duration: 10000,
        });
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLockoutMs(getLoginLockoutMs(email));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
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
          <AppLogo className="h-11 w-11 rounded-2xl object-contain shadow-lg" />
          <span className="font-display text-2xl font-semibold">My Church</span>
        </div>
        <div>
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Shepherd your flock with clarity.
          </h2>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            Members, households, {cellTermPlural.toLowerCase()}, events and attendance — all in one
            reverent workspace.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 shadow-xl">
          <CardContent className="p-8">
            <div className="mb-6 lg:hidden flex items-center gap-3">
              <AppLogo className="h-10 w-10 rounded-2xl object-contain" />
              <span className="font-display text-xl font-semibold">My Church</span>
            </div>
            <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to continue to your church workspace.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  placeholder="you@church.org"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              {lockoutMs > 0 && (
                <p className="text-sm text-destructive">
                  Too many attempts. Try again in {Math.ceil(lockoutMs / 1000)}s.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy || lockoutMs > 0}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <div className="text-center">
                <ForgotPasswordDialog />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await requestPasswordResetFn({ data: { email } });
      setSent(true);
    } catch {
      // requestPasswordResetFn never throws on a real error path that
      // should reach the user (see its comment) — this is just a network
      // hiccup. Show the same generic message either way.
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setEmail("");
    setSent(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground">
          Forgot password?
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Reset your password</DialogTitle>
        </DialogHeader>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            If an account exists for {email}, a password reset link has been sent — it expires in 1
            hour.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Enter your account email and we'll send you a link to set a new password.
            </p>
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@church.org"
              />
            </div>
          </>
        )}
        <DialogFooter>
          {sent ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
