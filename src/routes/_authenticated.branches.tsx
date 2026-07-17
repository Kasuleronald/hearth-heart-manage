import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Building } from "lucide-react";
import { db, uid, deleteBranchCascade, type Branch } from "@/lib/db";
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
import { useSession, canManageBranches } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const canManage = session ? canManageBranches(session.role) : false;
  const branches = useLiveQuery(() => db.branches.orderBy("name").toArray(), []) ?? [];
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session && !canManageBranches(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canManage) return null;

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
              onClose={() => setOpen(false)}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold">{b.name}</h3>
                  {b.address && <p className="mt-1 text-xs text-muted-foreground">{b.address}</p>}
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
                      try {
                        await deleteBranchCascade(b.id);
                        toast.success("Branch deleted");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to delete branch");
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {branches.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            <Building className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No branches yet — everything is church-wide by default.
          </div>
        )}
      </div>
    </div>
  );
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await db.branches.put({
        id: branch?.id ?? uid(),
        name: name.trim(),
        address: address || undefined,
        createdAt: branch?.createdAt ?? Date.now(),
      });
      toast.success(branch ? "Branch updated" : "Branch created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save branch");
    }
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
