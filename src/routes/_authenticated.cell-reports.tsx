import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { Search, ClipboardList } from "lucide-react";
import { db, type CellMeeting } from "@/lib/db";
import { getRunningBalances } from "@/lib/finance";
import { useSession, canRecordOffertoryReceived, canToggleCurrency } from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { useCellTerm } from "@/lib/terminology";
import { CurrencyToggle } from "@/components/currency-toggle";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/cell-reports")({
  component: CellReportsPage,
});

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "full", label: "Fully received" },
  { value: "deficit", label: "Deficit" },
  { value: "credit", label: "Credit" },
  { value: "edit_requested", label: "Edit requested" },
] as const;

function matchesStatus(m: CellMeeting, status: string): boolean {
  switch (status) {
    case "edit_requested":
      return m.editRequestStatus === "requested";
    case "full":
      return m.offertoryReceived === m.offertoryReported;
    case "deficit":
      return m.offertoryReceived < m.offertoryReported;
    case "credit":
      return m.offertoryReceived > m.offertoryReported;
    default:
      return true;
  }
}

const EDIT_STATUS_STYLE: Record<string, string> = {
  requested: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
};

function CellReportsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const { singular: cellSingular } = useCellTerm();
  const canView = session
    ? canRecordOffertoryReceived(session.role, session.financeTier) || session.role === "pastor"
    : false;

  const meetings = useLiveQuery(() => db.cellMeetings.toArray(), []) ?? [];
  const cells = useLiveQuery(() => db.cells.orderBy("name").toArray(), []) ?? [];
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  const [refSearch, setRefSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cellFilter, setCellFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (session && !canView) navigate({ to: "/dashboard", replace: true });
  }, [session, canView, navigate]);

  if (!session || !canView) return null;

  function cellName(id: string): string {
    return cells.find((c) => c.id === id)?.name ?? `Unknown ${cellSingular.toLowerCase()}`;
  }

  const runningBalances = getRunningBalances(meetings);

  const filtered = meetings
    .filter((m) => matchesBranchFilter(effectiveBranch, m.branchId))
    .filter((m) => (cellFilter === "all" ? true : m.cellId === cellFilter))
    .filter((m) => matchesStatus(m, statusFilter))
    .filter((m) =>
      refSearch.trim() ? m.reportRef.toLowerCase().includes(refSearch.trim().toLowerCase()) : true,
    )
    .filter((m) => (dateFrom ? m.date >= dateFrom : true))
    .filter((m) => (dateTo ? m.date <= dateTo : true))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div>
      <PageHeader
        title="Cell Reports"
        description={`Every ${cellSingular.toLowerCase()} offertory report, across every ${cellSingular.toLowerCase()} — search by reference number, date, or reconciliation status.`}
        actions={canToggle ? <CurrencyToggle baseCode={base.code} /> : undefined}
      />

      <Card className="p-4">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Ref number</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                placeholder="e.g. 2312202601"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{cellSingular}</Label>
            <Select value={cellFilter} onValueChange={setCellFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {cellSingular.toLowerCase()}s</SelectItem>
                {cells.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reconciliation</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>{cellSingular}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Running balance</TableHead>
                <TableHead>Edit status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const running = runningBalances.get(m.id) ?? 0;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.reportRef}</TableCell>
                    <TableCell>
                      <Link
                        to="/cells/$id"
                        params={{ id: m.cellId }}
                        className="text-primary hover:underline"
                      >
                        {cellName(m.cellId)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(m.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{formatAmount(m.offertoryReported)}</TableCell>
                    <TableCell>{formatAmount(m.offertoryReceived)}</TableCell>
                    <TableCell
                      className={
                        running < 0
                          ? "font-medium text-destructive"
                          : running > 0
                            ? "font-medium text-primary"
                            : "text-muted-foreground"
                      }
                    >
                      {formatAmount(running)}
                    </TableCell>
                    <TableCell>
                      {m.editRequestStatus !== "none" && (
                        <Badge
                          variant="outline"
                          className={`capitalize ${EDIT_STATUS_STYLE[m.editRequestStatus] ?? ""}`}
                        >
                          {m.editRequestStatus}
                        </Badge>
                      )}
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
                    <ClipboardList className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                    No reports match these filters.
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
