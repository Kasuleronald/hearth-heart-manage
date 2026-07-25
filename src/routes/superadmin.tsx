import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { platformLoginFn, getCurrentSessionFn } from "@/server/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin")({
  ssr: false,
  component: SuperAdminLoginPage,
});

function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const sessionQuery = useQuery({
    queryKey: ["platform-session"],
    queryFn: () => getCurrentSessionFn(),
  });

  useEffect(() => {
    if (sessionQuery.data?.kind === "platform_admin") {
      navigate({ to: "/superadmin/orgs", replace: true });
    }
  }, [sessionQuery.data, navigate]);

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) => platformLoginFn({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-session"] });
      navigate({ to: "/superadmin/orgs", replace: true });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    },
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm border-border/60 shadow-xl">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
              <Shield className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-semibold">SuperAdmin</span>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Platform-level access — onboard and manage every organization. This is separate from any
            church's own sign-in.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              loginMutation.mutate({ email, password });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
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
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
