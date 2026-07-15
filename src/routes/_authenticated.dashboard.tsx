import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Users2, CalendarDays, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, subDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { session } = useSession();
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const cells = useLiveQuery(() => db.cells.toArray(), []) ?? [];
  const events = useLiveQuery(() => db.events.orderBy("date").reverse().toArray(), []) ?? [];
  const cellMeetings =
    useLiveQuery(() => db.cellMeetings.orderBy("date").reverse().limit(20).toArray(), []) ?? [];
  const attendance = useLiveQuery(() => db.cellAttendance.toArray(), []) ?? [];

  const activeMembers = members.filter((m) => m.status !== "inactive").length;
  const upcoming = events.filter((e) => e.date >= format(new Date(), "yyyy-MM-dd")).length;
  const monthAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const newMembers = members.filter((m) => (m.joinDate ?? "") >= monthAgo).length;

  // avg cell attendance = presents / total across last 4 meetings
  const last4 = cellMeetings.slice(0, 4);
  const presentIds = new Set(
    attendance.filter((a) => a.present).map((a) => a.meetingId + ":" + a.memberId),
  );
  const attRecords = attendance.filter((a) => last4.some((m) => m.id === a.meetingId));
  const avgAtt =
    attRecords.length > 0
      ? Math.round((attRecords.filter((a) => a.present).length / attRecords.length) * 100)
      : 0;

  // chart data: last 8 cell meetings, attendance count
  const chartMeetings = [...cellMeetings].reverse().slice(-8);
  const chartData = chartMeetings.map((m) => {
    const total = attendance.filter((a) => a.meetingId === m.id).length;
    const present = attendance.filter((a) => a.meetingId === m.id && a.present).length;
    const cell = cells.find((c) => c.id === m.cellId);
    return {
      name: `${cell?.name ?? "?"} • ${format(new Date(m.date), "MMM d")}`,
      present,
      total,
    };
  });
  void presentIds;

  return (
    <div>
      <PageHeader
        title={`Peace, ${session?.fullName.split(" ")[0] ?? ""}.`}
        description="Your church at a glance."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Active members" value={activeMembers} sub={`${members.length} total`} />
        <StatCard icon={<Users2 className="h-5 w-5" />} label="Cell fellowships" value={cells.length} sub="active groups" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Cell attendance" value={`${avgAtt}%`} sub="last 4 meetings" />
        <StatCard icon={<CalendarDays className="h-5 w-5" />} label="Upcoming events" value={upcoming} sub={`${newMembers} new members / 30d`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Recent cell attendance</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No cell meetings recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} height={60} textAnchor="end" />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="present" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Upcoming events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.filter((e) => e.date >= format(new Date(), "yyyy-MM-dd")).slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 border-l-2 border-primary/60 pl-3">
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {e.type.replace("_", " ")}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(e.date), "MMM d")}
                </div>
              </div>
            ))}
            {events.filter((e) => e.date >= format(new Date(), "yyyy-MM-dd")).length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary text-primary-foreground shadow-sm">
            {icon}
          </div>
        </div>
        <div className="mt-3 font-display text-3xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
