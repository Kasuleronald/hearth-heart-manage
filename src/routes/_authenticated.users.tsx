import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, KeyRound, Copy } from "lucide-react";
import type { Role } from "@/lib/db";
import {
  listOrgUsersFn,
  createOrgUserFn,
  updateOrgUserFn,
  deleteOrgUserFn,
  resetOrgUserPasswordFn,
} from "@/server/users";
import { listMembersFn } from "@/server/members";
import { listDepartmentsFn, createDepartmentFn, updateDepartmentFn } from "@/server/departments";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DeleteButton } from "@/components/delete-button";
import { MemberCombobox } from "@/components/member-combobox";
import { BranchField } from "@/components/branch-field";
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
import { isValidEmail, useSession, canManageUsers } from "@/lib/auth";
import { useCellTerm, useTreasurerTerm, useDepartmentTerm } from "@/lib/terminology";
import { toast } from "sonner";

type OrgUser = Awaited<ReturnType<typeof listOrgUsersFn>>[number];
type OrgMember = Awaited<ReturnType<typeof listMembersFn>>[number];
type OrgDepartment = Awaited<ReturnType<typeof listDepartmentsFn>>[number];

function getRoles(
  leaderLabel: string,
  treasurerLabel: string,
  departmentLeaderLabel: string,
): { value: Role; label: string }[] {
  return [
    { value: "admin", label: "Admin" },
    { value: "pastor", label: "Pastor" },
    { value: "cell_leader", label: leaderLabel },
    { value: "leader", label: departmentLeaderLabel },
    { value: "treasurer", label: treasurerLabel },
  ];
}

// Assigns (or clears) this user's department leadership based on their role
// and the picked department. "Other" creates a brand-new department on the
// fly. updateDepartmentFn/createDepartmentFn are full-replace, not partial
// patches, so preserve every other field from the already-fetched list —
// the server also auto-clears the new leaderId from any *other* department
// (1:1 enforcement), but that doesn't cover "unassign this user entirely",
// which is why the explicit clear-current-department step below still runs.
async function resolveDepartmentAssignment(
  userId: string,
  role: Role,
  departmentChoice: string, // department id, "other", or "none"
  otherDeptName: string,
  departments: OrgDepartment[],
) {
  const currentlyLeading = departments.find((d) => d.leaderId === userId);
  if (currentlyLeading && currentlyLeading.id !== departmentChoice) {
    await updateDepartmentFn({
      data: {
        id: currentlyLeading.id,
        name: currentlyLeading.name,
        description: currentlyLeading.description ?? undefined,
        leaderId: undefined,
        allowedModules: currentlyLeading.allowedModules,
        branchId: currentlyLeading.branchId ?? undefined,
      },
    });
  }
  if (role !== "leader" || departmentChoice === "none") return;
  if (departmentChoice === "other") {
    const name = otherDeptName.trim();
    if (!name) throw new Error("Enter a department name");
    await createDepartmentFn({ data: { name, leaderId: userId, allowedModules: [] } });
    return;
  }
  const dept = departments.find((d) => d.id === departmentChoice);
  if (!dept) return;
  await updateDepartmentFn({
    data: {
      id: dept.id,
      name: dept.name,
      description: dept.description ?? undefined,
      leaderId: userId,
      allowedModules: dept.allowedModules,
      branchId: dept.branchId ?? undefined,
    },
  });
}

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { leaderLabel } = useCellTerm();
  const { singular: treasurerLabel } = useTreasurerTerm();
  const { leaderLabel: departmentLeaderLabel } = useDepartmentTerm();
  const roles = getRoles(leaderLabel, treasurerLabel, departmentLeaderLabel);
  const roleLabel = Object.fromEntries(roles.map((r) => [r.value, r.label])) as Record<
    Role,
    string
  >;
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartmentsFn(),
  });
  const users = usersQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrgUser | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOrgUserFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      toast.success("User deleted");
    },
  });

  useEffect(() => {
    if (session && !canManageUsers(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canManageUsers(session.role)) return null;

  return (
    <div>
      <PageHeader
        title="Users"
        description={`Admins, pastors, ${leaderLabel.toLowerCase()}s, department leaders, and ${treasurerLabel.toLowerCase()}s who can sign in.`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New user
              </Button>
            </DialogTrigger>
            <NewUserDialog
              departments={departments}
              roles={roles}
              members={members}
              onClose={() => setOpen(false)}
            />
          </Dialog>
        }
      />
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {users.map((u) => {
              const led = departments.find((d) => d.leaderId === u.id);
              return (
                <li key={u.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {led && (
                      <Badge variant="outline" className="text-xs">
                        {led.name}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="capitalize">
                      {roleLabel[u.role] ?? u.role.replace("_", " ")}
                    </Badge>
                    <ResetPasswordButton user={u} />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${u.fullName}`}
                      onClick={() => setEditing(u)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {u.id !== session.userId && (
                      <DeleteButton
                        label={`Delete ${u.fullName}`}
                        title={`Delete user ${u.fullName}?`}
                        description="They will no longer be able to sign in, and any department they lead will show as unassigned. This can't be undone."
                        onConfirm={async () => {
                          try {
                            await deleteMutation.mutateAsync(u.id);
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to delete user");
                          }
                        }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditUserDialog
            user={editing}
            departments={departments}
            roles={roles}
            members={members}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function ResetPasswordButton({ user }: { user: OrgUser }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ link: string; emailSent: boolean } | null>(null);

  const resetMutation = useMutation({
    mutationFn: () => resetOrgUserPasswordFn({ data: { id: user.id } }),
    onSuccess: (res) => {
      const link = `${window.location.origin}/accept-invite?token=${res.resetToken}`;
      setResult({ link, emailSent: res.emailSent });
      setOpen(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reset password"),
  });

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Reset password for ${user.fullName}`}
        title="Reset password"
        disabled={resetMutation.isPending}
        onClick={() => resetMutation.mutate()}
      >
        <KeyRound className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {result && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Password reset for {user.fullName}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {result.emailSent ? (
                <>An email was sent to {user.email}. You can also share the link below.</>
              ) : (
                <>Send this link to {user.fullName} so they can set a new password.</>
              )}{" "}
              It expires in 1 hour.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.link} />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(result.link);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function DepartmentField({
  departments,
  choice,
  onChoiceChange,
  otherName,
  onOtherNameChange,
}: {
  departments: OrgDepartment[];
  choice: string;
  onChoiceChange: (v: string) => void;
  otherName: string;
  onOtherNameChange: (v: string) => void;
}) {
  const { singular } = useDepartmentTerm();
  return (
    <div className="space-y-1.5">
      <Label>{singular}</Label>
      <Select value={choice} onValueChange={onChoiceChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select a ${singular.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
              {d.leaderId ? " (has a leader)" : ""}
            </SelectItem>
          ))}
          <SelectItem value="other">Other…</SelectItem>
        </SelectContent>
      </Select>
      {choice === "other" && (
        <Input
          className="mt-1.5"
          value={otherName}
          onChange={(e) => onOtherNameChange(e.target.value)}
          placeholder={`${singular} name`}
        />
      )}
    </div>
  );
}

// Only meaningful for leader/cell_leader roles — grants elevated finance
// powers (viewing requisitions, managing Partners) without a new Role value.
function FinanceTierField({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <Label>Tier-A finance leader</Label>
        <p className="text-xs text-muted-foreground">
          Grants access to requisitions and Partners, alongside their normal role.
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function MemberLinkField({
  members,
  isMember,
  onIsMemberChange,
  memberId,
  onMemberIdChange,
}: {
  members: OrgMember[];
  isMember: boolean;
  onIsMemberChange: (v: boolean) => void;
  memberId: string;
  onMemberIdChange: (id: string) => void;
}) {
  const linked = members.find((m) => m.id === memberId);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Is this user also a church member?</Label>
        <Switch
          checked={isMember}
          onCheckedChange={(v) => {
            onIsMemberChange(v);
            if (!v) onMemberIdChange("");
          }}
        />
      </div>
      {isMember &&
        (linked ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>
              {linked.firstName} {linked.lastName}
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onMemberIdChange("")}
            >
              Remove
            </button>
          </div>
        ) : (
          <MemberCombobox
            members={members}
            excludeIds={new Set()}
            label="Link to a member"
            onSelect={(m) => onMemberIdChange(m.id)}
          />
        ))}
    </div>
  );
}

function NewUserDialog({
  departments,
  roles,
  members,
  onClose,
}: {
  departments: OrgDepartment[];
  roles: { value: Role; label: string }[];
  members: OrgMember[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("cell_leader");
  const [departmentChoice, setDepartmentChoice] = useState("none");
  const [otherDeptName, setOtherDeptName] = useState("");
  const [isMember, setIsMember] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [financeTierA, setFinanceTierA] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string; emailSent: boolean } | null>(
    null,
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createOrgUserFn({
        data: {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
          memberId: isMember ? memberId || undefined : undefined,
          branchId: branchId || undefined,
          financeTier:
            financeTierA && (role === "leader" || role === "cell_leader") ? "A" : undefined,
        },
      }),
    onSuccess: async (result) => {
      await resolveDepartmentAssignment(
        result.user.id,
        role,
        departmentChoice,
        otherDeptName,
        departments,
      );
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      const link = `${window.location.origin}/accept-invite?token=${result.inviteToken}`;
      setInviteResult({ link, emailSent: result.emailSent });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create user"),
  });

  function save() {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (!isValidEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    createMutation.mutate();
  }

  if (inviteResult) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">User created</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {inviteResult.emailSent ? (
            <>An invite email was sent to {email}. You can also share the link below.</>
          ) : (
            <>Send this link to {fullName} so they can set their password and sign in.</>
          )}{" "}
          It expires in 1 hour.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={inviteResult.link} />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(inviteResult.link);
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
    <>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">New user</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Full name<span className="text-destructive"> *</span>
            </Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@church.org"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {role === "leader" && (
            <DepartmentField
              departments={departments}
              choice={departmentChoice}
              onChoiceChange={setDepartmentChoice}
              otherName={otherDeptName}
              onOtherNameChange={setOtherDeptName}
            />
          )}
          {(role === "leader" || role === "cell_leader") && (
            <FinanceTierField checked={financeTierA} onCheckedChange={setFinanceTierA} />
          )}
          <MemberLinkField
            members={members}
            isMember={isMember}
            onIsMemberChange={setIsMember}
            memberId={memberId}
            onMemberIdChange={setMemberId}
          />
          <BranchField value={branchId} onChange={setBranchId} />
          <p className="text-xs text-muted-foreground">
            They'll set their own password via an emailed invite link — not typed here.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={createMutation.isPending}>
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}

function EditUserDialog({
  user,
  departments,
  roles,
  members,
  onClose,
}: {
  user: OrgUser;
  departments: OrgDepartment[];
  roles: { value: Role; label: string }[];
  members: OrgMember[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const currentDept = departments.find((d) => d.leaderId === user.id);
  const [departmentChoice, setDepartmentChoice] = useState(currentDept?.id ?? "none");
  const [otherDeptName, setOtherDeptName] = useState("");
  const [isMember, setIsMember] = useState(!!user.memberId);
  const [memberId, setMemberId] = useState(user.memberId ?? "");
  const [branchId, setBranchId] = useState(user.branchId ?? "");
  const [financeTierA, setFinanceTierA] = useState(user.financeTier === "A");

  const updateMutation = useMutation({
    mutationFn: (trimmedEmail: string) =>
      updateOrgUserFn({
        data: {
          id: user.id,
          fullName: fullName.trim(),
          email: trimmedEmail,
          role,
          memberId: isMember ? memberId || undefined : undefined,
          branchId: branchId || undefined,
          financeTier:
            financeTierA && (role === "leader" || role === "cell_leader") ? "A" : undefined,
        },
      }),
    onSuccess: async () => {
      await resolveDepartmentAssignment(
        user.id,
        role,
        departmentChoice,
        otherDeptName,
        departments,
      );
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("User updated");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update user"),
  });

  function save() {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      toast.error("Enter a valid email address");
      return;
    }
    updateMutation.mutate(trimmedEmail);
  }

  return (
    <>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Edit {user.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Full name<span className="text-destructive"> *</span>
            </Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === "leader" && (
            <DepartmentField
              departments={departments}
              choice={departmentChoice}
              onChoiceChange={setDepartmentChoice}
              otherName={otherDeptName}
              onOtherNameChange={setOtherDeptName}
            />
          )}
          {(role === "leader" || role === "cell_leader") && (
            <FinanceTierField checked={financeTierA} onCheckedChange={setFinanceTierA} />
          )}
          <MemberLinkField
            members={members}
            isMember={isMember}
            onIsMemberChange={setIsMember}
            memberId={memberId}
            onMemberIdChange={setMemberId}
          />
          <BranchField value={branchId} onChange={setBranchId} />
          <p className="text-xs text-muted-foreground">
            Use the key icon on the Users list to send a password reset link — there's no direct
            password field here.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateMutation.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
