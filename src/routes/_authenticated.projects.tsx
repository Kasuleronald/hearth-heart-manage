import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Pencil, Target } from "lucide-react";
import { db, deleteProjectCascade, uid, type Project } from "@/lib/db";
import { formatUGX } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { useSession, canManageProjects } from "@/lib/auth";
import { toast } from "sonner";
import { startOfWeek, startOfMonth, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { session } = useSession();
  const canManage = session ? canManageProjects(session.role) : false;
  const projects = useLiveQuery(() => db.projects.orderBy("name").toArray(), []) ?? [];
  const givings =
    useLiveQuery(() => db.givings.where("category").equals("project").toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [editing, setEditing] = useState<Project | null>(null);
  const [open, setOpen] = useState(false);

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Building funds, Bible distribution, and other church-wide initiatives."
        actions={
          canManage && (
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)}>
                  <Plus className="mr-2 h-4 w-4" /> New project
                </Button>
              </DialogTrigger>
              <ProjectDialog
                project={editing}
                currentUserId={session?.userId}
                onClose={() => setOpen(false)}
              />
            </Dialog>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const linked = givings.filter((g) => g.projectId === p.id);
          const totalRaised = linked.reduce((sum, g) => sum + g.amount, 0);
          const thisWeek = linked
            .filter((g) => g.date >= weekStart)
            .reduce((sum, g) => sum + g.amount, 0);
          const thisMonth = linked
            .filter((g) => g.date >= monthStart)
            .reduce((sum, g) => sum + g.amount, 0);
          const addedBy = users.find((u) => u.id === p.createdBy);

          return (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                    {p.scope && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.scope}</p>
                    )}
                  </div>
                  {canManage && (
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
                        description="Givings recorded against this project are kept, just unlinked. This can't be undone."
                        onConfirm={async () => {
                          try {
                            await deleteProjectCascade(p.id);
                            toast.success("Project deleted");
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Failed to delete project",
                            );
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {p.financialTarget ? (
                    <TargetRow label="Overall" raised={totalRaised} target={p.financialTarget} />
                  ) : (
                    <div className="text-sm">
                      <span className="font-medium">{formatUGX(totalRaised)}</span>{" "}
                      <span className="text-xs text-muted-foreground">raised so far</span>
                    </div>
                  )}
                  {!!p.monthlyTarget && (
                    <TargetRow label="This month" raised={thisMonth} target={p.monthlyTarget} />
                  )}
                  {!!p.weeklyTarget && (
                    <TargetRow label="This week" raised={thisWeek} target={p.weeklyTarget} />
                  )}
                </div>

                {addedBy && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Added by <span className="text-foreground">{addedBy.fullName}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {projects.length === 0 && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
            <Target className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No projects yet.
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Progress is calculated from Givings recorded with category "Project" linked to each project
        — record those from the{" "}
        <Link to="/givings" className="underline hover:text-foreground">
          Givings
        </Link>{" "}
        page.
      </p>
    </div>
  );
}

function TargetRow({ label, raised, target }: { label: string; raised: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">
          {formatUGX(raised)} / {formatUGX(target)}
        </span>
      </div>
      <Progress value={pct} className="mt-1" />
    </div>
  );
}

function ProjectDialog({
  project,
  currentUserId,
  onClose,
}: {
  project: Project | null;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [scope, setScope] = useState(project?.scope ?? "");
  const [financialTarget, setFinancialTarget] = useState(
    project?.financialTarget != null ? String(project.financialTarget) : "",
  );
  const [weeklyTarget, setWeeklyTarget] = useState(
    project?.weeklyTarget != null ? String(project.weeklyTarget) : "",
  );
  const [monthlyTarget, setMonthlyTarget] = useState(
    project?.monthlyTarget != null ? String(project.monthlyTarget) : "",
  );
  const [branchId, setBranchId] = useState(project?.branchId ?? "");

  function parseAmount(v: string): number | undefined {
    if (!v) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await db.projects.put({
        id: project?.id ?? uid(),
        name: name.trim(),
        scope: scope || undefined,
        financialTarget: parseAmount(financialTarget),
        weeklyTarget: parseAmount(weeklyTarget),
        monthlyTarget: parseAmount(monthlyTarget),
        branchId: branchId || undefined,
        createdBy: project?.createdBy ?? currentUserId,
        createdAt: project?.createdAt ?? Date.now(),
      });
      toast.success(project ? "Project updated" : "Project created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save project");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {project ? "Edit project" : "New project"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Building Fund"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Scope</Label>
          <Textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={3}
            placeholder="What this project covers and why"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Overall financial target (UGX)</Label>
          <Input
            type="number"
            min="0"
            value={financialTarget}
            onChange={(e) => setFinancialTarget(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Weekly target (UGX)</Label>
            <Input
              type="number"
              min="0"
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Monthly target (UGX)</Label>
            <Input
              type="number"
              min="0"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
            />
          </div>
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{project ? "Save changes" : "Create project"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
