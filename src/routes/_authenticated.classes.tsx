import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, GraduationCap } from "lucide-react";
import { listClassesFn, createClassFn, updateClassFn, deleteClassFn } from "@/server/classes";
import { listMembersFn } from "@/server/members";
import { listOrgUsersFn } from "@/server/users";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/delete-button";
import { BranchField } from "@/components/branch-field";
import { useSession, canManageUsers } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
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

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

type OrgClass = Awaited<ReturnType<typeof listClassesFn>>[number];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ClassesPage() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { leaderLabel } = useCellTerm();
  const classesQuery = useQuery({ queryKey: ["classes"], queryFn: () => listClassesFn() });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const classes = classesQuery.data ?? [];
  const users = (usersQuery.data ?? []).filter(
    (u) => u.role === "cell_leader" || u.role === "pastor",
  );
  const members = membersQuery.data ?? [];
  const [editing, setEditing] = useState<OrgClass | null>(null);
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteClassFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Class deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete class"),
  });

  const canManage = session ? session.role === "admin" || session.role === "pastor" : false;
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const visibleClasses = (
    session?.role === "cell_leader"
      ? classes.filter((c) => c.facilitatorId === session.userId)
      : classes
  ).filter((c) => matchesBranchFilter(effectiveBranch, c.branchId ?? undefined));

  return (
    <div>
      <PageHeader
        title="Discipleship Classes"
        description="Courses that grow members in faith, with their own roster and sessions."
        actions={
          canManage && (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)}>
                  <Plus className="mr-2 h-4 w-4" /> New class
                </Button>
              </DialogTrigger>
              <ClassDialog
                key={editing?.id ?? "new"}
                cls={editing}
                users={users}
                leaderLabel={leaderLabel}
                onClose={() => setOpen(false)}
              />
            </Dialog>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleClasses.map((c) => {
          const facilitator = users.find((u) => u.id === c.facilitatorId);
          const count = members.filter((m) => m.classId === c.id).length;
          return (
            <Card key={c.id} className="group overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <Link to="/classes/$id" params={{ id: c.id }} className="min-w-0">
                    <h3 className="font-display text-lg font-semibold group-hover:text-primary">
                      {c.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.meetingDay ?? "Any day"} • {c.meetingLocation ?? "—"}
                    </p>
                  </Link>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canManageUsers(session!.role) && (
                        <DeleteButton
                          label={`Delete ${c.name}`}
                          title={`Delete "${c.name}"?`}
                          description="This also removes all of its sessions and attendance history. Members are unlinked, not deleted. This can't be undone."
                          onConfirm={async () => {
                            await deleteMutation.mutateAsync(c.id);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    Facilitator:{" "}
                    <span className="text-foreground">{facilitator?.fullName ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <GraduationCap className="h-4 w-4" /> {count}
                  </div>
                </div>
                {c.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {visibleClasses.length === 0 && (
          <p className="text-sm text-muted-foreground">No discipleship classes yet.</p>
        )}
      </div>
    </div>
  );
}

function ClassDialog({
  cls,
  users,
  leaderLabel,
  onClose,
}: {
  cls: OrgClass | null;
  users: { id: string; fullName: string; role: string }[];
  leaderLabel: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(cls?.name ?? "");
  const [meetingDay, setMeetingDay] = useState(cls?.meetingDay ?? "");
  const [meetingLocation, setMeetingLocation] = useState(cls?.meetingLocation ?? "");
  const [facilitatorId, setFacilitatorId] = useState(cls?.facilitatorId ?? "");
  const [description, setDescription] = useState(cls?.description ?? "");
  const [branchId, setBranchId] = useState(cls?.branchId ?? "");

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        meetingDay: meetingDay || undefined,
        meetingLocation: meetingLocation || undefined,
        facilitatorId: facilitatorId || undefined,
        description: description || undefined,
        branchId: branchId || undefined,
      };
      return cls
        ? updateClassFn({ data: { id: cls.id, ...input } })
        : createClassFn({ data: input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success(cls ? "Class updated" : "Class created");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save class"),
  });

  function save() {
    if (!name.trim()) return toast.error("Name is required");
    saveMutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {cls ? "Edit class" : "New discipleship class"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Believers Class"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Meeting day</Label>
            <Select
              value={meetingDay || "none"}
              onValueChange={(v) => setMeetingDay(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any</SelectItem>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Facilitator</Label>
          <Select
            value={facilitatorId || "none"}
            onValueChange={(v) => setFacilitatorId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Assign a facilitator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName} ({u.role === "cell_leader" ? leaderLabel : u.role.replace("_", " ")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a user with role "{leaderLabel}" or "Pastor" in the Users page to assign as
              facilitator.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{cls ? "Save changes" : "Create class"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
