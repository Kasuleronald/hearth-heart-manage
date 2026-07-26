import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Receipt, Check, X, HandCoins, Search } from "lucide-react";
import {
  listExpensesFn,
  createExpenseFn,
  updateExpenseFn,
  deleteExpenseFn,
  listMyAccountableRequisitionsFn,
  submitAccountabilityExpenseFn,
  decideExpenseFn,
} from "@/server/expenses";
import { listDepartmentsFn } from "@/server/departments";
import { listOrgUsersFn } from "@/server/users";
import { useBaseCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { ExportMenu } from "@/components/export-menu";
import { BranchField } from "@/components/branch-field";
import { CurrencyToggle } from "@/components/currency-toggle";
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
import { Card, CardContent } from "@/components/ui/card";
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
import { useSession, canEnterExpenses, canDecideRequisitions, canToggleCurrency } from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { useDepartmentTerm } from "@/lib/terminology";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

type OrgExpense = Awaited<ReturnType<typeof listExpensesFn>>[number];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

function ExpensesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { singular: departmentSingular } = useDepartmentTerm();
  const canManage = session ? canEnterExpenses(session.role) : false;
  const canDecide = session ? canDecideRequisitions(session.role) : false;
  const canAccessPage = canManage || (session?.leadsDepartment ?? false);

  const expensesQuery = useQuery({ queryKey: ["expenses"], queryFn: () => listExpensesFn() });
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartmentsFn(),
  });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const expenses = expensesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const [editing, setEditing] = useState<OrgExpense | null>(null);
  const [open, setOpen] = useState(false);
  const [accountabilityOpen, setAccountabilityOpen] = useState(false);
  const [q, setQ] = useState("");
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, convert, displayCode, base } = useDisplayCurrency(canToggle);

  const decideMutation = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected" }) =>
      decideExpenseFn({ data: vars }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`Accountability ${vars.status}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update expense"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpenseFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
  });

  useEffect(() => {
    if (session && !canAccessPage) navigate({ to: "/dashboard", replace: true });
  }, [session, canAccessPage, navigate]);

  if (!session || !canAccessPage) return null;

  const filtered = (
    canManage ? expenses : expenses.filter((e) => e.departmentId === session.ledDepartmentId)
  ).filter((e) => matchesBranchFilter(effectiveBranch, e.branchId ?? undefined));

  function departmentName(id: string): string {
    return (
      departments.find((d) => d.id === id)?.name ?? `Unknown ${departmentSingular.toLowerCase()}`
    );
  }

  const visible = filtered.filter((e) => {
    if (!q) return true;
    const enteredBy = users.find((u) => u.id === e.enteredBy);
    const s =
      `${departmentName(e.departmentId)} ${e.description} ${enteredBy?.fullName ?? ""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Money spent by each department — always tied to one, so departmental totals stay complete."
        actions={
          <div className="flex gap-2">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            {canManage && (
              <ExportMenu
                filename="expenses"
                title="Expenses"
                headers={[
                  "Date",
                  departmentSingular,
                  `Amount (${displayCode})`,
                  "Description",
                  "Entered by",
                  "Status",
                ]}
                rows={visible.map((e) => {
                  const enteredBy = users.find((u) => u.id === e.enteredBy);
                  return [
                    format(new Date(e.createdAt), "MMM d, yyyy"),
                    departmentName(e.departmentId),
                    String(convert(e.amount)),
                    e.description,
                    enteredBy?.fullName ?? "",
                    e.status ?? "approved",
                  ];
                })}
              />
            )}
            {session.leadsDepartment && (
              <Dialog open={accountabilityOpen} onOpenChange={setAccountabilityOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <HandCoins className="mr-2 h-4 w-4" /> Submit accountability
                  </Button>
                </DialogTrigger>
                {accountabilityOpen && (
                  <AccountabilityDialog onClose={() => setAccountabilityOpen(false)} />
                )}
              </Dialog>
            )}
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
                    <Plus className="mr-2 h-4 w-4" /> Record expense
                  </Button>
                </DialogTrigger>
                <ExpenseDialog
                  key={editing?.id ?? "new"}
                  expense={editing}
                  departments={departments}
                  onClose={() => setOpen(false)}
                />
              </Dialog>
            )}
          </div>
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${departmentSingular.toLowerCase()}, description, entered by…`}
            className="pl-9"
          />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>{departmentSingular}</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Entered by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((e) => {
                const enteredBy = users.find((u) => u.id === e.enteredBy);
                const status = e.status ?? "approved";
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(e.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{departmentName(e.departmentId)}</TableCell>
                    <TableCell className="font-medium">{formatAmount(e.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{e.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {enteredBy?.fullName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-0 capitalize ${STATUS_STYLE[status] ?? ""}`}>
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {status === "pending" && canDecide && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Approve accountability"
                              disabled={decideMutation.isPending}
                              onClick={() =>
                                decideMutation.mutate({ id: e.id, status: "approved" })
                              }
                            >
                              <Check className="h-4 w-4 text-primary" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Reject accountability"
                              disabled={decideMutation.isPending}
                              onClick={() =>
                                decideMutation.mutate({ id: e.id, status: "rejected" })
                              }
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {canManage && status !== "pending" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit expense from ${e.description}`}
                              onClick={() => {
                                setEditing(e);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <DeleteButton
                              label={`Delete expense: ${e.description}`}
                              title="Delete this expense record?"
                              description="This can't be undone."
                              onConfirm={async () => {
                                try {
                                  await deleteMutation.mutateAsync(e.id);
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error ? err.message : "Failed to delete expense",
                                  );
                                }
                              }}
                            />
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Receipt className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    No expenses recorded yet.
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

function ExpenseDialog({
  expense,
  departments,
  onClose,
}: {
  expense: OrgExpense | null;
  departments: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { singular: departmentSingular, plural: departmentPlural } = useDepartmentTerm();
  const [departmentId, setDepartmentId] = useState(expense?.departmentId ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [branchId, setBranchId] = useState(expense?.branchId ?? "");
  const baseCurrency = useBaseCurrency();

  const saveMutation = useMutation({
    mutationFn: (input: {
      departmentId: string;
      amount: number;
      description: string;
      branchId?: string;
    }) =>
      expense
        ? updateExpenseFn({ data: { id: expense.id, ...input } })
        : createExpenseFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(expense ? "Expense updated" : "Expense recorded");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save expense"),
  });

  function save() {
    if (!departmentId) {
      toast.error(`Select a ${departmentSingular.toLowerCase()}`);
      return;
    }
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    saveMutation.mutate({
      departmentId,
      amount: numericAmount,
      description: description.trim(),
      branchId: branchId || undefined,
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {expense ? "Edit expense" : "Record an expense"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{departmentSingular}</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder={`Select a ${departmentSingular.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {departments.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a {departmentSingular.toLowerCase()} on the {departmentPlural} page first.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Amount ({baseCurrency.code})</Label>
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What was this expense for?"
          />
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saveMutation.isPending}>
          {expense ? "Save changes" : "Record expense"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AccountabilityDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const accountableQuery = useQuery({
    queryKey: ["my-accountable-requisitions"],
    queryFn: () => listMyAccountableRequisitionsFn(),
  });
  const requisitions = accountableQuery.data ?? [];
  const [requisitionId, setRequisitionId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const baseCurrency = useBaseCurrency();

  const submitMutation = useMutation({
    mutationFn: (input: { requisitionId: string; amount: number; description: string }) =>
      submitAccountabilityExpenseFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["my-accountable-requisitions"] });
      toast.success("Accountability submitted — it'll count once Finance approves it");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit accountability"),
  });

  function save() {
    if (!requisitionId) {
      toast.error("Select which requisition this accounts for");
      return;
    }
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    submitMutation.mutate({
      requisitionId,
      amount: numericAmount,
      description: description.trim(),
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">Submit accountability</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          What did you spend the money on? This won't count toward department totals until Finance
          approves it.
        </p>
        <div className="space-y-1.5">
          <Label>Requisition</Label>
          <Select value={requisitionId} onValueChange={setRequisitionId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an approved requisition" />
            </SelectTrigger>
            <SelectContent>
              {requisitions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.reason} ({r.amount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {requisitions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No approved requisitions of yours are waiting for accountability.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Amount spent ({baseCurrency.code})</Label>
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>What was it spent on?</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={submitMutation.isPending}>
          Submit
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
