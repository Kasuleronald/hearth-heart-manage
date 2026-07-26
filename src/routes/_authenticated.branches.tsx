import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Building, Search } from "lucide-react";
import { format } from "date-fns";
import { listBranchesFn, createBranchFn, updateBranchFn, deleteBranchFn } from "@/server/branches";
import { listOrgUsersFn } from "@/server/users";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { useSession, canManageBranches } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
});

type OrgBranch = Awaited<ReturnType<typeof listBranchesFn>>[number];

function BranchesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const canManage = session ? canManageBranches(session.role) : false;
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => listBranchesFn() });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const branches = branchesQuery.data ?? [];
  const users = (usersQuery.data ?? []).filter(
    (u) => u.role === "pastor" || u.role === "leader" || u.role === "admin",
  );
  const [editing, setEditing] = useState<OrgBranch | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBranchFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete branch"),
  });

  useEffect(() => {
    if (session && !canManageBranches(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canManage) return null;

  const filteredBranches = branches.filter((b) => {
    if (!q) return true;
    const leadPastor = users.find((u) => u.id === b.leadPastorId);
    const s = `${b.name} ${b.address ?? ""} ${leadPastor?.fullName ?? ""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Physical church locations. Users and records can be scoped to one, or left church-wide."
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
                <Plus className="mr-2 h-4 w-4" /> New branch
              </Button>
            </DialogTrigger>
            <BranchDialog
              key={editing?.id ?? "new"}
              branch={editing}
              users={users}
              onClose={() => setOpen(false)}
            />
          </Dialog>
        }
      />

      {branches.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search branches…"
            className="pl-9"
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredBranches.map((b) => {
          const leadPastor = users.find((u) => u.id === b.leadPastorId);
          return (
            <Card key={b.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{b.name}</h3>
                    {b.address && <p className="mt-1 text-xs text-muted-foreground">{b.address}</p>}
                    {leadPastor && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        In-charge: {leadPastor.fullName}
                      </p>
                    )}
                    {b.startDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Started {format(new Date(b.startDate), "PPP")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${b.name}`}
                      onClick={() => {
                        setEditing(b);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton
                      label={`Delete ${b.name}`}
                      title={`Delete "${b.name}"?`}
                      description="Records scoped to this branch aren't deleted — they become church-wide instead. This can't be undone."
                      onConfirm={async () => {
                        await deleteMutation.mutateAsync(b.id);
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {branches.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            <Building className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No branches yet — everything is church-wide by default.
          </div>
        )}
        {branches.length > 0 && filteredBranches.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No matches for "{q}".</p>
        )}
      </div>
    </div>
  );
}

function BranchDialog({
  branch,
  users,
  onClose,
}: {
  branch: OrgBranch | null;
  users: { id: string; fullName: string; role: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [leadPastorId, setLeadPastorId] = useState(branch?.leadPastorId ?? "");
  const [startDate, setStartDate] = useState(branch?.startDate ?? "");

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        address: address || undefined,
        leadPastorId: leadPastorId || undefined,
        startDate: startDate || undefined,
      };
      return branch
        ? updateBranchFn({ data: { id: branch.id, ...input } })
        : createBranchFn({ data: input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success(branch ? "Branch updated" : "Branch created");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save branch"),
  });

  function save() {
    if (!name.trim()) return toast.error("Name is required");
    saveMutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">{branch ? "Edit branch" : "New branch"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Downtown" />
        </div>
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>In-charge / Lead Pastor</Label>
          <Select
            value={leadPastorId || "none"}
            onValueChange={(v) => setLeadPastorId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Assign an in-charge" />
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
        </div>
        <div className="space-y-1.5">
          <Label>Date started</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{branch ? "Save changes" : "Create branch"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
