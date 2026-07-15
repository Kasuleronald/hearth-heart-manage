import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Download, HandCoins } from "lucide-react";
import { db, uid, type Giving, type GivingCategory, type Partner, type Project } from "@/lib/db";
import { downloadCsv } from "@/lib/download";
import { formatUGX } from "@/lib/currency";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession, canAccessGivings } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/givings")({
  component: GivingsPage,
});

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
  const { session } = useSession();
  const givings = useLiveQuery(() => db.givings.orderBy("date").reverse().toArray(), []) ?? [];
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const partners = useLiveQuery(() => db.partners.orderBy("name").toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.orderBy("name").toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Giving | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session && !canAccessGivings(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canAccessGivings(session.role)) return null;

  const filtered = givings.filter((g) => categoryFilter === "all" || g.category === categoryFilter);

  const monthStart = format(new Date(), "yyyy-MM") + "-01";
  const thisMonth = givings.filter((g) => g.date >= monthStart);
  const totalsByCategory = CATEGORIES.map((c) => ({
    ...c,
    total: thisMonth.filter((g) => g.category === c.value).reduce((sum, g) => sum + g.amount, 0),
  }));

  function giverName(g: Giving): string {
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

  function projectName(g: Giving): string {
    if (g.projectId) return projects.find((p) => p.id === g.projectId)?.name ?? "Unknown project";
    return g.projectName ?? "";
  }

  return (
    <div>
      <PageHeader
        title="Givings"
        description="Love offerings, tithes, first fruits, seeds and project giving."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const rows = [
                  ["Date", "Category", "Amount (UGX)", "Giver", "Project", "Notes", "Added by"],
                  ...filtered.map((g) => {
                    const addedBy = users.find((u) => u.id === g.createdBy);
                    return [
                      g.date,
                      CATEGORY_LABEL[g.category],
                      String(g.amount),
                      giverName(g),
                      projectName(g),
                      g.notes ?? "",
                      addedBy?.fullName ?? "",
                    ];
                  }),
                ];
                downloadCsv("givings.csv", rows);
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
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
                  <Plus className="mr-2 h-4 w-4" /> Record giving
                </Button>
              </DialogTrigger>
              <GivingDialog
                giving={editing}
                members={members}
                partners={partners}
                projects={projects}
                currentUserId={session.userId}
                onClose={() => setOpen(false)}
              />
            </Dialog>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {totalsByCategory.map((c) => (
          <Card key={c.value}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 font-display text-lg font-semibold">{formatUGX(c.total)}</div>
              <div className="text-[10px] text-muted-foreground">this month</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
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
              {filtered.map((g) => {
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
                    <TableCell className="font-medium">{formatUGX(g.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{giverName(g)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {addedBy?.fullName ?? "—"}
                    </TableCell>
                    <TableCell>
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
                            try {
                              await db.givings.delete(g.id);
                              toast.success("Giving deleted");
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Failed to delete giving",
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
  currentUserId,
  onClose,
}: {
  giving: Giving | null;
  members: { id: string; firstName: string; lastName: string }[];
  partners: Partner[];
  projects: Project[];
  currentUserId: string;
  onClose: () => void;
}) {
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

  async function save() {
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (category === "project" && !projectId) {
      toast.error("Select a project");
      return;
    }
    const [giverType, giverId] = giverChoice.split(":");
    try {
      await db.givings.put({
        id: giving?.id ?? uid(),
        memberId: giverType === "member" ? giverId : undefined,
        partnerId: giverType === "partner" ? giverId : undefined,
        category,
        amount: numericAmount,
        projectId: category === "project" ? projectId || undefined : undefined,
        date,
        notes: notes || undefined,
        createdBy: giving?.createdBy ?? currentUserId,
        createdAt: giving?.createdAt ?? Date.now(),
      });
      toast.success(giving ? "Giving updated" : "Giving recorded");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save giving");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {giving ? "Edit giving" : "Record a giving"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Amount (UGX)</Label>
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
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{giving ? "Save changes" : "Record giving"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
