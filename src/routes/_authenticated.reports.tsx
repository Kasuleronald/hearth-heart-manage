import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { db } from "@/lib/db";
import { useSession, canAccessGivings } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import {
  buildAttendanceReport,
  buildGivingsReport,
  buildGroupPerformanceReport,
  buildMembershipReport,
  collectGivingEntries,
  type ReportResult,
} from "@/lib/reports";
import { ExportMenu } from "@/components/export-menu";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

const REPORT_TYPES = [
  { value: "attendance", label: "Attendance summary & trends" },
  { value: "givings", label: "Givings summary" },
  { value: "membership", label: "Membership & growth" },
  { value: "performance", label: "Cell & class performance" },
] as const;
type ReportType = (typeof REPORT_TYPES)[number]["value"];

function ReportsPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const { singular: cellSingular } = useCellTerm();
  const [reportType, setReportType] = useState<ReportType>("attendance");
  const [from, setFrom] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session && !canAccessGivings(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const eventAttendance = useLiveQuery(() => db.eventAttendance.toArray(), []) ?? [];
  const cells = useLiveQuery(() => db.cells.toArray(), []) ?? [];
  const cellMeetings = useLiveQuery(() => db.cellMeetings.toArray(), []) ?? [];
  const cellAttendance = useLiveQuery(() => db.cellAttendance.toArray(), []) ?? [];
  const classes = useLiveQuery(() => db.classes.toArray(), []) ?? [];
  const classSessions = useLiveQuery(() => db.classSessions.toArray(), []) ?? [];
  const classAttendance = useLiveQuery(() => db.classAttendance.toArray(), []) ?? [];
  const givings = useLiveQuery(() => db.givings.toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const branches = useLiveQuery(() => db.branches.orderBy("name").toArray(), []) ?? [];
  const effectiveBranch = useEffectiveBranch(session?.branchId);

  // Scope every input to the current branch filter before handing it to the
  // (branch-agnostic) report builders — church-wide records still show
  // everywhere, same rule as every other list page.
  const scopedMembers = members.filter((m) => matchesBranchFilter(effectiveBranch, m.branchId));
  const scopedEvents = events.filter((e) => matchesBranchFilter(effectiveBranch, e.branchId));
  const scopedCells = cells.filter((c) => matchesBranchFilter(effectiveBranch, c.branchId));
  const scopedCellMeetings = cellMeetings.filter((m) =>
    matchesBranchFilter(effectiveBranch, m.branchId),
  );
  const scopedClasses = classes.filter((c) => matchesBranchFilter(effectiveBranch, c.branchId));
  const scopedClassSessions = classSessions.filter((s) =>
    matchesBranchFilter(effectiveBranch, s.branchId),
  );
  const scopedGivings = givings.filter((g) => matchesBranchFilter(effectiveBranch, g.branchId));
  const scopedProjects = projects.filter((p) => matchesBranchFilter(effectiveBranch, p.branchId));

  const report: ReportResult = useMemo(() => {
    switch (reportType) {
      case "attendance":
        return buildAttendanceReport(
          {
            events: scopedEvents,
            eventAttendance,
            cellMeetings: scopedCellMeetings,
            cellAttendance,
            cells: scopedCells,
            classSessions: scopedClassSessions,
            classAttendance,
            classes: scopedClasses,
            members: scopedMembers,
          },
          from,
          to,
          cellSingular,
        );
      case "givings": {
        const entries = collectGivingEntries({
          givings: scopedGivings,
          cellMeetings: scopedCellMeetings,
          cells: scopedCells,
          classSessions: scopedClassSessions,
          classes: scopedClasses,
          events: scopedEvents,
          projects: scopedProjects,
        });
        return buildGivingsReport(entries, from, to);
      }
      case "membership":
        return buildMembershipReport(scopedMembers, users, from, to);
      case "performance":
        return buildGroupPerformanceReport(
          {
            cells: scopedCells,
            cellMeetings: scopedCellMeetings,
            cellAttendance,
            classes: scopedClasses,
            classSessions: scopedClassSessions,
            classAttendance,
            members: scopedMembers,
          },
          from,
          to,
          cellSingular,
        );
    }
  }, [
    reportType,
    from,
    to,
    scopedMembers,
    scopedEvents,
    eventAttendance,
    scopedCellMeetings,
    cellAttendance,
    scopedCells,
    scopedClassSessions,
    classAttendance,
    scopedClasses,
    scopedGivings,
    users,
    cellSingular,
    scopedProjects,
  ]);

  // "Compare totals per branch" dimension: only meaningful in the church-wide
  // ("All branches") view — re-runs the same builder once per branch bucket
  // and reduces each result's chart series to a single headline number.
  const branchBreakdown = useMemo(() => {
    if (effectiveBranch !== "all" || branches.length === 0) return null;
    const buckets = [
      ...branches.map((b) => ({ id: b.id as string | undefined, name: b.name })),
      { id: undefined, name: "Church-wide / unassigned" },
    ];
    function sumSeries(r: ReportResult): number {
      const key = r.chartSeries[0]?.key;
      if (!key) return 0;
      return r.chartData.reduce((sum, d) => sum + (Number(d[key]) || 0), 0);
    }
    return buckets.map(({ id, name }) => {
      const inBucket = (branchId: string | undefined) => (branchId ?? undefined) === id;
      const bMembers = members.filter((m) => inBucket(m.branchId));
      const bEvents = events.filter((e) => inBucket(e.branchId));
      const bCells = cells.filter((c) => inBucket(c.branchId));
      const bCellMeetings = cellMeetings.filter((m) => inBucket(m.branchId));
      const bClasses = classes.filter((c) => inBucket(c.branchId));
      const bClassSessions = classSessions.filter((s) => inBucket(s.branchId));
      const bGivings = givings.filter((g) => inBucket(g.branchId));
      const bProjects = projects.filter((p) => inBucket(p.branchId));

      let r: ReportResult;
      switch (reportType) {
        case "attendance":
          r = buildAttendanceReport(
            {
              events: bEvents,
              eventAttendance,
              cellMeetings: bCellMeetings,
              cellAttendance,
              cells: bCells,
              classSessions: bClassSessions,
              classAttendance,
              classes: bClasses,
              members: bMembers,
            },
            from,
            to,
            cellSingular,
          );
          break;
        case "givings": {
          const entries = collectGivingEntries({
            givings: bGivings,
            cellMeetings: bCellMeetings,
            cells: bCells,
            classSessions: bClassSessions,
            classes: bClasses,
            events: bEvents,
            projects: bProjects,
          });
          r = buildGivingsReport(entries, from, to);
          break;
        }
        case "membership":
          r = buildMembershipReport(bMembers, users, from, to);
          break;
        case "performance":
          r = buildGroupPerformanceReport(
            {
              cells: bCells,
              cellMeetings: bCellMeetings,
              cellAttendance,
              classes: bClasses,
              classSessions: bClassSessions,
              classAttendance,
              members: bMembers,
            },
            from,
            to,
            cellSingular,
          );
          break;
      }
      return { name, total: sumSeries(r), label: r.chartSeries[0]?.label ?? "Total" };
    });
  }, [
    effectiveBranch,
    branches,
    reportType,
    from,
    to,
    members,
    events,
    eventAttendance,
    cells,
    cellMeetings,
    cellAttendance,
    classes,
    classSessions,
    classAttendance,
    givings,
    projects,
    users,
    cellSingular,
  ]);

  if (!session || !canAccessGivings(session.role)) return null;

  const reportLabel =
    reportType === "performance"
      ? `${cellSingular} & class performance`
      : REPORT_TYPES.find((r) => r.value === reportType)!.label;
  const seriesKey = report.chartSeries[0]?.key;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Attendance, givings, membership and group performance — exportable as CSV, XLSX, or PDF."
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>Report</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.value === "performance" ? `${cellSingular} & class performance` : r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="ml-auto">
            <ExportMenu
              filename={`${reportType}-report`}
              title={reportLabel}
              subtitle={`${from} to ${to}`}
              chartElement={chartRef.current}
              headers={report.tableHeaders}
              rows={report.tableRows}
            />
          </div>
        </div>

        <div ref={chartRef} className="h-72 rounded-md border bg-background p-2">
          {report.chartData.length === 0 || !seriesKey ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No data in this date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  fontSize={11}
                  interval={0}
                  angle={-20}
                  height={60}
                  textAnchor="end"
                />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey={seriesKey} fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {branchBreakdown && (
        <Card className="mt-4 p-4">
          <h3 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
            By branch — {branchBreakdown[0]?.label ?? "Total"}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {branchBreakdown.map((b) => (
              <div key={b.name} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{b.name}</div>
                <div className="mt-1 font-display text-lg font-semibold">
                  {b.total.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4 p-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {report.tableHeaders.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.tableRows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((cell, j) => (
                    <TableCell
                      key={j}
                      className={j === 0 ? "font-medium" : "text-muted-foreground"}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {report.tableRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={report.tableHeaders.length}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No data in this date range.
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
