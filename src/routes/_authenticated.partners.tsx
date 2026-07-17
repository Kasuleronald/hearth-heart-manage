import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Handshake } from "lucide-react";
import { db, deletePartnerCascade, uid, type Partner } from "@/lib/db";
import { formatUGX } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession, canAccessPartners } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/partners")({
  component: PartnersPage,
});

const TYPES: { value: NonNullable<Partner["type"]>; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "organization", label: "Organization" },
  { value: "church", label: "Church" },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

function PartnersPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const partners = useLiveQuery(() => db.partners.orderBy("name").toArray(), []) ?? [];
  const givings = useLiveQuery(() => db.givings.toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [editing, setEditing] = useState<Partner | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session && !canAccessPartners(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canAccessPartners(session.role)) return null;

  return (
    <div>
      <PageHeader
        title="Partners"
        description="External individuals, organizations and churches that partner with you financially."
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
                <Plus className="mr-2 h-4 w-4" /> New partner
              </Button>
            </DialogTrigger>
            <PartnerDialog
              partner={editing}
              currentUserId={session.userId}
              onClose={() => setOpen(false)}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {partners.map((p) => {
          const totalGiven = givings
            .filter((g) => g.partnerId === p.id)
            .reduce((sum, g) => sum + g.amount, 0);
          const addedBy = users.find((u) => u.id === p.createdBy);

          return (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                    {p.type && (
                      <Badge variant="secondary" className="mt-1">
                        {TYPE_LABEL[p.type]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton
                      label={`Delete ${p.name}`}
                      title={`Delete "${p.name}"?`}
                      description="Givings recorded against this partner are kept, just unlinked. This can't be undone."
                      onConfirm={async () => {
                        try {
                          await deletePartnerCascade(p.id);
                          toast.success("Partner deleted");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed to delete partner");
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {p.phone && <div>{p.phone}</div>}
                  {p.email && <div>{p.email}</div>}
                </div>

                <div className="mt-4 space-y-1 text-sm">
                  <div>
                    <span className="font-medium">{formatUGX(totalGiven)}</span>{" "}
                    <span className="text-xs text-muted-foreground">given to date</span>
                  </div>
                  {!!p.pledgeAmount && (
                    <div className="text-xs text-muted-foreground">
                      Pledged: {formatUGX(p.pledgeAmount)}
                    </div>
                  )}
                </div>

                {p.notes && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{p.notes}</p>
                )}
                {addedBy && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Added by <span className="text-foreground">{addedBy.fullName}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {partners.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            <Handshake className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No partners yet.
          </div>
        )}
      </div>
    </div>
  );
}

function PartnerDialog({
  partner,
  currentUserId,
  onClose,
}: {
  partner: Partner | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(partner?.name ?? "");
  const [type, setType] = useState<Partner["type"]>(partner?.type);
  const [phone, setPhone] = useState(partner?.phone ?? "");
  const [email, setEmail] = useState(partner?.email ?? "");
  const [pledgeAmount, setPledgeAmount] = useState(
    partner?.pledgeAmount != null ? String(partner.pledgeAmount) : "",
  );
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [branchId, setBranchId] = useState(partner?.branchId ?? "");

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    try {
      const pledge = pledgeAmount ? Number(pledgeAmount) : undefined;
      await db.partners.put({
        id: partner?.id ?? uid(),
        name: name.trim(),
        type,
        phone: phone || undefined,
        email: email || undefined,
        pledgeAmount: pledge != null && !Number.isNaN(pledge) ? pledge : undefined,
        notes: notes || undefined,
        branchId: branchId || undefined,
        createdBy: partner?.createdBy ?? currentUserId,
        createdAt: partner?.createdAt ?? Date.now(),
      });
      toast.success(partner ? "Partner updated" : "Partner added");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save partner");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {partner ? "Edit partner" : "New partner"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type ?? "none"}
              onValueChange={(v) => setType(v === "none" ? undefined : (v as Partner["type"]))}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unspecified</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Pledged amount (UGX)</Label>
          <Input
            type="number"
            min="0"
            value={pledgeAmount}
            onChange={(e) => setPledgeAmount(e.target.value)}
            placeholder="Optional recurring commitment"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{partner ? "Save changes" : "Create partner"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
