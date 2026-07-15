import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Building2 } from "lucide-react";
import { db, uid, unassignDepartmentLeader, type Department } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useSession, canAccessDepartments } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const departments = useLiveQuery(() => db.departments.orderBy("name").toArray(), []) ?? [];
  const users =
    useLiveQuery(
      () =>
        db.users
          .filter((u) => u.role === "leader" || u.role === "pastor" || u.role === "admin")
          .toArray(),
      [],
    ) ?? [];
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session && !canAccessDepartments(session.role)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, navigate]);

  if (!session || !canAccessDepartments(session.role)) return null;

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Ministries and teams — Ushering, Sound, Worship, Youth, and the leader assigned to each."
        actions={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="mr-2 h-4 w-4" /> New department
              </Button>
            </DialogTrigger>
            <DepartmentDialog dept={editing} users={users} onClose={() => setOpen(false)} />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((d) => {
          const leader = users.find((u) => u.id === d.leaderId);
          return (
            <Card key={d.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{d.name}</h3>
                    {d.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {d.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${d.name}`}
                      onClick={() => {
                        setEditing(d);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton
                      label={`Delete ${d.name}`}
                      title={`Delete department "${d.name}"?`}
                      description="This can't be undone."
                      onConfirm={async () => {
                        try {
                          await db.departments.delete(d.id);
                          toast.success("Department deleted");
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Failed to delete department",
                          );
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="mt-4 text-sm">
                  {leader ? (
                    <Badge variant="secondary">{leader.fullName}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {departments.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            <Building2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No departments yet.
          </div>
        )}
      </div>
    </div>
  );
}

function DepartmentDialog({
  dept,
  users,
  onClose,
}: {
  dept: Department | null;
  users: { id: string; fullName: string; role: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(dept?.name ?? "");
  const [description, setDescription] = useState(dept?.description ?? "");
  const [leaderId, setLeaderId] = useState(dept?.leaderId ?? "");

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    try {
      const id = dept?.id ?? uid();
      // Keep leadership 1:1 — clear this leader from any other department first.
      if (leaderId) await unassignDepartmentLeader(leaderId);
      await db.departments.put({
        id,
        name: name.trim(),
        description: description || undefined,
        leaderId: leaderId || undefined,
        createdAt: dept?.createdAt ?? Date.now(),
      });
      toast.success(dept ? "Department updated" : "Department created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save department");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {dept ? "Edit department" : "New department"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ushering" />
        </div>
        <div className="space-y-1.5">
          <Label>Leader</Label>
          <Select
            value={leaderId || "none"}
            onValueChange={(v) => setLeaderId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Assign a leader" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName} ({u.role.replace("_", " ")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a user with role "Department Leader" in the Users page to assign here.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{dept ? "Save changes" : "Create department"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
