import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Plus, Pencil, Download, HandCoins } from "lucide-react";
import { db, uid, type Giving, type GivingCategory } from "@/lib/db";
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
  SelectItem,
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
                  ["Date", "Category", "Amount (UGX)", "Member", "Project", "Notes"],
                  ...filtered.map((g) => {
                    const m = members.find((mem) => mem.id === g.memberId);
                    return [
                      g.date,
                      CATEGORY_LABEL[g.category],
                      String(g.amount),
                      m ? `${m.firstName} ${m.lastName}` : "Anonymous",
                      g.projectName ?? "",
                      g.notes ?? "",
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
              <GivingDialog giving={editing} members={members} onClose={() => setOpen(false)} />
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
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => {
                const m = members.find((mem) => mem.id === g.memberId);
                return (
                  <TableRow key={g.id}>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(g.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {g.category === "project" && g.projectName
                          ? `${CATEGORY_LABEL[g.category]} — ${g.projectName}`
                          : CATEGORY_LABEL[g.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatUGX(g.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m ? `${m.firstName} ${m.lastName}` : "Anonymous"}
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
                    colSpan={5}
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
  onClose,
}: {
  giving: Giving | null;
  members: { id: string; firstName: string; lastName: string }[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(giving ? String(giving.amount) : "");
  const [category, setCategory] = useState<GivingCategory>(giving?.category ?? "tithe");
  const [memberId, setMemberId] = useState(giving?.memberId ?? "");
  const [projectName, setProjectName] = useState(giving?.projectName ?? "");
  const [date, setDate] = useState(giving?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(giving?.notes ?? "");

  async function save() {
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await db.givings.put({
        id: giving?.id ?? uid(),
        memberId: memberId || undefined,
        category,
        amount: numericAmount,
        projectName: category === "project" ? projectName || undefined : undefined,
        date,
        notes: notes || undefined,
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
            <Label>Project name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Building Fund"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Giver</Label>
            <Select
              value={memberId || "anonymous"}
              onValueChange={(v) => setMemberId(v === "anonymous" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Anonymous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anonymous">Anonymous</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
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
