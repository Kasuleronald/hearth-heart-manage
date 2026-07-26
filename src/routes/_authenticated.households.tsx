import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import {
  listHouseholdsFn,
  createHouseholdFn,
  updateHouseholdFn,
  deleteHouseholdFn,
  setHouseholdHeadFn,
} from "@/server/households";
import { listMembersFn } from "@/server/members";
import { listOrgUsersFn } from "@/server/users";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/delete-button";
import { BranchField } from "@/components/branch-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/households")({
  component: HouseholdsPage,
});

type OrgHousehold = Awaited<ReturnType<typeof listHouseholdsFn>>[number];

function HouseholdsPage() {
  const queryClient = useQueryClient();
  const householdsQuery = useQuery({
    queryKey: ["households"],
    queryFn: () => listHouseholdsFn(),
  });
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const households = householdsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const [editing, setEditing] = useState<OrgHousehold | null>(null);
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHouseholdFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Household deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete household"),
  });

  const toggleHeadMutation = useMutation({
    mutationFn: (vars: { householdId: string; memberId: string | null }) =>
      setHouseholdHeadFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  });

  return (
    <div>
      <PageHeader
        title="Households"
        description="Group members into families and households."
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
                <Plus className="mr-2 h-4 w-4" /> New household
              </Button>
            </DialogTrigger>
            <HouseholdDialog
              key={editing?.id ?? "new"}
              hh={editing}
              onClose={() => setOpen(false)}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {households.map((h) => {
          const hhMembers = members.filter((m) => m.householdId === h.id);
          const head = hhMembers.find((m) => m.isHeadOfHousehold);
          const addedBy = users.find((u) => u.id === h.createdBy);
          return (
            <Card key={h.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{h.name}</h3>
                    {h.address && <p className="mt-1 text-xs text-muted-foreground">{h.address}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${h.name}`}
                      onClick={() => {
                        setEditing(h);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton
                      label={`Delete ${h.name}`}
                      title={`Delete household "${h.name}"?`}
                      description="Members keep their records but are unlinked from this household. This can't be undone."
                      onConfirm={async () => {
                        await deleteMutation.mutateAsync(h.id);
                      }}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Members ({hhMembers.length})
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {hhMembers.map((m) => (
                      <li key={m.id} className="flex items-center justify-between">
                        <span>
                          {m.firstName} {m.lastName}
                        </span>
                        <button
                          className="text-xs text-muted-foreground hover:text-primary"
                          onClick={() =>
                            toggleHeadMutation.mutate({
                              householdId: h.id,
                              memberId: m.isHeadOfHousehold ? null : m.id,
                            })
                          }
                        >
                          {m.isHeadOfHousehold ? "★ Head" : "Set as head"}
                        </button>
                      </li>
                    ))}
                    {hhMembers.length === 0 && (
                      <li className="text-xs text-muted-foreground">
                        No members assigned. Set the household on a member's profile.
                      </li>
                    )}
                  </ul>
                  {head && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Head of household:{" "}
                      <span className="text-foreground">
                        {head.firstName} {head.lastName}
                      </span>
                    </p>
                  )}
                  {addedBy && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added by: <span className="text-foreground">{addedBy.fullName}</span>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {households.length === 0 && (
          <p className="text-sm text-muted-foreground">No households yet.</p>
        )}
      </div>
    </div>
  );
}

function HouseholdDialog({ hh, onClose }: { hh: OrgHousehold | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(hh?.name ?? "");
  const [address, setAddress] = useState(hh?.address ?? "");
  const [branchId, setBranchId] = useState(hh?.branchId ?? "");

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        address: address || undefined,
        branchId: branchId || undefined,
      };
      return hh
        ? updateHouseholdFn({ data: { id: hh.id, ...input } })
        : createHouseholdFn({ data: input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["households"] });
      toast.success(hh ? "Household updated" : "Household added");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save household"),
  });

  function save() {
    if (!name.trim()) return toast.error("Name is required");
    saveMutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {hh ? "Edit household" : "New household"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Smith Family"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{hh ? "Save changes" : "Create"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
