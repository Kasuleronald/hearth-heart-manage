import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, HandCoins, Search } from "lucide-react";
import type { GivingCategory } from "@/lib/db";
import { listGivingsFn, createGivingFn, updateGivingFn, deleteGivingFn } from "@/server/givings";
import { listMembersFn } from "@/server/members";
import { listPartnersFn } from "@/server/partners";
import { listProjectsFn } from "@/server/projects";
import { listOrgUsersFn } from "@/server/users";
import { ExportMenu } from "@/components/export-menu";
import { useBaseCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/currency-toggle";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession, canAccessGivings, canManageGivings, canToggleCurrency } from "@/lib/auth";
import { useGivingsTerm } from "@/lib/terminology";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/givings")({
  component: GivingsPage,
});

type OrgGiving = Awaited<ReturnType<typeof listGivingsFn>>[number];
type OrgMember = Awaited<ReturnType<typeof listMembersFn>>[number];
type OrgPartner = Awaited<ReturnType<typeof listPartnersFn>>[number];
type OrgProject = Awaited<ReturnType<typeof listProjectsFn>>[number];

const CATEGORIES: { value: GivingCategory; label: string }[] = [
  { value: "love_offering", label: "Love Offering" },
  { value: "tithe", label: "Tithe" },
  { value: "first_fruit", label: "First Fruit" },
  { value: "seed", label: "Seed" },
  { value: "project", label: "Project" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<
  GivingCategory,
  string
>;

function GivingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const givingsQuery = useQuery({ queryKey: ["givings"], queryFn: () => listGivingsFn() });
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const partnersQuery = useQuery({ queryKey: ["partners"], queryFn: () => listPartnersFn() });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => listProjectsFn() });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const givings = givingsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const partners = partnersQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<OrgGiving | null>(null);
  const [open, setOpen] = useState(false);
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, convert, displayCode, base } = useDisplayCurrency(canToggle);
  const { singular: givingsSingular, plural: givingsPlural } = useGivingsTerm();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGivingFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["givings"] });
      toast.success("Giving deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete giving"),
  });

  useEffect(() => {
    if (session && !canAccessGivings(session.role, session.allowedModules)) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, navigate]);

  if (!session || !canAccessGivings(session.role, session.allowedModules)) return null;

  const canManage = canManageGivings(session.role);

  const filtered = givings.filter((g) => {
    if (categoryFilter !== "all" && g.category !== categoryFilter) return false;
    if (!matchesBranchFilter(effectiveBranch, g.branchId ?? undefined)) return false;
    return true;
  });

  const monthStart = format(new Date(), "yyyy-MM") + "-01";
  const thisMonth = givings.filter((g) => g.date >= monthStart);
  const totalsByCategory = CATEGORIES.map((c) => ({
    ...c,
    total: thisMonth.filter((g) => g.category === c.value).reduce((sum, g) => sum + g.amount, 0),
  }));

  function giverName(g: OrgGiving): string {
    if (g.memberId) {
      const m = members.find((mem) => mem.id === g.memberId);
      return m ? `${m.firstName} ${m.lastName}` : "Unknown member";
    }
    if (g.partnerId) {
      const p = partners.find((pt) => pt.id === g.partnerId);
      return p ? `${p.name} (partner)` : "Unknown partner";
    }
    return "Anonymous";
  }

  function projectName(g: OrgGiving): string {
    if (g.projectId) return projects.find((p) => p.id === g.projectId)?.name ?? "Unknown project";
    return g.projectName ?? "";
  }

  const visibleGivings = filtered.filter((g) => {
    if (!q) return true;
    const s = `${giverName(g)} ${projectName(g)} ${g.notes ?? ""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader
        title={givingsPlural}
        description="Love offerings, tithes, first fruits, seeds and project giving."
        actions={
          <div className="flex gap-2">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            <ExportMenu
              filename="givings"
              title={givingsPlural}
              headers={[
                "Date",
                "Category",
                `Amount (${displayCode})`,
                "Giver",
                "Project",
                "Notes",
                "Added by",
              ]}
              rows={visibleGivings.map((g) => {
                const addedBy = users.find((u) => u.id === g.createdBy);
                return [
                  g.date,
                  CATEGORY_LABEL[g.category],
                  String(convert(g.amount)),
                  giverName(g),
                  projectName(g),
                  g.notes ?? "",
                  addedBy?.fullName ?? "",
                ];
              })}
            />
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
                    <Plus className="mr-2 h-4 w-4" /> Record {givingsSingular.toLowerCase()}
                  </Button>
                </DialogTrigger>
                <GivingDialog
                  key={editing?.id ?? "new"}
                  giving={editing}
                  members={members}
                  partners={partners}
                  projects={projects}
                  onClose={() => setOpen(false)}
                />
              </Dialog>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {totalsByCategory.map((c) => (
          <Card key={c.value}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 font-display text-lg font-semibold">{formatAmount(c.total)}</div>
              <div className="text-[10px] text-muted-foreground">this month</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search giver, project, notes…"
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Giver</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleGivings.map((g) => {
                const addedBy = users.find((u) => u.id === g.createdBy);
                const proj = projectName(g);
                return (
                  <TableRow key={g.id}>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(g.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {g.category === "project" && proj
                          ? `${CATEGORY_LABEL[g.category]} — ${proj}`
                          : CATEGORY_LABEL[g.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatAmount(g.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{giverName(g)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {addedBy?.fullName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit giving on ${g.date}`}
                            onClick={() => {
                              setEditing(g);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DeleteButton
                            label={`Delete giving on ${g.date}`}
                            title="Delete this giving record?"
                            description="This can't be undone."
                            onConfirm={async () => {
                              await deleteMutation.mutateAsync(g.id);
                            }}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleGivings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <HandCoins className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    No givings recorded yet.
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

function GivingDialog({
  giving,
  members,
  partners,
  projects,
  onClose,
}: {
  giving: OrgGiving | null;
  members: OrgMember[];
  partners: OrgPartner[];
  projects: OrgProject[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { singular: givingsSingular } = useGivingsTerm();
  const [amount, setAmount] = useState(giving ? String(giving.amount) : "");
  const [category, setCategory] = useState<GivingCategory>(giving?.category ?? "tithe");
  const [giverChoice, setGiverChoice] = useState(
    giving?.memberId
      ? `member:${giving.memberId}`
      : giving?.partnerId
        ? `partner:${giving.partnerId}`
        : "anonymous",
  );
  const [projectId, setProjectId] = useState(giving?.projectId ?? "");
  const [date, setDate] = useState(giving?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(giving?.notes ?? "");
  const [branchId, setBranchId] = useState(giving?.branchId ?? "");
  const baseCurrency = useBaseCurrency();

  const saveMutation = useMutation({
    mutationFn: () => {
      const numericAmount = Number(amount);
      const [giverType, giverId] = giverChoice.split(":");
      const input = {
        memberId: giverType === "member" ? giverId : undefined,
        partnerId: giverType === "partner" ? giverId : undefined,
        category,
        amount: numericAmount,
        projectId: category === "project" ? projectId || undefined : undefined,
        date,
        notes: notes || undefined,
        branchId: branchId || undefined,
      };
      return giving
        ? updateGivingFn({ data: { id: giving.id, ...input } })
        : createGivingFn({ data: input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["givings"] });
      toast.success(giving ? "Giving updated" : "Giving recorded");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save giving"),
  });

  function save() {
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (category === "project" && !projectId) {
      toast.error("Select a project");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {giving
            ? `Edit ${givingsSingular.toLowerCase()}`
            : `Record a ${givingsSingular.toLowerCase()}`}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
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
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as GivingCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {category === "project" && (
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
            {projects.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No projects yet — create one on the{" "}
                <Link to="/projects" className="underline hover:text-foreground">
                  Projects
                </Link>{" "}
                page first.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Giver</Label>
            <Select value={giverChoice} onValueChange={setGiverChoice}>
              <SelectTrigger>
                <SelectValue placeholder="Anonymous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anonymous">Anonymous</SelectItem>
                {members.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Members</SelectLabel>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={`member:${m.id}`}>
                        {m.firstName} {m.lastName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {partners.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Partners</SelectLabel>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={`partner:${p.id}`}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>
          {giving ? "Save changes" : `Record ${givingsSingular.toLowerCase()}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
