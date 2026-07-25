import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Check, X, ClipboardList } from "lucide-react";
import { listRequisitionsFn, decideRequisitionFn } from "@/server/requisitions";
import { listDepartmentsFn } from "@/server/departments";
import { listOrgUsersFn } from "@/server/users";
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

type OrgRequisition = Awaited<ReturnType<typeof listRequisitionsFn>>[number];

const STATUS_STYLE: Record<OrgRequisition["status"], string> = {
  pending: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

function RequisitionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const requisitionsQuery = useQuery({
    queryKey: ["requisitions"],
    queryFn: () => listRequisitionsFn(),
  });
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartmentsFn(),
  });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const requisitions = requisitionsQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  const decideMutation = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected" }) =>
      decideRequisitionFn({ data: vars }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      toast.success(`Requisition ${vars.status}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update requisition"),
  });

  useEffect(() => {
    if (session && !canViewRequisitions(session.role, session.financeTier)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, navigate]);

  if (!session || !canViewRequisitions(session.role, session.financeTier)) return null;

  const canSubmit = canSubmitRequisitions(session.role);
  const canDecide = canDecideRequisitions(session.role);
  const filtered = requisitions.filter((r) =>
    matchesBranchFilter(effectiveBranch, r.branchId ?? undefined),
  );

  function departmentName(id: string): string {
    return departments.find((d) => d.id === id)?.name ?? "Unknown department";
  }
  function userName(id: string | null | undefined): string {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.fullName ?? "Unknown user";
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
                  <RequisitionDialog departments={departments} onClose={() => setOpen(false)} />
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
                            disabled={decideMutation.isPending}
                            onClick={() => decideMutation.mutate({ id: r.id, status: "approved" })}
                          >
                            <Check className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Reject requisition"
                            disabled={decideMutation.isPending}
                            onClick={() => decideMutation.mutate({ id: r.id, status: "rejected" })}
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
