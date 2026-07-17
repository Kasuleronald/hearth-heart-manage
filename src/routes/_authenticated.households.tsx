import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { db, uid, type Household } from "@/lib/db";
import { useSession } from "@/lib/auth";
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

function HouseholdsPage() {
  const { session } = useSession();
  const households = useLiveQuery(() => db.households.orderBy("name").toArray(), []) ?? [];
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [editing, setEditing] = useState<Household | null>(null);
  const [open, setOpen] = useState(false);

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
              hh={editing}
              currentUserId={session?.userId}
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
                        try {
                          await db.households.delete(h.id);
                          await Promise.all(
                            hhMembers.map((m) =>
                              db.members.update(m.id, {
                                householdId: undefined,
                                isHeadOfHousehold: false,
                              }),
                            ),
                          );
                          toast.success("Household deleted");
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Failed to delete household",
                          );
                        }
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
                          onClick={async () => {
                            // toggle head — only one head at a time
                            await Promise.all(
                              hhMembers.map((x) =>
                                db.members.update(x.id, {
                                  isHeadOfHousehold: x.id === m.id ? !m.isHeadOfHousehold : false,
                                }),
                              ),
                            );
                          }}
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

function HouseholdDialog({
  hh,
  currentUserId,
  onClose,
}: {
  hh: Household | null;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const [name, setName] = useState(hh?.name ?? "");
  const [address, setAddress] = useState(hh?.address ?? "");
  const [branchId, setBranchId] = useState(hh?.branchId ?? "");

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await db.households.put({
        id: hh?.id ?? uid(),
        name: name.trim(),
        address: address || undefined,
        branchId: branchId || undefined,
        createdBy: hh?.createdBy ?? currentUserId,
        createdAt: hh?.createdAt ?? Date.now(),
      });
      toast.success(hh ? "Household updated" : "Household added");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save household");
    }
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
