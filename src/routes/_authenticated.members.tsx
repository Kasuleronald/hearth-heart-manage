import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, Columns3, Hash } from "lucide-react";
import {
  db,
  deleteMemberCascade,
  uid,
  formatBirthday,
  MONTH_NAMES,
  type Member,
  type MemberCategory,
  type MemberStatus,
} from "@/lib/db";
import { ExportMenu } from "@/components/export-menu";
import { BranchField } from "@/components/branch-field";
import { notifyMemberAdded, notifyMemberDeleted } from "@/lib/notifications";
import { useSession, canEditDeleteMembers } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/members")({
  component: MembersPage,
});

const STATUSES: MemberStatus[] = ["visitor", "member", "baptized", "inactive"];

const CATEGORIES: { value: MemberCategory; label: string; description?: string }[] = [
  { value: "member", label: "Member" },
  { value: "committed", label: "Committed" },
  { value: "pastor", label: "Pastor" },
  { value: "leader", label: "Leader" },
  {
    value: "new_recruit",
    label: "New Recruit",
    description:
      "A believer with no current church, or newly relocated to the area, choosing to commit to this church.",
  },
  {
    value: "new_convert",
    label: "New Convert",
    description:
      "Someone who has undergone a spiritual rebirth during outreach, mission, a gathering/encounter, or revival context.",
  },
  {
    value: "visitor",
    label: "Visitor",
    description: "Attending services/programs but not yet committed; needs follow-up.",
  },
  { value: "uncommitted", label: "Uncommitted" },
  {
    value: "fellowship_member",
    label: "Fellowship Member",
    description: "Attends cell/home/zonal fellowships only, not main services/programs.",
  },
  { value: "other", label: "Other" },
];
// Legacy values from before the category set was expanded — still rendered
// for existing records, not offered for new ones.
const CATEGORY_LABEL: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])),
  new_member: "New Recruit",
  convert: "New Convert",
};

interface ColumnCtx {
  households: { id: string; name: string }[];
  cells: { id: string; name: string }[];
  users: { id: string; fullName: string }[];
  cellSingular: string;
}

const OPTIONAL_COLUMNS: {
  key: string;
  label: (ctx: ColumnCtx) => string;
  defaultVisible: boolean;
  render: (m: Member, ctx: ColumnCtx) => React.ReactNode;
  csv: (m: Member, ctx: ColumnCtx) => string;
}[] = [
  {
    key: "number",
    label: () => "Number",
    defaultVisible: true,
    render: (m) => m.number ?? "Unnumbered",
    csv: (m) => m.number ?? "",
  },
  {
    key: "phone",
    label: () => "Phone",
    defaultVisible: true,
    render: (m) => m.phone ?? "—",
    csv: (m) => m.phone ?? "",
  },
  {
    key: "address",
    label: () => "Address",
    defaultVisible: false,
    render: (m) => m.address ?? "—",
    csv: (m) => m.address ?? "",
  },
  {
    key: "dob",
    label: () => "Date of birth",
    defaultVisible: false,
    render: (m) => formatBirthday(m) ?? "—",
    csv: (m) => formatBirthday(m) ?? "",
  },
  {
    key: "category",
    label: () => "Category",
    defaultVisible: false,
    render: (m) =>
      m.category
        ? (CATEGORY_LABEL[m.category] ?? m.category) +
          (m.categoryOther ? ` — ${m.categoryOther}` : "")
        : "—",
    csv: (m) => (m.category ? (CATEGORY_LABEL[m.category] ?? m.category) : ""),
  },
  {
    key: "household",
    label: () => "Household",
    defaultVisible: true,
    render: (m, ctx) => ctx.households.find((h) => h.id === m.householdId)?.name ?? "—",
    csv: (m, ctx) => ctx.households.find((h) => h.id === m.householdId)?.name ?? "",
  },
  {
    key: "cell",
    label: (ctx) => ctx.cellSingular,
    defaultVisible: true,
    render: (m, ctx) => ctx.cells.find((c) => c.id === m.cellId)?.name ?? "—",
    csv: (m, ctx) => ctx.cells.find((c) => c.id === m.cellId)?.name ?? "",
  },
  {
    key: "addedBy",
    label: () => "Added by",
    defaultVisible: true,
    render: (m, ctx) => ctx.users.find((u) => u.id === m.createdBy)?.fullName ?? "—",
    csv: (m, ctx) => ctx.users.find((u) => u.id === m.createdBy)?.fullName ?? "",
  },
];

function MembersPage() {
  const { session } = useSession();
  const { singular: cellSingular } = useCellTerm();
  const canEditDelete = session ? canEditDeleteMembers(session.role) : false;
  const members = useLiveQuery(() => db.members.orderBy("lastName").toArray(), []) ?? [];
  const households = useLiveQuery(() => db.households.toArray(), []) ?? [];
  const cells = useLiveQuery(() => db.cells.toArray(), []) ?? [];
  const classes = useLiveQuery(() => db.classes.toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(OPTIONAL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  );
  const effectiveBranch = useEffectiveBranch(session?.branchId);

  const ctx: ColumnCtx = { households, cells, users, cellSingular };
  const activeColumns = OPTIONAL_COLUMNS.filter((c) => visibleCols.has(c.key));

  const filtered = members.filter((m) => {
    const s = `${m.firstName} ${m.lastName} ${m.phone ?? ""} ${m.email ?? ""}`.toLowerCase();
    if (q && !s.includes(q.toLowerCase())) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (joinedFrom && (!m.joinDate || m.joinDate < joinedFrom)) return false;
    if (joinedTo && (!m.joinDate || m.joinDate > joinedTo)) return false;
    if (!matchesBranchFilter(effectiveBranch, m.branchId)) return false;
    return true;
  });

  function toggleColumn(key: string) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Members"
        description="Everyone in your church directory."
        actions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Columns3 className="mr-2 h-4 w-4" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {OPTIONAL_COLUMNS.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={visibleCols.has(c.key)}
                    onCheckedChange={() => toggleColumn(c.key)}
                  >
                    {c.label(ctx)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ExportMenu
              filename="members"
              title="Members"
              headers={[
                "First name",
                "Last name",
                "Status",
                ...activeColumns.map((c) => c.label(ctx)),
              ]}
              rows={filtered.map((m) => [
                m.firstName,
                m.lastName,
                m.status,
                ...activeColumns.map((c) => c.csv(m, ctx)),
              ])}
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
                  <Plus className="mr-2 h-4 w-4" /> New member
                </Button>
              </DialogTrigger>
              <MemberDialog
                key={editing?.id ?? "new"}
                member={editing}
                households={households}
                cells={cells}
                classes={classes}
                cellSingular={cellSingular}
                currentUserId={session?.userId}
                onClose={() => setOpen(false)}
              />
            </Dialog>
          </div>
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, email…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="joinedFrom" className="text-xs text-muted-foreground whitespace-nowrap">
              Joined
            </Label>
            <Input
              id="joinedFrom"
              type="date"
              value={joinedFrom}
              onChange={(e) => setJoinedFrom(e.target.value)}
              className="w-40"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={joinedTo}
              onChange={(e) => setJoinedTo(e.target.value)}
              className="w-40"
            />
            {(joinedFrom || joinedTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setJoinedFrom("");
                  setJoinedTo("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                {activeColumns.map((c) => (
                  <TableHead key={c.key}>{c.label(ctx)}</TableHead>
                ))}
                {canEditDelete && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setViewing(m)}
                    >
                      {m.firstName} {m.lastName}
                    </button>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  {activeColumns.map((c) => (
                    <TableCell key={c.key} className="text-muted-foreground">
                      {c.render(m, ctx)}
                    </TableCell>
                  ))}
                  {canEditDelete && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${m.firstName} ${m.lastName}`}
                          onClick={() => {
                            setEditing(m);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <MemberDeleteDialog
                          member={m}
                          onConfirm={async (reason) => {
                            await deleteMemberCascade(m.id);
                            if (session) {
                              await notifyMemberDeleted(
                                `${m.firstName} ${m.lastName}`,
                                reason,
                                session.userId,
                                m.createdBy,
                              );
                            }
                            toast.success("Member deleted");
                          }}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3 + activeColumns.length + (canEditDelete ? 1 : 0)}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No members yet. Add your first member to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      {viewing && (
        <MemberDetailsDialog
          key={viewing.id}
          member={viewing}
          ctx={ctx}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: MemberStatus }) {
  const map: Record<MemberStatus, string> = {
    visitor: "bg-accent/30 text-accent-foreground",
    member: "bg-primary/15 text-primary",
    baptized: "bg-primary text-primary-foreground",
    inactive: "bg-muted text-muted-foreground",
  };
  return <Badge className={`${map[status]} capitalize border-0`}>{status}</Badge>;
}

function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${className ?? ""}`}>{value}</span>
    </div>
  );
}

function MemberDetailsDialog({
  member,
  ctx,
  onClose,
}: {
  member: Member;
  ctx: ColumnCtx;
  onClose: () => void;
}) {
  const household = ctx.households.find((h) => h.id === member.householdId);
  const cell = ctx.cells.find((c) => c.id === member.cellId);
  const addedBy = ctx.users.find((u) => u.id === member.createdBy);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            {member.firstName} {member.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <StatusBadge status={member.status} />
          {member.number && (
            <Badge variant="outline">
              <Hash className="mr-1 h-3 w-3" />
              {member.number}
            </Badge>
          )}
        </div>
        <div>
          <DetailRow
            label="Category"
            value={
              member.category
                ? (CATEGORY_LABEL[member.category] ?? member.category) +
                  (member.categoryOther ? ` — ${member.categoryOther}` : "")
                : undefined
            }
          />
          <DetailRow label="Phone" value={member.phone} />
          <DetailRow label="Email" value={member.email} />
          <DetailRow label="Address" value={member.address} />
          <DetailRow label="Date of birth" value={formatBirthday(member)} />
          <DetailRow label="Gender" value={member.gender} className="capitalize" />
          <DetailRow label="Household" value={household?.name} />
          <DetailRow label={ctx.cellSingular} value={cell?.name} />
          <DetailRow
            label="Joined"
            value={member.joinDate ? format(new Date(member.joinDate), "PPP") : undefined}
          />
          <DetailRow label="Added by" value={addedBy?.fullName} />
        </div>
        {member.notes && (
          <div>
            <div className="text-xs text-muted-foreground">Notes</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{member.notes}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" asChild>
            <Link to="/members/$id" params={{ id: member.id }}>
              View full profile
            </Link>
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberDeleteDialog({
  member,
  onConfirm,
}: {
  member: Member;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = reason.trim().length >= 15;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setReason("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Delete ${member.firstName} ${member.lastName}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">
            Delete {member.firstName} {member.lastName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This also removes their cell and event attendance history. This can't be undone. Enter a
            reason (at least 15 characters) — the person who added this record and pastors will be
            notified, including who deleted it and why.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label>Reason for deletion</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this record being deleted?"
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length}/15 characters minimum
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!valid || busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                setOpen(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to delete member");
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MemberDialog({
  member,
  households,
  cells,
  classes,
  cellSingular,
  currentUserId,
  onClose,
}: {
  member: Member | null;
  households: { id: string; name: string }[];
  cells: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  cellSingular: string;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(member?.firstName ?? "");
  const [lastName, setLastName] = useState(member?.lastName ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [gender, setGender] = useState<Member["gender"]>(member?.gender);
  const [birthMonth, setBirthMonth] = useState(member?.birthMonth ? String(member.birthMonth) : "");
  const [birthDay, setBirthDay] = useState(member?.birthDay ? String(member.birthDay) : "");
  const [birthYear, setBirthYear] = useState(member?.birthYear ? String(member.birthYear) : "");
  const [address, setAddress] = useState(member?.address ?? "");
  const [status, setStatus] = useState<MemberStatus>(member?.status ?? "visitor");
  const [category, setCategory] = useState<MemberCategory | undefined>(member?.category);
  const [categoryOther, setCategoryOther] = useState(member?.categoryOther ?? "");
  const [joinDate, setJoinDate] = useState(member?.joinDate ?? "");
  const [householdId, setHouseholdId] = useState(member?.householdId ?? "");
  const [cellId, setCellId] = useState(member?.cellId ?? "");
  const [classId, setClassId] = useState(member?.classId ?? "");
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [branchId, setBranchId] = useState(member?.branchId ?? "");

  const categoryDescription = CATEGORIES.find((c) => c.value === category)?.description;

  async function save() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (Boolean(birthMonth) !== Boolean(birthDay)) {
      toast.error("Enter both a birth month and day, or leave both blank");
      return;
    }
    const data: Member = {
      id: member?.id ?? uid(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone || undefined,
      email: email || undefined,
      gender,
      birthMonth: birthMonth ? Number(birthMonth) : undefined,
      birthDay: birthDay ? Number(birthDay) : undefined,
      birthYear: birthYear ? Number(birthYear) : undefined,
      address: address || undefined,
      status,
      category,
      categoryOther: category === "other" ? categoryOther || undefined : undefined,
      number: member?.number,
      joinDate: joinDate || undefined,
      householdId: householdId || undefined,
      cellId: cellId || undefined,
      classId: classId || undefined,
      notes: notes || undefined,
      branchId: branchId || undefined,
      createdBy: member?.createdBy ?? currentUserId,
      createdAt: member?.createdAt ?? Date.now(),
    };
    try {
      await db.transaction("rw", [db.members, db.users, db.notifications], async () => {
        await db.members.put(data);
        if (!member && currentUserId) {
          await notifyMemberAdded(data, currentUserId);
        }
      });
      toast.success(member ? "Member updated" : "Member added");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save member");
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display">{member ? "Edit member" : "New member"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select
            value={gender ?? ""}
            onValueChange={(v) => setGender((v || undefined) as Member["gender"])}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date of birth">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={birthMonth || "none"}
              onValueChange={(v) => setBirthMonth(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={name} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={birthDay || "none"}
              onValueChange={(v) => setBirthDay(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="mt-2"
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            placeholder="Year (optional)"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Year is optional — leave blank if they'd rather not share it.
          </p>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as MemberStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div>
          <Field label="Category">
            <Select
              value={category ?? "none"}
              onValueChange={(v) => setCategory(v === "none" ? undefined : (v as MemberCategory))}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {categoryDescription && (
            <p className="mt-1 text-xs text-muted-foreground">{categoryDescription}</p>
          )}
          {category === "other" && (
            <Input
              className="mt-1.5"
              value={categoryOther}
              onChange={(e) => setCategoryOther(e.target.value)}
              placeholder="Describe this category"
            />
          )}
        </div>
        <Field label="Join date">
          <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
        </Field>
        <Field label="Household">
          <Select
            value={householdId || "none"}
            onValueChange={(v) => setHouseholdId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {households.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={cellSingular}>
          <Select value={cellId || "none"} onValueChange={(v) => setCellId(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {cells.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Discipleship class">
          <Select
            value={classId || "none"}
            onValueChange={(v) => setClassId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <BranchField value={branchId} onChange={setBranchId} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{member ? "Save changes" : "Create member"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
