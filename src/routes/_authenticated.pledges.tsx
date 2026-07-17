import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Check, Ban, RotateCcw, HandCoins } from "lucide-react";
import { db, uid, type Pledge, type PledgeCause, type PledgeStatus, type Project } from "@/lib/db";
import { archiveOverduePledges } from "@/lib/pledges";
import { useBaseCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { CurrencyToggle } from "@/components/currency-toggle";
import { BranchField } from "@/components/branch-field";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
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
import {
  useSession,
  canViewAllPledges,
  canEditAnyPledge,
  canManagePledgeStatus,
  canRestorePledges,
  canToggleCurrency,
} from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/pledges")({
  component: PledgesPage,
});

const STATUS_STYLE: Record<PledgeStatus, string> = {
  active: "bg-secondary text-secondary-foreground",
  fulfilled: "bg-primary/15 text-primary",
  banned: "bg-destructive/15 text-destructive",
  archived: "bg-muted text-muted-foreground",
};

function PledgesPage() {
  const { session } = useSession();
  const allPledges = useLiveQuery(() => db.pledges.toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.orderBy("name").toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pledge | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  useEffect(() => {
    archiveOverduePledges();
  }, []);

  if (!session) return null;

  const canViewAll = canViewAllPledges(session.role, session.financeTier);
  const canEditAny = canEditAnyPledge(session.role, session.financeTier);
  const canManageStatus = canManagePledgeStatus(session.role, session.financeTier);
  const canRestore = canRestorePledges(session.role);

  const scoped = canViewAll ? allPledges : allPledges.filter((p) => p.bookedBy === session.userId);
  const filtered = scoped.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (!matchesBranchFilter(effectiveBranch, p.branchId)) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => (a.collectionDate < b.collectionDate ? 1 : -1));

  function projectName(p: Pledge): string {
    if (p.cause !== "project") return "";
    return projects.find((pr) => pr.id === p.projectId)?.name ?? "Unknown project";
  }

  async function decide(p: Pledge, status: "fulfilled" | "banned") {
    try {
      await db.pledges.update(p.id, { status });
      toast.success(status === "fulfilled" ? "Marked fulfilled" : "Pledge banned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update pledge");
    }
  }

  return (
    <div>
      <PageHeader
        title="Pledges"
        description={
          canViewAll ? "Commitments booked by anyone in the church." : "Commitments you've booked."
        }
        actions={
          <div className="flex items-center gap-2">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)}>
                  <Plus className="mr-2 h-4 w-4" /> Book a pledge
                </Button>
              </DialogTrigger>
              {open && (
                <PledgeDialog
                  key={editing?.id ?? "new"}
                  pledge={editing}
                  projects={projects}
                  currentUserId={session.userId}
                  onClose={() => setOpen(false)}
                />
              )}
            </Dialog>
          </div>
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Collection date</TableHead>
                <TableHead>Cause</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {canViewAll && <TableHead>Booked by</TableHead>}
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => {
                const bookedByMe = p.bookedBy === session.userId;
                const canEditThis = canEditAny || (bookedByMe && p.status === "active");
                const bookedByUser = users.find((u) => u.id === p.bookedBy);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{formatAmount(p.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(p.collectionDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.cause === "project" ? projectName(p) : "Seed"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {p.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-0 capitalize ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    {canViewAll && (
                      <TableCell className="text-muted-foreground">
                        {bookedByUser?.fullName ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEditThis && p.status !== "archived" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit pledge from ${p.name}`}
                            onClick={() => {
                              setEditing(p);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canManageStatus && p.status === "active" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Mark pledge from ${p.name} fulfilled`}
                              onClick={() => decide(p, "fulfilled")}
                            >
                              <Check className="h-4 w-4 text-primary" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Ban pledge from ${p.name}`}
                              onClick={() => decide(p, "banned")}
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {canRestore && p.status === "archived" && (
                          <RestorePledgeDialog pledge={p} />
                        )}
                        {canManageStatus && (
                          <DeleteButton
                            label={`Delete pledge from ${p.name}`}
                            title="Delete this pledge?"
                            description="This can't be undone."
                            onConfirm={async () => {
                              try {
                                await db.pledges.delete(p.id);
                                toast.success("Pledge deleted");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Failed to delete pledge",
                                );
                              }
                            }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canViewAll ? 8 : 7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <HandCoins className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    No pledges yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function PledgeDialog({
  pledge,
  projects,
  currentUserId,
  onClose,
}: {
  pledge: Pledge | null;
  projects: Project[];
  currentUserId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(pledge?.name ?? "");
  const [amount, setAmount] = useState(pledge ? String(pledge.amount) : "");
  const [collectionDate, setCollectionDate] = useState(pledge?.collectionDate ?? "");
  const [cause, setCause] = useState<PledgeCause>(pledge?.cause ?? "seed");
  const [projectId, setProjectId] = useState(pledge?.projectId ?? "");
  const [description, setDescription] = useState(pledge?.description ?? "");
  const [branchId, setBranchId] = useState(pledge?.branchId ?? "");
  const baseCurrency = useBaseCurrency();

  async function save() {
    if (!name.trim()) return toast.error("Enter who is pledging");
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      return toast.error("Enter a valid amount");
    }
    if (!collectionDate) return toast.error("Enter a collection date");
    if (cause === "project" && !projectId) return toast.error("Select a project");
    try {
      await db.pledges.put({
        id: pledge?.id ?? uid(),
        name: name.trim(),
        amount: numericAmount,
        collectionDate,
        cause,
        projectId: cause === "project" ? projectId : undefined,
        description: description || undefined,
        bookedBy: pledge?.bookedBy ?? currentUserId,
        status: pledge?.status ?? "active",
        branchId: branchId || undefined,
        createdAt: pledge?.createdAt ?? Date.now(),
      });
      toast.success(pledge ? "Pledge updated" : "Pledge booked");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save pledge");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {pledge ? "Edit pledge" : "Book a pledge"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is pledging?"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Amount ({baseCurrency.code})</Label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Collection date</Label>
            <Input
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Cause</Label>
          <Select value={cause} onValueChange={(v) => setCause(v as PledgeCause)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seed">Seed</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {cause === "project" && (
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select
              value={projectId || "none"}
              onValueChange={(v) => setProjectId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a project…</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
        <Button onClick={save}>{pledge ? "Save changes" : "Book pledge"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RestorePledgeDialog({ pledge }: { pledge: Pledge }) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");

  async function restore() {
    const today = format(new Date(), "yyyy-MM-dd");
    if (!newDate || newDate <= today) {
      toast.error("Choose a future collection date");
      return;
    }
    try {
      await db.pledges.update(pledge.id, { status: "active", collectionDate: newDate });
      toast.success("Pledge restored");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restore pledge");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Restore pledge from ${pledge.name}`}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Restore pledge from {pledge.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>New collection date</Label>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">Must be a future date.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={restore}>Restore</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
