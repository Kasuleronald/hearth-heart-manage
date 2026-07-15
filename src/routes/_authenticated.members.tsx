import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Search, Pencil, Download } from "lucide-react";
import {
  db,
  deleteMemberCascade,
  uid,
  type Member,
  type MemberCategory,
  type MemberStatus,
} from "@/lib/db";
import { downloadCsv } from "@/lib/download";
import { useSession } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/members")({
  component: MembersPage,
});

const STATUSES: MemberStatus[] = ["visitor", "member", "baptized", "inactive"];
const CATEGORIES: { value: MemberCategory; label: string }[] = [
  { value: "pastor", label: "Pastor" },
  { value: "leader", label: "Leader" },
  { value: "member", label: "Member" },
  { value: "new_member", label: "New Member" },
  { value: "convert", label: "Convert" },
];

function MembersPage() {
  const { session } = useSession();
  const { singular: cellSingular } = useCellTerm();
  const members = useLiveQuery(() => db.members.orderBy("lastName").toArray(), []) ?? [];
  const households = useLiveQuery(() => db.households.toArray(), []) ?? [];
  const cells = useLiveQuery(() => db.cells.toArray(), []) ?? [];
  const classes = useLiveQuery(() => db.classes.toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = members.filter((m) => {
    const s = `${m.firstName} ${m.lastName} ${m.phone ?? ""} ${m.email ?? ""}`.toLowerCase();
    if (q && !s.includes(q.toLowerCase())) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Members"
        description="Everyone in your church directory."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const rows = [
                  [
                    "First name",
                    "Last name",
                    "Status",
                    "Phone",
                    "Email",
                    "Household",
                    cellSingular,
                    "Added by",
                  ],
                  ...filtered.map((m) => {
                    const hh = households.find((h) => h.id === m.householdId);
                    const cell = cells.find((c) => c.id === m.cellId);
                    const addedBy = users.find((u) => u.id === m.createdBy);
                    return [
                      m.firstName,
                      m.lastName,
                      m.status,
                      m.phone ?? "",
                      m.email ?? "",
                      hh?.name ?? "",
                      cell?.name ?? "",
                      addedBy?.fullName ?? "",
                    ];
                  }),
                ];
                downloadCsv("members.csv", rows);
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
                  <Plus className="mr-2 h-4 w-4" /> New member
                </Button>
              </DialogTrigger>
              <MemberDialog
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
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Household</TableHead>
                <TableHead>{cellSingular}</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const hh = households.find((h) => h.id === m.householdId);
                const cell = cells.find((c) => c.id === m.cellId);
                const addedBy = users.find((u) => u.id === m.createdBy);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Link to="/members/$id" params={{ id: m.id }} className="hover:underline">
                        {m.firstName} {m.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{hh?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{cell?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {addedBy?.fullName ?? "—"}
                    </TableCell>
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
                        <DeleteButton
                          label={`Delete ${m.firstName} ${m.lastName}`}
                          title={`Delete ${m.firstName} ${m.lastName}?`}
                          description="This also removes their cell and event attendance history. This can't be undone."
                          onConfirm={async () => {
                            try {
                              await deleteMemberCascade(m.id);
                              toast.success("Member deleted");
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Failed to delete member",
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
                    colSpan={7}
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
  const [dob, setDob] = useState(member?.dob ?? "");
  const [address, setAddress] = useState(member?.address ?? "");
  const [status, setStatus] = useState<MemberStatus>(member?.status ?? "visitor");
  const [category, setCategory] = useState<MemberCategory | undefined>(member?.category);
  const [joinDate, setJoinDate] = useState(member?.joinDate ?? "");
  const [householdId, setHouseholdId] = useState(member?.householdId ?? "");
  const [cellId, setCellId] = useState(member?.cellId ?? "");
  const [classId, setClassId] = useState(member?.classId ?? "");
  const [notes, setNotes] = useState(member?.notes ?? "");

  async function save() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Name is required");
      return;
    }
    const data: Member = {
      id: member?.id ?? uid(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone || undefined,
      email: email || undefined,
      gender,
      dob: dob || undefined,
      address: address || undefined,
      status,
      category,
      joinDate: joinDate || undefined,
      householdId: householdId || undefined,
      cellId: cellId || undefined,
      classId: classId || undefined,
      notes: notes || undefined,
      createdBy: member?.createdBy ?? currentUserId,
      createdAt: member?.createdAt ?? Date.now(),
    };
    try {
      await db.members.put(data);
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
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
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
