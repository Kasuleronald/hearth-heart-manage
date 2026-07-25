import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AppLogo } from "@/components/app-logo";
import { acceptInviteFn } from "@/server/auth";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Missing invite token");
      return acceptInviteFn({ data: { token, password } });
    },
    onSuccess: () => {
      toast.success("Password set — welcome!");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Something went wrong"),
  });

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="font-display text-lg font-semibold">Missing invite link</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This page needs the link exactly as it was sent to you, including the token.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-border/60 shadow-xl">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <AppLogo className="h-10 w-10 rounded-2xl object-contain" />
            <span className="font-display text-xl font-semibold">Set your password</span>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (password.length < MIN_PASSWORD_LENGTH) {
                toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
                return;
              }
              if (password !== confirmPassword) {
                toast.error("Passwords don't match");
                return;
              }
              mutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>
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
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set password & sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
