import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Pencil, Trash2, Users2 } from "lucide-react";
import { db, uid, type Cell } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useSession, canManageUsers } from "@/lib/auth";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cells")({
  component: CellsPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function CellsPage() {
  const { session } = useSession();
  const cells = useLiveQuery(() => db.cells.orderBy("name").toArray(), []) ?? [];
  const users = useLiveQuery(
    () => db.users.filter((u) => u.role === "cell_leader" || u.role === "pastor").toArray(),
    [],
  ) ?? [];
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const [editing, setEditing] = useState<Cell | null>(null);
  const [open, setOpen] = useState(false);

  const canManage = session ? session.role !== "cell_leader" : false;
  const visibleCells =
    session?.role === "cell_leader"
      ? cells.filter((c) => c.leaderId === session.userId)
      : cells;

  return (
    <div>
      <PageHeader
        title="Cell Fellowships"
        description="Small groups shepherded by cell leaders."
        actions={
          canManage && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)}>
                  <Plus className="mr-2 h-4 w-4" /> New cell
                </Button>
              </DialogTrigger>
              <CellDialog cell={editing} users={users} onClose={() => setOpen(false)} />
            </Dialog>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCells.map((c) => {
          const leader = users.find((u) => u.id === c.leaderId);
          const count = members.filter((m) => m.cellId === c.id).length;
          return (
            <Card key={c.id} className="group overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <Link to="/cells/$id" params={{ id: c.id }} className="min-w-0">
                    <h3 className="font-display text-lg font-semibold group-hover:text-primary">{c.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.meetingDay ?? "Any day"} • {c.meetingLocation ?? "—"}
                    </p>
                  </Link>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canManageUsers(session!.role) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm(`Delete cell "${c.name}"?`)) return;
                            await db.cells.delete(c.id);
                            await Promise.all(
                              members.filter((m) => m.cellId === c.id).map((m) => db.members.update(m.id, { cellId: undefined })),
                            );
                            toast.success("Cell deleted");
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    Leader: <span className="text-foreground">{leader?.fullName ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users2 className="h-4 w-4" /> {count}
                  </div>
                </div>
                {c.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {visibleCells.length === 0 && (
          <p className="text-sm text-muted-foreground">No cell fellowships yet.</p>
        )}
      </div>
    </div>
  );
}

function CellDialog({
  cell,
  users,
  onClose,
}: {
  cell: Cell | null;
  users: { id: string; fullName: string; role: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(cell?.name ?? "");
  const [meetingDay, setMeetingDay] = useState(cell?.meetingDay ?? "");
  const [meetingLocation, setMeetingLocation] = useState(cell?.meetingLocation ?? "");
  const [leaderId, setLeaderId] = useState(cell?.leaderId ?? "");
  const [description, setDescription] = useState(cell?.description ?? "");

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    await db.cells.put({
      id: cell?.id ?? uid(),
      name: name.trim(),
      meetingDay: meetingDay || undefined,
      meetingLocation: meetingLocation || undefined,
      leaderId: leaderId || undefined,
      description: description || undefined,
      createdAt: cell?.createdAt ?? Date.now(),
    });
    toast.success(cell ? "Cell updated" : "Cell created");
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">{cell ? "Edit cell" : "New cell fellowship"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grace Cell — Zone A" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Meeting day</Label>
            <Select value={meetingDay || "none"} onValueChange={(v) => setMeetingDay(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any</SelectItem>
                {DAYS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Location</Label><Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Leader</Label>
          <Select value={leaderId || "none"} onValueChange={(v) => setLeaderId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Assign a leader" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.role.replace("_", " ")})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a user with role "Cell Leader" or "Pastor" in the Users page to assign as leader.
            </p>
          )}
        </div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>{cell ? "Save changes" : "Create cell"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
