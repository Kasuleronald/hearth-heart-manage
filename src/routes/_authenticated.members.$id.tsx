import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Hash } from "lucide-react";
import { formatBirthday } from "@/lib/db";
import {
  getMemberFn,
  listMemberFormOptionsFn,
  nextMemberNumberFn,
  assignMemberNumberFn,
} from "@/server/members";
import { useSession, canEditDeleteMembers, canAccessRecordBranch } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "./_authenticated.members";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/members/$id")({
  component: MemberDetail,
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Member not found.</div>
  ),
});

function MemberDetail() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const { singular: cellSingular } = useCellTerm();
  const memberQuery = useQuery({
    queryKey: ["member", id],
    queryFn: () => getMemberFn({ data: { id } }),
    retry: false,
  });
  const optionsQuery = useQuery({
    queryKey: ["member-form-options"],
    queryFn: () => listMemberFormOptionsFn(),
  });

  if (memberQuery.isLoading || optionsQuery.isLoading) return null;
  if (memberQuery.isError || !memberQuery.data) throw notFound();
  const member = memberQuery.data;
  const household = optionsQuery.data?.households.find((h) => h.id === member.householdId);
  const cell = optionsQuery.data?.cells.find((c) => c.id === member.cellId);

  if (session && !canAccessRecordBranch(session.branchId, member.branchId ?? undefined)) {
    throw notFound();
  }

  const canAssignNumber = session ? canEditDeleteMembers(session.role) : false;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/members">
          <ArrowLeft className="mr-1 h-4 w-4" /> All members
        </Link>
      </Button>
      <PageHeader
        title={`${member.firstName} ${member.lastName}`}
        description={member.email || member.phone || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <Hash className="mr-1 h-3 w-3" />
              {member.number ?? "Unnumbered"}
            </Badge>
            <StatusBadge status={member.status} />
            {canAssignNumber && (
              <AssignNumberDialog memberId={member.id} current={member.number ?? undefined} />
            )}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="font-display text-lg font-semibold">Contact</h3>
            <Row label="Phone" value={member.phone} />
            <Row label="Email" value={member.email} />
            <Row label="Address" value={member.address} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="font-display text-lg font-semibold">Personal</h3>
            <Row label="Gender" value={member.gender} className="capitalize" />
            <Row label="Date of birth" value={formatBirthday(member)} />
            <Row
              label="Joined"
              value={member.joinDate ? format(new Date(member.joinDate), "PPP") : undefined}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="font-display text-lg font-semibold">Belonging</h3>
            <Row label="Household" value={household?.name} />
            <Row
              label={cellSingular}
              value={
                cell ? (
                  <Link
                    to="/cells/$id"
                    params={{ id: cell.id }}
                    className="text-primary hover:underline"
                  >
                    {cell.name}
                  </Link>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="font-display text-lg font-semibold">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {member.notes || "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AssignNumberDialog({ memberId, current }: { memberId: string; current?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");

  const assignMutation = useMutation({
    mutationFn: (num: string) => assignMemberNumberFn({ data: { id: memberId, number: num } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Member number assigned");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to assign number"),
  });

  async function openDialog() {
    setNumber(current ?? (await nextMemberNumberFn()));
    setOpen(true);
  }

  function save() {
    const trimmed = number.trim();
    if (!/^\d{3,}$/.test(trimmed)) {
      toast.error("Number must be at least 3 digits");
      return;
    }
    assignMutation.mutate(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={openDialog}>
          <Hash className="mr-1 h-4 w-4" /> {current ? "Change number" : "Assign number"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Assign member number</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Number</Label>
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="001"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Suggested next number, zero-padded to at least 3 digits — accept it or override.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${className ?? ""}`}>{value || "—"}</span>
    </div>
  );
}
