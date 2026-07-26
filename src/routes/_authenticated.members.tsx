import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Columns3,
  Hash,
  Upload,
  Download,
  Copy,
  UserPlus,
  Check,
  X,
} from "lucide-react";
import { formatBirthday, MONTH_NAMES, type MemberCategory, type MemberStatus } from "@/lib/db";
import {
  listMembersFn,
  listMemberFormOptionsFn,
  createMemberFn,
  updateMemberFn,
  deleteMemberFn,
  nextMemberNumberFn,
  importMembersFn,
} from "@/server/members";
import {
  listPendingRegistrationsFn,
  approveMemberRegistrationFn,
  rejectMemberRegistrationFn,
} from "@/server/member-registrations";
import { ExportMenu } from "@/components/export-menu";
import { BranchField } from "@/components/branch-field";
import { DuplicateEmailAlert } from "@/components/duplicate-email-alert";
import { findEmailMatches, type DuplicateEmailMatch } from "@/lib/duplicate-contact";
import { downloadMemberImportTemplate, parseMemberImportFile } from "@/lib/member-import";
import { copyToClipboard } from "@/lib/clipboard";
import { useCountry } from "@/lib/country";
import {
  useSession,
  canEditDeleteMembers,
  canImportMembers,
  canManageMemberRegistrations,
} from "@/lib/auth";
import { useCellTerm, useTerm } from "@/lib/terminology";
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

type Member = Awaited<ReturnType<typeof listMembersFn>>[number];

const STATUSES: MemberStatus[] = [
  "active",
  "inactive",
  "leader",
  "deacon",
  "elder",
  "pastor",
  "minister",
];
const STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Active Member",
  inactive: "Inactive Member",
  leader: "Leader",
  deacon: "Deacon",
  elder: "Elder",
  pastor: "Pastor",
  minister: "Minister",
};

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
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { singular: cellSingular } = useCellTerm();
  const { singular: classSingular } = useTerm("class");
  const canEditDelete = session ? canEditDeleteMembers(session.role) : false;
  const canImport = session ? canImportMembers(session.role) : false;
  const canReviewRegistrations = session ? canManageMemberRegistrations(session.role) : false;
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const registrationsQuery = useQuery({
    queryKey: ["pending-registrations"],
    queryFn: () => listPendingRegistrationsFn(),
    enabled: canReviewRegistrations,
  });
  const pendingRegistrations = registrationsQuery.data ?? [];
  const optionsQuery = useQuery({
    queryKey: ["member-form-options"],
    queryFn: () => listMemberFormOptionsFn(),
  });
  const members = membersQuery.data ?? [];
  const households = optionsQuery.data?.households ?? [];
  const cells = optionsQuery.data?.cells ?? [];
  const classes = optionsQuery.data?.classes ?? [];
  const users = optionsQuery.data?.users ?? [];

  // Errors are handled by MemberDeleteDialog's own try/catch around
  // mutateAsync — no onError here to avoid a duplicate toast.
  const deleteMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => deleteMemberFn({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Member deleted");
    },
  });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(false);
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
    if (!matchesBranchFilter(effectiveBranch, m.branchId ?? undefined)) return false;
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
                STATUS_LABELS[m.status],
                ...activeColumns.map((c) => c.csv(m, ctx)),
              ])}
            />
            {canImport && (
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> Import members
                  </Button>
                </DialogTrigger>
                <ImportMembersDialog
                  cellLabel={cellSingular}
                  classLabel={classSingular}
                  onImported={() => queryClient.invalidateQueries({ queryKey: ["members"] })}
                  onClose={() => setImportOpen(false)}
                />
              </Dialog>
            )}
            {canReviewRegistrations && (
              <Dialog open={registrationsOpen} onOpenChange={setRegistrationsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="relative">
                    <UserPlus className="mr-2 h-4 w-4" /> Registrations
                    {pendingRegistrations.length > 0 && (
                      <Badge className="ml-2 border-0 bg-destructive px-1.5 text-destructive-foreground">
                        {pendingRegistrations.length}
                      </Badge>
                    )}
                  </Button>
                </DialogTrigger>
                <RegistrationsDialog
                  organizationId={session?.organizationId ?? ""}
                  registrations={pendingRegistrations}
                  onClose={() => setRegistrationsOpen(false)}
                />
              </Dialog>
            )}
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
                members={members}
                households={households}
                cells={cells}
                classes={classes}
                users={users}
                cellSingular={cellSingular}
                canEditNumber={canEditDelete}
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
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
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
                            await deleteMutation.mutateAsync({ id: m.id, reason });
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

type PendingRegistration = Awaited<ReturnType<typeof listPendingRegistrationsFn>>[number];

function RegistrationsDialog({
  organizationId,
  registrations,
  onClose,
}: {
  organizationId: string;
  registrations: PendingRegistration[];
  onClose: () => void;
}) {
  const link = `${window.location.origin}/register/${organizationId}`;

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display">Member registrations</DialogTitle>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label>Self-registration link</Label>
        <div className="flex gap-2">
          <Input readOnly value={link} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              copyToClipboard(link).then((ok) =>
                ok ? toast.success("Copied") : toast.error("Couldn't copy — copy it manually"),
              )
            }
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this link (or a QR code pointing to it) so prospective members can register
          themselves — submissions land here for review before becoming real member records.
        </p>
      </div>
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {registrations.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No pending registrations.
          </p>
        )}
        {registrations.map((r) => (
          <RegistrationRow key={r.id} registration={r} />
        ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RegistrationRow({ registration: r }: { registration: PendingRegistration }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const approveMutation = useMutation({
    mutationFn: () => approveMemberRegistrationFn({ data: { id: r.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success(`${r.firstName} ${r.lastName} added as a member`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to approve"),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      rejectMemberRegistrationFn({ data: { id: r.id, reason: reason.trim() || undefined } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
      toast.success("Registration rejected");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to reject"),
  });

  const dob =
    r.birthMonth && r.birthDay
      ? `${MONTH_NAMES[r.birthMonth - 1]} ${r.birthDay}${r.birthYear ? `, ${r.birthYear}` : ""}`
      : null;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {r.firstName} {r.lastName}
          </div>
          <div className="text-xs text-muted-foreground">{r.address}</div>
          {(r.phone || r.email) && (
            <div className="text-xs text-muted-foreground">
              {[r.phone, r.email].filter(Boolean).join(" · ")}
            </div>
          )}
          {dob && <div className="text-xs text-muted-foreground">Born {dob}</div>}
          {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
        </div>
        {!rejecting && (
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="outline"
              aria-label={`Approve ${r.firstName} ${r.lastName}`}
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label={`Reject ${r.firstName} ${r.lastName}`}
              onClick={() => setRejecting(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => rejectMutation.mutate()}
            >
              Confirm reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportMembersDialog({
  cellLabel,
  classLabel,
  onImported,
  onClose,
}: {
  cellLabel: string;
  classLabel: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importMembersFn>> | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const rows = await parseMemberImportFile(file, cellLabel, classLabel);
      if (rows.length === 0) {
        toast.error("No rows found in that file — is it the right template?");
        return;
      }
      const res = await importMembersFn({ data: { rows } });
      setResult(res);
      if (res.imported > 0) onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import members");
    } finally {
      setImporting(false);
    }
  }

  if (result) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Import complete</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Imported <span className="font-medium">{result.imported}</span> member
          {result.imported === 1 ? "" : "s"}.
        </p>
        {result.skipped.length > 0 && (
          <div>
            <p className="text-sm font-medium text-destructive">
              Skipped {result.skipped.length} row{result.skipped.length === 1 ? "" : "s"}:
            </p>
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.warnings.length > 0 && (
          <div>
            <p className="text-sm font-medium">Notes:</p>
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {result.warnings.map((w, i) => (
                <li key={i}>
                  Row {w.row}: {w.note}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">Import members</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Bulk-add members from a spreadsheet. Don't have the template yet? Download it, fill it in,
          then upload it here.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            downloadMemberImportTemplate(
              cellLabel,
              classLabel,
              STATUSES.map((s) => STATUS_LABELS[s]),
              CATEGORIES.map((c) => c.label),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Download template
        </Button>
        <div>
          <label>
            <Button type="button" className="w-full" disabled={importing} asChild>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                {importing ? "Importing…" : "Already have it filled in? Upload it"}
              </span>
            </Button>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importing}
              onChange={handleFile}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Whoever uploads the file is recorded as the one who added each member. First name, last
          name, and address are required for every row — anything else can be left blank.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function StatusBadge({ status }: { status: MemberStatus }) {
  const map: Record<MemberStatus, string> = {
    active: "bg-primary/15 text-primary",
    inactive: "bg-muted text-muted-foreground",
    leader: "bg-accent/30 text-accent-foreground",
    deacon: "bg-accent/30 text-accent-foreground",
    elder: "bg-accent/30 text-accent-foreground",
    pastor: "bg-primary text-primary-foreground",
    minister: "bg-primary text-primary-foreground",
  };
  return <Badge className={`${map[status]} border-0`}>{STATUS_LABELS[status]}</Badge>;
}

function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
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
  members,
  households,
  cells,
  classes,
  users,
  cellSingular,
  canEditNumber,
  onClose,
}: {
  member: Member | null;
  members: Member[];
  households: { id: string; name: string }[];
  cells: { id: string; name: string }[];
  classes: { id: string; name: string }[];
  users: { id: string; fullName: string; email: string; role: string }[];
  cellSingular: string;
  canEditNumber: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(member?.firstName ?? "");
  const [lastName, setLastName] = useState(member?.lastName ?? "");
  const country = useCountry();
  const [phone, setPhone] = useState(member?.phone ?? `${country.callingCode} `);
  const [email, setEmail] = useState(member?.email ?? "");
  const [gender, setGender] = useState<Member["gender"] | undefined>(member?.gender);
  const [birthMonth, setBirthMonth] = useState(member?.birthMonth ? String(member.birthMonth) : "");
  const [birthDay, setBirthDay] = useState(member?.birthDay ? String(member.birthDay) : "");
  const [birthYear, setBirthYear] = useState(member?.birthYear ? String(member.birthYear) : "");
  const [address, setAddress] = useState(member?.address ?? "");
  const [status, setStatus] = useState<MemberStatus>(member?.status ?? "active");
  const [category, setCategory] = useState<MemberCategory | null | undefined>(member?.category);
  const [categoryOther, setCategoryOther] = useState(member?.categoryOther ?? "");
  const [joinDate, setJoinDate] = useState(member?.joinDate ?? "");
  const [householdId, setHouseholdId] = useState(member?.householdId ?? "");
  const [cellId, setCellId] = useState(member?.cellId ?? "");
  const [classId, setClassId] = useState(member?.classId ?? "");
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [branchId, setBranchId] = useState(member?.branchId ?? "");
  const [number, setNumber] = useState(member?.number ?? "");
  const [suggesting, setSuggesting] = useState(false);

  const categoryDescription = CATEGORIES.find((c) => c.value === category)?.description;
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateEmailMatch[]>([]);

  async function suggestNumber() {
    setSuggesting(true);
    try {
      setNumber(await nextMemberNumberFn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to suggest a number");
    } finally {
      setSuggesting(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildInput>) =>
      member
        ? updateMemberFn({ data: { id: member.id, ...input } })
        : createMemberFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success(member ? "Member updated" : "Member added");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save member"),
  });

  function buildInput() {
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() === country.callingCode ? undefined : phone || undefined,
      email: email || undefined,
      gender: gender ?? undefined,
      birthMonth: birthMonth ? Number(birthMonth) : undefined,
      birthDay: birthDay ? Number(birthDay) : undefined,
      birthYear: birthYear ? Number(birthYear) : undefined,
      address: address.trim(),
      status,
      // The two legacy values ("new_member"/"convert") only ever exist on
      // records already in the database — the picker below never offers
      // them, so this is only reachable by re-saving an old record
      // unchanged, and the server schema (memberInputSchema) doesn't accept
      // them either. Not reachable on a fresh Postgres-backed org.
      category: (category ?? undefined) as
        | Exclude<MemberCategory, "new_member" | "convert">
        | undefined,
      categoryOther: category === "other" ? categoryOther || undefined : undefined,
      number: canEditNumber ? number.trim() || undefined : (member?.number ?? undefined),
      joinDate: joinDate || undefined,
      householdId: householdId || undefined,
      cellId: cellId || undefined,
      classId: classId || undefined,
      notes: notes || undefined,
      branchId: branchId || undefined,
    };
  }

  async function save() {
    if (saveMutation.isPending) return;
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (Boolean(birthMonth) !== Boolean(birthDay)) {
      toast.error("Enter both a birth month and day, or leave both blank");
      return;
    }
    const input = buildInput();
    if (input.email && input.email !== member?.email) {
      const matches = findEmailMatches(input.email, { memberId: member?.id }, members, users);
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        return;
      }
    }
    try {
      await saveMutation.mutateAsync(input);
    } catch {
      // surfaced via the mutation's onError above
    }
  }

  return (
    <>
      <DuplicateEmailAlert
        open={duplicateMatches.length > 0}
        onOpenChange={(o) => {
          if (!o) setDuplicateMatches([]);
        }}
        matches={duplicateMatches}
        subject="member"
        onContinue={() => {
          setDuplicateMatches([]);
          saveMutation.mutate(buildInput());
        }}
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {member ? "Edit member" : "New member"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" required>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          {canEditNumber && (
            <Field label="Member number">
              <div className="flex gap-2">
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="e.g. 0001"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={suggesting}
                  onClick={suggestNumber}
                >
                  <Hash className="mr-1 h-4 w-4" /> Suggest
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to add this member as unnumbered for now.
              </p>
            </Field>
          )}
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
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
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
            <Select
              value={cellId || "none"}
              onValueChange={(v) => setCellId(v === "none" ? "" : v)}
            >
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
            <Field label="Address" required>
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
          <Button onClick={save} disabled={saveMutation.isPending}>
            {member ? "Save changes" : "Create member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
