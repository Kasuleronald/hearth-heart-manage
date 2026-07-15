import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import {
  db,
  deleteUserCascade,
  unassignDepartmentLeader,
  uid,
  type Department,
  type Role,
  type User,
} from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
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
import { createUser, resetPassword, useSession, canManageUsers } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

function getRoles(leaderLabel: string): { value: Role; label: string }[] {
  return [
    { value: "admin", label: "Admin" },
    { value: "pastor", label: "Pastor" },
    { value: "cell_leader", label: leaderLabel },
    { value: "leader", label: "Department Leader" },
    { value: "treasurer", label: "Treasurer" },
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
  const roles = getRoles(leaderLabel);
  const roleLabel = Object.fromEntries(roles.map((r) => [r.value, r.label])) as Record<
    Role,
    string
  >;
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const departments = useLiveQuery(() => db.departments.orderBy("name").toArray(), []) ?? [];
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
        description={`Admins, pastors, ${leaderLabel.toLowerCase()}s, department leaders, and treasurers who can sign in.`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New user
              </Button>
            </DialogTrigger>
            <NewUserDialog departments={departments} roles={roles} onClose={() => setOpen(false)} />
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
                    <div className="text-xs text-muted-foreground">@{u.username}</div>
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
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
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

function NewUserDialog({
  departments,
  roles,
  onClose,
}: {
  departments: Department[];
  roles: { value: Role; label: string }[];
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("cell_leader");
  const [departmentChoice, setDepartmentChoice] = useState("none");
  const [otherDeptName, setOtherDeptName] = useState("");

  async function save() {
    try {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      if (password !== confirmPassword) throw new Error("Passwords don't match");
      const user = await createUser({ fullName, username, password, role });
      await resolveDepartmentAssignment(user.id, role, departmentChoice, otherDeptName);
      toast.success("User created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
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
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password</Label>
            <Input
              type="password"
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
  );
}

function EditUserDialog({
  user,
  departments,
  roles,
  onClose,
}: {
  user: User;
  departments: Department[];
  roles: { value: Role; label: string }[];
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<Role>(user.role);
  const currentDept = departments.find((d) => d.leaderId === user.id);
  const [departmentChoice, setDepartmentChoice] = useState(currentDept?.id ?? "none");
  const [otherDeptName, setOtherDeptName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function save() {
    try {
      if (!fullName.trim()) throw new Error("Full name is required");
      if (newPassword || confirmPassword) {
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        }
        if (newPassword !== confirmPassword) throw new Error("Passwords don't match");
        await resetPassword(user.id, newPassword);
      }
      await db.users.update(user.id, { fullName: fullName.trim(), role });
      await resolveDepartmentAssignment(user.id, role, departmentChoice, otherDeptName);
      toast.success("User updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user");
    }
  }

  return (
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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              placeholder="Leave blank to keep current"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <Input
              type="password"
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
  );
}
