import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Building2, Sparkles } from "lucide-react";
import type { DepartmentModule } from "@/lib/db";
import {
  listDepartmentsFn,
  createDepartmentFn,
  updateDepartmentFn,
  deleteDepartmentFn,
  seedDefaultDepartmentsFn,
} from "@/server/departments";
import { listOrgUsersFn } from "@/server/users";
import { listExpensesFn } from "@/server/expenses";
import { useBaseCurrency, formatCurrency } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useSession, canAccessDepartments, canManageDepartments } from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({
  component: DepartmentsPage,
});

type OrgDepartment = Awaited<ReturnType<typeof listDepartmentsFn>>[number];

const MODULE_OPTIONS: { value: DepartmentModule; label: string }[] = [
  { value: "givings", label: "Givings" },
  { value: "projects", label: "Projects" },
  { value: "pledges", label: "Pledges" },
  { value: "partners", label: "Partners" },
];

function DepartmentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const baseCurrency = useBaseCurrency();
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartmentsFn(),
  });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const expensesQuery = useQuery({ queryKey: ["expenses"], queryFn: () => listExpensesFn() });
  const allDepartments = departmentsQuery.data ?? [];
  const departments = allDepartments.filter((d) =>
    matchesBranchFilter(effectiveBranch, d.branchId ?? undefined),
  );
  const users = (usersQuery.data ?? []).filter(
    (u) =>
      u.role === "leader" || u.role === "pastor" || u.role === "admin" || u.role === "cell_leader",
  );
  const expenses = expensesQuery.data ?? [];
  const [editing, setEditing] = useState<OrgDepartment | null>(null);
  const [open, setOpen] = useState(false);

  const seedMutation = useMutation({
    mutationFn: () => seedDefaultDepartmentsFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Common departments added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add departments"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDepartmentFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Department deleted");
    },
  });

  const canManage = session ? canManageDepartments(session.role) : false;
  const roleAllows = session ? canAccessDepartments(session.role) : false;
  const dataPending = !roleAllows && departmentsQuery.isLoading;
  const canAccess = session ? canAccessDepartments(session.role, session.leadsDepartment) : false;

  useEffect(() => {
    if (session && !dataPending && !canAccess) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, dataPending, canAccess, navigate]);

  if (!session || dataPending || !canAccess) return null;

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Ministries and teams — Ushering, Sound, Worship, Youth, and the leader assigned to each."
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={seedMutation.isPending}
                onClick={() => seedMutation.mutate()}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Add common departments
              </Button>
              <Dialog
                open={open}
                onOpenChange={(o) => {
                  setOpen(o);
                  if (!o) setEditing(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => setEditing(null)}>
                    <Plus className="mr-2 h-4 w-4" /> New department
                  </Button>
                </DialogTrigger>
                <DepartmentDialog
                  key={editing?.id ?? "new"}
                  dept={editing}
                  users={users}
                  onClose={() => setOpen(false)}
                />
              </Dialog>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((d) => {
          const leader = users.find((u) => u.id === d.leaderId);
          const isMine = session?.userId === d.leaderId;
          const expenseTotal = expenses
            .filter((e) => e.departmentId === d.id && e.status !== "rejected")
            .reduce((sum, e) => sum + e.amount, 0);
          return (
            <Card key={d.id} className={isMine ? "border-primary" : undefined}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{d.name}</h3>
                    {d.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {d.description}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${d.name}`}
                        onClick={() => {
                          setEditing(d);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        label={`Delete ${d.name}`}
                        title={`Delete department "${d.name}"?`}
                        description="This also removes its recorded expenses and requisitions. This can't be undone."
                        onConfirm={async () => {
                          try {
                            await deleteMutation.mutateAsync(d.id);
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Failed to delete department",
                            );
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  {leader ? (
                    <Badge variant="secondary">{leader.fullName}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                  {isMine && (
                    <Badge className="border-0 bg-primary text-primary-foreground">
                      You lead this
                    </Badge>
                  )}
                  {d.allowedModules.map((m) => (
                    <Badge key={m} variant="outline" className="text-xs capitalize">
                      {m}
                    </Badge>
                  ))}
                </div>
                {expenseTotal > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Expenses:{" "}
                    <span className="text-foreground">
                      {formatCurrency(expenseTotal, baseCurrency.code)}
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {departments.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            <Building2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No departments yet.
          </div>
        )}
      </div>
    </div>
  );
}

function DepartmentDialog({
  dept,
  users,
  onClose,
}: {
  dept: OrgDepartment | null;
  users: { id: string; fullName: string; role: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(dept?.name ?? "");
  const [description, setDescription] = useState(dept?.description ?? "");
  const [leaderId, setLeaderId] = useState(dept?.leaderId ?? "");
  const [branchId, setBranchId] = useState(dept?.branchId ?? "");
  const [allowedModules, setAllowedModules] = useState<DepartmentModule[]>(
    dept?.allowedModules ?? [],
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        description: description || undefined,
        leaderId: leaderId || undefined,
        allowedModules,
        branchId: branchId || undefined,
      };
      return dept
        ? updateDepartmentFn({ data: { id: dept.id, ...input } })
        : createDepartmentFn({ data: input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success(dept ? "Department updated" : "Department created");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save department"),
  });

  function toggleModule(m: DepartmentModule) {
    setAllowedModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {dept ? "Edit department" : "New department"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ushering" />
        </div>
        <div className="space-y-1.5">
          <Label>Leader</Label>
          <Select
            value={leaderId || "none"}
            onValueChange={(v) => setLeaderId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Assign a leader" />
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
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a user with role "Department Leader" in the Users page to assign here.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>Module access</Label>
          <p className="text-xs text-muted-foreground">
            Extra screens this department's leader can see, on top of whatever their account role
            already grants.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MODULE_OPTIONS.map((m) => (
              <label
                key={m.value}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={allowedModules.includes(m.value)}
                  onCheckedChange={() => toggleModule(m.value)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saveMutation.isPending}>
          {dept ? "Save changes" : "Create department"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
