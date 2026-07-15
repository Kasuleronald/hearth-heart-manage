import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { useCellTerm } from "@/lib/terminology";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./_authenticated.members";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/members/$id")({
  component: MemberDetail,
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Member not found.</div>
  ),
});

function MemberDetail() {
  const { id } = Route.useParams();
  const { singular: cellSingular } = useCellTerm();
  const member = useLiveQuery(() => db.members.get(id), [id]);
  const household = useLiveQuery(
    () => (member?.householdId ? db.households.get(member.householdId) : undefined),
    [member?.householdId],
  );
  const cell = useLiveQuery(
    () => (member?.cellId ? db.cells.get(member.cellId) : undefined),
    [member?.cellId],
  );

  if (member === undefined) return null;
  if (!member) throw notFound();

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
        actions={<StatusBadge status={member.status} />}
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
            <Row
              label="Date of birth"
              value={member.dob ? format(new Date(member.dob), "PPP") : undefined}
            />
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
