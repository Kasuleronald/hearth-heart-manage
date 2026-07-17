import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Receipt } from "lucide-react";
import { db, uid, type Department, type Expense } from "@/lib/db";
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
import { useSession, canEnterExpenses, canToggleCurrency } from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const expenses =
    useLiveQuery(
      () => db.expenses.toArray().then((rows) => rows.sort((a, b) => b.createdAt - a.createdAt)),
      [],
    ) ?? [];
  const departments = useLiveQuery(() => db.departments.orderBy("name").toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, convert, displayCode, base } = useDisplayCurrency(canToggle);

  useEffect(() => {
    if (session && !canEnterExpenses(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canEnterExpenses(session.role)) return null;

  const filtered = expenses.filter((e) => matchesBranchFilter(effectiveBranch, e.branchId));

  function departmentName(id: string): string {
    return departments.find((d) => d.id === id)?.name ?? "Unknown department";
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Money spent by each department — always tied to one, so departmental totals stay complete."
        actions={
          <div className="flex gap-2">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            <ExportMenu
              filename="expenses"
              title="Expenses"
              headers={[
                "Date",
                "Department",
                `Amount (${displayCode})`,
                "Description",
                "Entered by",
              ]}
              rows={filtered.map((e) => {
                const enteredBy = users.find((u) => u.id === e.enteredBy);
                return [
                  format(new Date(e.createdAt), "MMM d, yyyy"),
                  departmentName(e.departmentId),
                  String(convert(e.amount)),
                  e.description,
                  enteredBy?.fullName ?? "",
                ];
              })}
            />
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
                expense={editing}
                departments={departments}
                currentUserId={session.userId}
                onClose={() => setOpen(false)}
              />
            </Dialog>
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
                <TableHead>Description</TableHead>
                <TableHead>Entered by</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const enteredBy = users.find((u) => u.id === e.enteredBy);
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
                      <div className="flex justify-end gap-1">
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
                              await db.expenses.delete(e.id);
                              toast.success("Expense deleted");
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Failed to delete expense",
                              );
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
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
  currentUserId,
  onClose,
}: {
  expense: Expense | null;
  departments: Department[];
  currentUserId: string;
  onClose: () => void;
}) {
  const [departmentId, setDepartmentId] = useState(expense?.departmentId ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [branchId, setBranchId] = useState(expense?.branchId ?? "");
  const baseCurrency = useBaseCurrency();

  async function save() {
    if (!departmentId) {
      toast.error("Select a department");
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
    try {
      await db.expenses.put({
        id: expense?.id ?? uid(),
        departmentId,
        amount: numericAmount,
        description: description.trim(),
        branchId: branchId || undefined,
        enteredBy: expense?.enteredBy ?? currentUserId,
        createdAt: expense?.createdAt ?? Date.now(),
      });
      toast.success(expense ? "Expense updated" : "Expense recorded");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save expense");
    }
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
          <Label>Department</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a department" />
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
              Create a department on the Departments page first.
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
        <Button onClick={save}>{expense ? "Save changes" : "Record expense"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
