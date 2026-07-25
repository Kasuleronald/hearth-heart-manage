import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { consumePasswordResetToken, getLoginLockoutMs, getSession, login } from "@/lib/auth";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockoutMs, setLockoutMs] = useState(0);

  useEffect(() => {
    if (getSession()) {
      navigate({ to: "/dashboard", replace: true });
    }
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
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLockoutMs(getLoginLockoutMs(email));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 gradient-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <AppLogo className="h-11 w-11 rounded-xl object-contain shadow-lg" />
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
              <AppLogo className="h-10 w-10 rounded-lg object-contain" />
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
