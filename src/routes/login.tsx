import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Church, Loader2 } from "lucide-react";
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
import { seedDefaultDepartments } from "@/lib/db";
import {
  createUser,
  consumePasswordResetToken,
  getLoginLockoutMs,
  getSession,
  hasAnyUser,
  login,
} from "@/lib/auth";
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
  const [bootError, setBootError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
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
    hasAnyUser()
      .then((exists) => setFirstRun(!exists))
      .catch((err) => {
        setBootError(err instanceof Error ? err.message : "Failed to open the local database");
      });
  }, [navigate]);

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
      if (firstRun) {
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (password !== confirmPassword) throw new Error("Passwords don't match");
        await createUser({ email, password, fullName, role: "admin" });
        await seedDefaultDepartments();
        await login(email, password);
        toast.success("Welcome to My Church");
      } else {
        const s = await login(email, password);
        if (s.needsEmailUpdate) {
          toast.warning("Your account has a placeholder email", {
            description:
              s.role === "admin"
                ? "Open Users and update it to your real email — you'll need it to sign in going forward."
                : "Ask an admin to update it to your real email in Users — you'll need it to sign in going forward.",
            duration: 10000,
          });
        }
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLockoutMs(getLoginLockoutMs(email));
    } finally {
      setBusy(false);
    }
  }

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md border-destructive/40">
          <CardContent className="p-8 text-center">
            <h1 className="font-display text-lg font-semibold text-destructive">
              Couldn't open the local database
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{bootError}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Try reloading the page. If this keeps happening, clearing this site's storage
              (Settings → Privacy → Site data) will fix it, but will erase locally stored data
              unless you have a backup.
            </p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
                  autoComplete={firstRun ? "new-password" : "off"}
                  minLength={firstRun ? MIN_PASSWORD_LENGTH : undefined}
                  required
                />
              </div>
              {firstRun && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <PasswordInput
                    id="confirmPassword"
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
              {!firstRun && (
                <div className="text-center">
                  <ForgotPasswordDialog />
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem() {
    setBusy(true);
    try {
      if (newPassword !== confirm) throw new Error("Passwords don't match");
      await consumePasswordResetToken(token, newPassword);
      toast.success("Password reset — you can sign in now");
      setOpen(false);
      setToken("");
      setNewPassword("");
      setConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground">
          Forgot password?
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Reset your password</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This app stores data only on this device, so password resets have to go through another
            admin — there's no email delivery to reset it yourself from scratch. Ask an admin to
            open <span className="font-medium text-foreground">Users</span> and generate a reset
            code for your account, then enter it below. If you're the only admin and can't sign in,
            there's no automated recovery — you'll need to restore from a backup or start a fresh
            account.
          </p>
          <div className="space-y-2">
            <Label htmlFor="resetToken">Reset code</Label>
            <Input id="resetToken" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resetNewPassword">New password</Label>
            <PasswordInput
              id="resetNewPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resetConfirm">Confirm new password</Label>
            <PasswordInput
              id="resetConfirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={redeem} disabled={busy || !token || !newPassword}>
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
