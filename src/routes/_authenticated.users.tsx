import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { db, type Role, type User } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
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
import { createUser, useSession, canManageUsers } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session && !canManageUsers(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canManageUsers(session.role)) return null;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Admins, pastors, and cell leaders who can sign in."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New user</Button>
            </DialogTrigger>
            <NewUserDialog onClose={() => setOpen(false)} />
          </Dialog>
        }
      />
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="font-medium">{u.fullName}</div>
                  <div className="text-xs text-muted-foreground">@{u.username}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="capitalize">{u.role.replace("_", " ")}</Badge>
                  {u.id !== session.userId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(`Delete user ${u.fullName}?`)) return;
                        await db.users.delete(u.id);
                        toast.success("User deleted");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cell_leader");

  async function save() {
    try {
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      await createUser({ fullName, username, password, role });
      toast.success("User created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
    void ({} as User);
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display">New user</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Username</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="pastor">Pastor</SelectItem>
                <SelectItem value="cell_leader">Cell Leader</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Create user</Button>
      </DialogFooter>
    </DialogContent>
  );
}
