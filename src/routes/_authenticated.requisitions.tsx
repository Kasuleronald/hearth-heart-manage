import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Check, X, ClipboardList } from "lucide-react";
import { db, type Requisition } from "@/lib/db";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { RequisitionDialog } from "@/components/requisition-dialog";
import { CurrencyToggle } from "@/components/currency-toggle";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  useSession,
  canSubmitRequisitions,
  canViewRequisitions,
  canDecideRequisitions,
  canToggleCurrency,
} from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/requisitions")({
  component: RequisitionsPage,
});

const STATUS_STYLE: Record<Requisition["status"], string> = {
  pending: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

function RequisitionsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const requisitions =
    useLiveQuery(
      () =>
        db.requisitions.toArray().then((rows) => rows.sort((a, b) => b.createdAt - a.createdAt)),
      [],
    ) ?? [];
  const departments = useLiveQuery(() => db.departments.orderBy("name").toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  useEffect(() => {
    if (session && !canViewRequisitions(session.role, session.financeTier)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, navigate]);

  if (!session || !canViewRequisitions(session.role, session.financeTier)) return null;

  const canSubmit = canSubmitRequisitions(session.role);
  const canDecide = canDecideRequisitions(session.role);
  const filtered = requisitions.filter((r) => matchesBranchFilter(effectiveBranch, r.branchId));

  function departmentName(id: string): string {
    return departments.find((d) => d.id === id)?.name ?? "Unknown department";
  }
  function userName(id: string | undefined): string {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.fullName ?? "Unknown user";
  }

  async function decide(r: Requisition, status: "approved" | "rejected") {
    if (!session) return;
    try {
      await db.requisitions.update(r.id, {
        status,
        decidedBy: session.userId,
        decidedAt: Date.now(),
      });
      toast.success(`Requisition ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update requisition");
    }
  }

  return (
    <div>
      <PageHeader
        title="Requisitions"
        description="Departmental funding requests, submitted for Admin, Treasurer, or Pastor approval."
        actions={
          <div className="flex items-center gap-2">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            {canSubmit && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Submit requisition
                  </Button>
                </DialogTrigger>
                {open && (
                  <RequisitionDialog
                    departments={departments}
                    currentUserId={session.userId}
                    onClose={() => setOpen(false)}
                  />
                )}
              </Dialog>
            )}
          </div>
        }
      />

      <Card className="p-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decided by</TableHead>
                {canDecide && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(r.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>{departmentName(r.departmentId)}</TableCell>
                  <TableCell className="font-medium">{formatAmount(r.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                  <TableCell className="text-muted-foreground">{userName(r.requestedBy)}</TableCell>
                  <TableCell>
                    <Badge className={`border-0 capitalize ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.decidedBy ? userName(r.decidedBy) : "—"}
                  </TableCell>
                  {canDecide && (
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Approve requisition"
                            onClick={() => decide(r, "approved")}
                          >
                            <Check className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Reject requisition"
                            onClick={() => decide(r, "rejected")}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canDecide ? 8 : 7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <ClipboardList className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    No requisitions yet.
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
