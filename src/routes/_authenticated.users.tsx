import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, KeyRound, Copy } from "lucide-react";
import {
  db,
  deleteUserCascade,
  unassignDepartmentLeader,
  uid,
  type Department,
  type Member,
  type Role,
  type User,
} from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DeleteButton } from "@/components/delete-button";
import { MemberCombobox } from "@/components/member-combobox";
import { BranchField } from "@/components/branch-field";
import { DuplicateEmailAlert } from "@/components/duplicate-email-alert";
import { findEmailMatches, type DuplicateEmailMatch } from "@/lib/duplicate-contact";
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
import {
  createUser,
  resetPassword,
  createPasswordResetToken,
  isValidEmail,
  useSession,
  canManageUsers,
} from "@/lib/auth";
import { useCellTerm, useTreasurerTerm } from "@/lib/terminology";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

function getRoles(leaderLabel: string, treasurerLabel: string): { value: Role; label: string }[] {
  return [
    { value: "admin", label: "Admin" },
    { value: "pastor", label: "Pastor" },
    { value: "cell_leader", label: leaderLabel },
    { value: "leader", label: "Department Leader" },
    { value: "treasurer", label: treasurerLabel },
  ];
}

// Assigns (or clears) this user's department leadership based on their role and
// the picked department. "Other" creates a brand-new department on the fly.
async function resolveDepartmentAssignment(
  userId: string,
  role: Role,
  departmentChoice: string, // department id, "other", or "none"
  otherDeptName: string,
) {
  await unassignDepartmentLeader(userId);
  if (role !== "leader" || departmentChoice === "none") return;
  if (departmentChoice === "other") {
    const name = otherDeptName.trim();
    if (!name) throw new Error("Enter a department name");
    await db.departments.add({ id: uid(), name, leaderId: userId, createdAt: Date.now() });
    return;
  }
  await db.departments.update(departmentChoice, { leaderId: userId });
}

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const { leaderLabel } = useCellTerm();
  const { singular: treasurerLabel } = useTreasurerTerm();
  const roles = getRoles(leaderLabel, treasurerLabel);
  const roleLabel = Object.fromEntries(roles.map((r) => [r.value, r.label])) as Record<
    Role,
    string
  >;
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const departments = useLiveQuery(() => db.departments.orderBy("name").toArray(), []) ?? [];
  const members = useLiveQuery(() => db.members.orderBy("lastName").toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

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
                    <ResetCodeButton user={u} />
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
                            await deleteUserCascade(u.id);
                            toast.success("User deleted");
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

function ResetCodeButton({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");

  async function generate() {
    try {
      const { token } = await createPasswordResetToken(user.email);
      setToken(token);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate reset code");
    }
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Generate password reset code for ${user.fullName}`}
        title="Generate password reset code"
        onClick={generate}
      >
        <KeyRound className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Reset code for {user.fullName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Share this code with {user.fullName} directly (in person, chat, etc.) — it isn't
            emailed. It expires in 1 hour and can only be used once, on the login screen's "Forgot
            password?" link.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={token} className="font-mono" />
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Copy reset code"
              onClick={() => {
                navigator.clipboard.writeText(token);
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
  departments: Department[];
  choice: string;
  onChoiceChange: (v: string) => void;
  otherName: string;
  onOtherNameChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Department</Label>
      <Select value={choice} onValueChange={onChoiceChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a department" />
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
          placeholder="Department name"
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
  members: Member[];
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
  departments: Department[];
  roles: { value: Role; label: string }[];
  members: Member[];
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("cell_leader");
  const [departmentChoice, setDepartmentChoice] = useState("none");
  const [otherDeptName, setOtherDeptName] = useState("");
  const [isMember, setIsMember] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [financeTierA, setFinanceTierA] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateEmailMatch[]>([]);

  async function doCreate() {
    try {
      const user = await createUser({
        fullName,
        email,
        password,
        role,
        memberId: isMember ? memberId || undefined : undefined,
        branchId: branchId || undefined,
        financeTier:
          financeTierA && (role === "leader" || role === "cell_leader") ? "A" : undefined,
      });
      await resolveDepartmentAssignment(user.id, role, departmentChoice, otherDeptName);
      toast.success("User created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function save() {
    try {
      if (!isValidEmail(email)) throw new Error("Enter a valid email address");
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      if (password !== confirmPassword) throw new Error("Passwords don't match");
      const matches = await findEmailMatches(email);
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        return;
      }
      await doCreate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <DuplicateEmailAlert
        open={duplicateMatches.length > 0}
        onOpenChange={(o) => {
          if (!o) setDuplicateMatches([]);
        }}
        matches={duplicateMatches}
        allowContinue={!duplicateMatches.some((m) => m.kind === "user")}
        onContinue={() => {
          setDuplicateMatches([]);
          doCreate();
        }}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">New user</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Password</Label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm password</Label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Create user</Button>
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
  user: User;
  departments: Department[];
  roles: { value: Role; label: string }[];
  members: Member[];
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const currentDept = departments.find((d) => d.leaderId === user.id);
  const [departmentChoice, setDepartmentChoice] = useState(currentDept?.id ?? "none");
  const [otherDeptName, setOtherDeptName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isMember, setIsMember] = useState(!!user.memberId);
  const [memberId, setMemberId] = useState(user.memberId ?? "");
  const [branchId, setBranchId] = useState(user.branchId ?? "");
  const [financeTierA, setFinanceTierA] = useState(user.financeTier === "A");
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateEmailMatch[]>([]);

  async function doUpdate(trimmedEmail: string) {
    try {
      if (newPassword || confirmPassword) {
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (newPassword !== confirmPassword) throw new Error("Passwords don't match");
        await resetPassword(user.id, newPassword);
      }
      await db.users.update(user.id, {
        fullName: fullName.trim(),
        email: trimmedEmail,
        role,
        memberId: isMember ? memberId || undefined : undefined,
        branchId: branchId || undefined,
        // A real email was just set, so the §14 placeholder-email prompt is done.
        needsEmailUpdate: trimmedEmail !== user.email ? false : user.needsEmailUpdate,
        financeTier:
          financeTierA && (role === "leader" || role === "cell_leader") ? "A" : undefined,
      });
      await resolveDepartmentAssignment(user.id, role, departmentChoice, otherDeptName);
      toast.success("User updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  async function save() {
    try {
      if (!fullName.trim()) throw new Error("Full name is required");
      const trimmedEmail = email.trim().toLowerCase();
      if (!isValidEmail(trimmedEmail)) throw new Error("Enter a valid email address");
      if (trimmedEmail !== user.email) {
        const matches = await findEmailMatches(trimmedEmail, { userId: user.id });
        if (matches.length > 0) {
          setDuplicateMatches(matches);
          return;
        }
      }
      await doUpdate(trimmedEmail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  return (
    <>
      <DuplicateEmailAlert
        open={duplicateMatches.length > 0}
        onOpenChange={(o) => {
          if (!o) setDuplicateMatches([]);
        }}
        matches={duplicateMatches}
        allowContinue={!duplicateMatches.some((m) => m.kind === "user")}
        onContinue={() => {
          const trimmedEmail = email.trim().toLowerCase();
          setDuplicateMatches([]);
          doUpdate(trimmedEmail);
        }}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Edit {user.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                placeholder="Leave blank to keep current"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}
