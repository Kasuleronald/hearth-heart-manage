import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, Plus, LogOut, Copy, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrentSessionFn, logoutFn } from "@/server/auth";
import { ChangePlatformPasswordDialog } from "@/components/change-platform-password-dialog";
import {
  listOrganizationsFn,
  createOrganizationFn,
  updateOrganizationFn,
  resetOrgAdminPasswordFn,
  suspendOrganizationFn,
  reactivateOrganizationFn,
  disableOrganizationFn,
} from "@/server/superadmin";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/orgs")({
  ssr: false,
  component: SuperAdminOrgsPage,
});

const STATUS_STYLE: Record<string, string> = {
  active: "bg-primary/15 text-primary",
  suspended: "bg-secondary text-secondary-foreground",
  disabled: "bg-destructive/15 text-destructive",
};

type OrgListItem = Awaited<ReturnType<typeof listOrganizationsFn>>[number];

function SuperAdminOrgsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgListItem | null>(null);
  const [resetResult, setResetResult] = useState<{
    link: string;
    emailSent: boolean;
    adminEmail: string;
  } | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["platform-session"],
    queryFn: () => getCurrentSessionFn(),
  });

  useEffect(() => {
    if (sessionQuery.isSuccess && sessionQuery.data?.kind !== "platform_admin") {
      navigate({ to: "/superadmin", replace: true });
    }
  }, [sessionQuery.isSuccess, sessionQuery.data, navigate]);

  const orgsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => listOrganizationsFn(),
    enabled: sessionQuery.data?.kind === "platform_admin",
  });

  const logoutMutation = useMutation({
    mutationFn: () => logoutFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-session"] });
      navigate({ to: "/superadmin", replace: true });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { organizationId: string; status: "active" | "suspended" | "disabled" }) => {
      if (vars.status === "active") return reactivateOrganizationFn({ data: vars });
      if (vars.status === "suspended") return suspendOrganizationFn({ data: vars });
      return disableOrganizationFn({ data: vars });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update status"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (vars: { adminUserId: string; adminEmail: string }) =>
      resetOrgAdminPasswordFn({ data: { adminUserId: vars.adminUserId } }),
    onSuccess: (result, vars) => {
      const link = `${window.location.origin}/accept-invite?token=${result.resetToken}`;
      setResetResult({ link, emailSent: result.emailSent, adminEmail: vars.adminEmail });
      toast.success(result.emailSent ? "Reset link emailed" : "Reset link generated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reset password"),
  });

  if (
    sessionQuery.isLoading ||
    (sessionQuery.data?.kind === "platform_admin" && orgsQuery.isLoading)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (sessionQuery.data?.kind !== "platform_admin") return null;

  const orgs = orgsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-muted/20 p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">Organizations</h1>
              <p className="text-xs text-muted-foreground">
                Signed in as {sessionQuery.data.fullName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New organization
                </Button>
              </DialogTrigger>
              <NewOrganizationDialog onClose={() => setOpen(false)} />
            </Dialog>
            <ChangePlatformPasswordDialog />
            <Button variant="ghost" size="icon" onClick={() => logoutMutation.mutate()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orgs.map((org) => (
            <Card key={org.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{org.name}</h3>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">{org.type}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className={`border-0 capitalize ${STATUS_STYLE[org.status] ?? ""}`}>
                      {org.status}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Edit organization"
                      aria-label="Edit organization"
                      onClick={() => setEditingOrg(org)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {org.admins.length === 0 ? (
                    "No admin yet"
                  ) : (
                    <ul className="space-y-1">
                      {org.admins.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">Admin: {a.fullName}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            title="Reset password"
                            aria-label={`Reset password for ${a.fullName}`}
                            disabled={resetPasswordMutation.isPending}
                            onClick={() =>
                              resetPasswordMutation.mutate({
                                adminUserId: a.id,
                                adminEmail: a.email,
                              })
                            }
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  {org.status !== "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({ organizationId: org.id, status: "active" })
                      }
                    >
                      Reactivate
                    </Button>
                  )}
                  {org.status !== "suspended" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({ organizationId: org.id, status: "suspended" })
                      }
                    >
                      Suspend
                    </Button>
                  )}
                  {org.status !== "disabled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({ organizationId: org.id, status: "disabled" })
                      }
                    >
                      Disable
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {orgs.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No organizations yet — create the first one above.
            </p>
          )}
        </div>
      </div>

      <Dialog open={!!editingOrg} onOpenChange={(o) => !o && setEditingOrg(null)}>
        {editingOrg && (
          <EditOrganizationDialog org={editingOrg} onClose={() => setEditingOrg(null)} />
        )}
      </Dialog>

      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        {resetResult && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Password reset</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {resetResult.emailSent ? (
                <>
                  An email was sent to {resetResult.adminEmail}. You can also share the link below.
                </>
              ) : (
                <>
                  Send this link to {resetResult.adminEmail} so they can set a new password. Email
                  delivery isn't configured — relay it however works.
                </>
              )}{" "}
              It expires in 1 hour.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={resetResult.link} />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(resetResult.link);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setResetResult(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function EditOrganizationDialog({ org, onClose }: { org: OrgListItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(org.name);
  const [type, setType] = useState<"church" | "ministry" | "organization">(
    org.type as "church" | "ministry" | "organization",
  );
  const [timezone, setTimezone] = useState(org.timezone ?? "");

  const updateMutation = useMutation({
    mutationFn: () =>
      updateOrganizationFn({
        data: { organizationId: org.id, name, type, timezone: timezone || undefined },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organization updated");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update"),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">Edit organization</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="church">Church</SelectItem>
              <SelectItem value="ministry">Ministry</SelectItem>
              <SelectItem value="organization">Organization</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Africa/Kampala"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewOrganizationDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"church" | "ministry" | "organization">("church");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => createOrganizationFn({ data: { name, type, adminFullName, adminEmail } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      const link = `${window.location.origin}/accept-invite?token=${result.inviteToken}`;
      setInviteLink(link);
      setEmailSent(result.emailSent);
      toast.success(
        result.emailSent ? "Organization created — invite emailed" : "Organization created",
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create"),
  });

  if (inviteLink) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Organization created</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {emailSent ? (
            <>An invite email was sent to {adminEmail}. You can also share the link below.</>
          ) : (
            <>
              Send this link to {adminFullName} so they can set their password and sign in. Email
              delivery isn't configured — relay it however works (message, email client, etc.).
            </>
          )}{" "}
          It expires in 1 hour.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={inviteLink} />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(inviteLink);
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">New organization</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grace Chapel"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="church">Church</SelectItem>
              <SelectItem value="ministry">Ministry</SelectItem>
              <SelectItem value="organization">Organization</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>First admin — full name</Label>
          <Input value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>First admin — email</Label>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@church.org"
          />
          <p className="text-xs text-muted-foreground">
            They'll set their own password via an invite link — not typed here.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={
            !name.trim() || !adminFullName.trim() || !adminEmail.trim() || createMutation.isPending
          }
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create organization
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
