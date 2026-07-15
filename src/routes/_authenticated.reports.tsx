import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { db } from "@/lib/db";
import { useSession, canAccessGivings } from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import {
  buildAttendanceReport,
  buildGivingsReport,
  buildGroupPerformanceReport,
  buildMembershipReport,
  collectGivingEntries,
  type ReportResult,
} from "@/lib/reports";
import { downloadCsv } from "@/lib/download";
import { downloadXlsx } from "@/lib/export-xlsx";
import { downloadPdf } from "@/lib/export-pdf";
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

  const report: ReportResult = useMemo(() => {
    switch (reportType) {
      case "attendance":
        return buildAttendanceReport(
          {
            events,
            eventAttendance,
            cellMeetings,
            cellAttendance,
            cells,
            classSessions,
            classAttendance,
            classes,
            members,
          },
          from,
          to,
          cellSingular,
        );
      case "givings": {
        const entries = collectGivingEntries({
          givings,
          cellMeetings,
          cells,
          classSessions,
          classes,
          events,
        });
        return buildGivingsReport(entries, from, to);
      }
      case "membership":
        return buildMembershipReport(members, users, from, to);
      case "performance":
        return buildGroupPerformanceReport(
          { cells, cellMeetings, cellAttendance, classes, classSessions, classAttendance, members },
          from,
          to,
          cellSingular,
        );
    }
  }, [
    reportType,
    from,
    to,
    members,
    events,
    eventAttendance,
    cellMeetings,
    cellAttendance,
    cells,
    classSessions,
    classAttendance,
    classes,
    givings,
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
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`${reportType}-report.csv`, [report.tableHeaders, ...report.tableRows])
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadXlsx(
                  `${reportType}-report.xlsx`,
                  reportLabel,
                  report.tableHeaders,
                  report.tableRows,
                )
              }
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" /> XLSX
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadPdf({
                  filename: `${reportType}-report.pdf`,
                  title: reportLabel,
                  subtitle: `${from} to ${to}`,
                  chartElement: chartRef.current,
                  headers: report.tableHeaders,
                  rows: report.tableRows,
                })
              }
            >
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
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
