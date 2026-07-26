import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Users2 } from "lucide-react";
import { listCellsFn, createCellFn, updateCellFn, deleteCellFn } from "@/server/cells";
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
import { ViewToggle, type CollectionView } from "@/components/view-toggle";
import { useSession, canManageUsers, isTierAFinanceLeader } from "@/lib/auth";
import { useIsHeadOfCellFellowships } from "@/lib/cell-fellowships";
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

export const Route = createFileRoute("/_authenticated/cells")({
  component: CellsPage,
});

type OrgCell = Awaited<ReturnType<typeof listCellsFn>>[number];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function CellsPage() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { singular, plural, leaderLabel } = useCellTerm();
  const cellsQuery = useQuery({ queryKey: ["cells"], queryFn: () => listCellsFn() });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const cells = cellsQuery.data ?? [];
  const users = (usersQuery.data ?? []).filter(
    (u) => u.role === "cell_leader" || u.role === "pastor" || u.role === "leader",
  );
  const members = membersQuery.data ?? [];
  const [editing, setEditing] = useState<OrgCell | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CollectionView>("tiles");
  const isHeadOfCellFellowships = useIsHeadOfCellFellowships(session?.userId);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCellFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cells"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success(`${singular} deleted`);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : `Failed to delete ${singular.toLowerCase()}`),
  });

  const canManage = session
    ? session.role === "admin" || session.role === "pastor" || isHeadOfCellFellowships
    : false;
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  // Admin/pastor/treasurer and tier-A finance leaders see every cell; anyone
  // else only sees cell(s) they're actually assigned to lead — via
  // leaderId, not their account's primary role, so a Department Leader the
  // Admin has assigned to a cell is scoped the same way a cell_leader is.
  const seesAllCells = session
    ? session.role === "admin" ||
      session.role === "pastor" ||
      session.role === "treasurer" ||
      isTierAFinanceLeader(session.role, session.financeTier)
    : false;
  const visibleCells = (
    seesAllCells ? cells : cells.filter((c) => c.leaderId === session?.userId)
  ).filter((c) => matchesBranchFilter(effectiveBranch, c.branchId ?? undefined));

  function renderCellBody(c: OrgCell) {
    const leader = users.find((u) => u.id === c.leaderId);
    const count = members.filter((m) => m.cellId === c.id).length;
    return (
      <>
        <div className="flex items-start justify-between">
          <Link to="/cells/$id" params={{ id: c.id }} className="min-w-0">
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
                  description="This also removes all of its meetings and attendance history. Members are unlinked, not deleted. This can't be undone."
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
            Leader: <span className="text-foreground">{leader?.fullName ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users2 className="h-4 w-4" /> {count}
          </div>
        </div>
        {c.description && (
          <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title={plural}
        description={`Small groups shepherded by their leaders.`}
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            {canManage && (
              <Dialog
                open={open}
                onOpenChange={(o) => {
                  setOpen(o);
                  if (!o) setEditing(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => setEditing(null)}>
                    <Plus className="mr-2 h-4 w-4" /> New {singular.toLowerCase()}
                  </Button>
                </DialogTrigger>
                <CellDialog
                  key={editing?.id ?? "new"}
                  cell={editing}
                  users={users}
                  singular={singular}
                  leaderLabel={leaderLabel}
                  onClose={() => setOpen(false)}
                />
              </Dialog>
            )}
          </div>
        }
      />
      {visibleCells.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {plural.toLowerCase()} yet.</p>
      ) : view === "tiles" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCells.map((c) => (
            <Card key={c.id} className="group overflow-hidden">
              <CardContent className="p-5">{renderCellBody(c)}</CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {visibleCells.map((c) => (
                <li key={c.id} className="group p-4">
                  {renderCellBody(c)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CellDialog({
  cell,
  users,
  singular,
  leaderLabel,
  onClose,
}: {
  cell: OrgCell | null;
  users: { id: string; fullName: string; role: string }[];
  singular: string;
  leaderLabel: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(cell?.name ?? "");
  const [meetingDay, setMeetingDay] = useState(cell?.meetingDay ?? "");
  const [meetingLocation, setMeetingLocation] = useState(cell?.meetingLocation ?? "");
  const [leaderId, setLeaderId] = useState(cell?.leaderId ?? "");
  const [description, setDescription] = useState(cell?.description ?? "");
  const [branchId, setBranchId] = useState(cell?.branchId ?? "");

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        meetingDay: meetingDay || undefined,
        meetingLocation: meetingLocation || undefined,
        leaderId: leaderId || undefined,
        description: description || undefined,
        branchId: branchId || undefined,
      };
      return cell
        ? updateCellFn({ data: { id: cell.id, ...input } })
        : createCellFn({ data: input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cells"] });
      toast.success(cell ? `${singular} updated` : `${singular} created`);
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : `Failed to save ${singular.toLowerCase()}`),
  });

  function save() {
    if (!name.trim()) return toast.error("Name is required");
    saveMutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {cell ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grace Cell — Zone A"
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
                  {u.fullName} ({u.role === "cell_leader" ? leaderLabel : u.role.replace("_", " ")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a user with role "{leaderLabel}" or "Pastor" in the Users page to assign as
              leader.
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
        <Button onClick={save}>{cell ? "Save changes" : `Create ${singular.toLowerCase()}`}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
