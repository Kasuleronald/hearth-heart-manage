import type {
  Cell,
  CellAttendance,
  CellMeeting,
  ChurchEvent,
  ClassAttendance,
  ClassSession,
  DiscipleshipClass,
  EventAttendance,
  Giving,
  Member,
  MemberCategory,
  Project,
  User,
} from "@/lib/db";

export interface ReportResult {
  chartData: Record<string, string | number>[];
  chartSeries: { key: string; label: string }[];
  tableHeaders: string[];
  tableRows: string[][];
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

// ---- Givings (explicit records + meeting/session/event offertories) ----

export interface GivingEntry {
  date: string;
  category: string; // GivingCategory | "offertory"
  amount: number;
  source: string;
}

export const GIVING_CATEGORY_LABELS: Record<string, string> = {
  love_offering: "Love Offering",
  tithe: "Tithe",
  first_fruit: "First Fruit",
  seed: "Seed",
  project: "Project",
  offertory: "Meeting/Service Offertory",
};

export function collectGivingEntries(data: {
  givings: Giving[];
  cellMeetings: CellMeeting[];
  cells: Cell[];
  classSessions: ClassSession[];
  classes: DiscipleshipClass[];
  events: ChurchEvent[];
  projects?: Project[];
}): GivingEntry[] {
  const projectById = new Map((data.projects ?? []).map((p) => [p.id, p]));
  const entries: GivingEntry[] = data.givings.map((g) => {
    const projectLabel = g.projectId
      ? (projectById.get(g.projectId)?.name ?? g.projectName)
      : g.projectName;
    return {
      date: g.date,
      category: g.category,
      amount: g.amount,
      source:
        g.category === "project" && projectLabel ? `Project: ${projectLabel}` : "Givings record",
    };
  });

  const cellById = new Map(data.cells.map((c) => [c.id, c]));
  for (const m of data.cellMeetings) {
    if (m.offertoryAmount) {
      entries.push({
        date: m.date,
        category: "offertory",
        amount: m.offertoryAmount,
        source: `Cell: ${cellById.get(m.cellId)?.name ?? "Unknown cell"}`,
      });
    }
  }

  const classById = new Map(data.classes.map((c) => [c.id, c]));
  for (const s of data.classSessions) {
    if (s.offertoryAmount) {
      entries.push({
        date: s.date,
        category: "offertory",
        amount: s.offertoryAmount,
        source: `Class: ${classById.get(s.classId)?.name ?? "Unknown class"}`,
      });
    }
  }

  for (const e of data.events) {
    if (e.offertoryAmount) {
      entries.push({
        date: e.date,
        category: "offertory",
        amount: e.offertoryAmount,
        source: `Event: ${e.title}`,
      });
    }
  }

  return entries;
}

export function buildGivingsReport(entries: GivingEntry[], from: string, to: string): ReportResult {
  const filtered = entries.filter((e) => inRange(e.date, from, to));

  const totalsByCategory = Object.keys(GIVING_CATEGORY_LABELS)
    .map((category) => ({
      category,
      total: filtered.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
    }))
    .filter((c) => c.total > 0);

  const chartData = totalsByCategory.map((c) => ({
    name: GIVING_CATEGORY_LABELS[c.category] ?? c.category,
    total: c.total,
  }));

  const tableHeaders = ["Date", "Category", "Source", "Amount (UGX)"];
  const tableRows = [...filtered]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((e) => [
      e.date,
      GIVING_CATEGORY_LABELS[e.category] ?? e.category,
      e.source,
      String(e.amount),
    ]);

  return {
    chartData,
    chartSeries: [{ key: "total", label: "Total (UGX)" }],
    tableHeaders,
    tableRows,
  };
}

// ---- Attendance ----

const CATEGORY_KEYS: (MemberCategory | "uncategorized")[] = [
  "pastor",
  "leader",
  "member",
  "new_member",
  "convert",
  "uncategorized",
];
const CATEGORY_COLUMN_LABELS: Record<string, string> = {
  pastor: "Pastors",
  leader: "Leaders",
  member: "Members",
  new_member: "New Members",
  convert: "Converts",
  uncategorized: "Uncategorized",
};

export function buildAttendanceReport(
  data: {
    events: ChurchEvent[];
    eventAttendance: EventAttendance[];
    cellMeetings: CellMeeting[];
    cellAttendance: CellAttendance[];
    cells: Cell[];
    classSessions: ClassSession[];
    classAttendance: ClassAttendance[];
    classes: DiscipleshipClass[];
    members: Member[];
  },
  from: string,
  to: string,
  cellSingular: string = "Cell",
): ReportResult {
  const memberById = new Map(data.members.map((m) => [m.id, m]));

  function countByCategory(memberIds: string[]) {
    const counts: Record<string, number> = Object.fromEntries(CATEGORY_KEYS.map((c) => [c, 0]));
    for (const id of memberIds) {
      const cat = memberById.get(id)?.category ?? "uncategorized";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }

  interface Occurrence {
    date: string;
    type: string;
    name: string;
    counts: Record<string, number>;
    total: number;
  }
  const occurrences: Occurrence[] = [];

  const cellById = new Map(data.cells.map((c) => [c.id, c]));
  const classById = new Map(data.classes.map((c) => [c.id, c]));

  for (const e of data.events.filter((e) => inRange(e.date, from, to))) {
    const presentIds = data.eventAttendance
      .filter((a) => a.eventId === e.id && a.present)
      .map((a) => a.memberId);
    occurrences.push({
      date: e.date,
      type: "Event",
      name: e.title,
      counts: countByCategory(presentIds),
      total: presentIds.length,
    });
  }
  for (const m of data.cellMeetings.filter((m) => inRange(m.date, from, to))) {
    const presentIds = data.cellAttendance
      .filter((a) => a.meetingId === m.id && a.present)
      .map((a) => a.memberId);
    occurrences.push({
      date: m.date,
      type: `${cellSingular} Meeting`,
      name: cellById.get(m.cellId)?.name ?? `Unknown ${cellSingular.toLowerCase()}`,
      counts: countByCategory(presentIds),
      total: presentIds.length,
    });
  }
  for (const s of data.classSessions.filter((s) => inRange(s.date, from, to))) {
    const presentIds = data.classAttendance
      .filter((a) => a.sessionId === s.id && a.present)
      .map((a) => a.memberId);
    occurrences.push({
      date: s.date,
      type: "Discipleship Class",
      name: classById.get(s.classId)?.name ?? "Unknown class",
      counts: countByCategory(presentIds),
      total: presentIds.length,
    });
  }

  occurrences.sort((a, b) => (a.date < b.date ? -1 : 1));

  const byMonth = new Map<string, number>();
  for (const o of occurrences) {
    const month = o.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + o.total);
  }
  const chartData = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, total]) => ({ name: month, total }));

  const tableHeaders = [
    "Date",
    "Type",
    "Activity",
    ...CATEGORY_KEYS.map((c) => CATEGORY_COLUMN_LABELS[c]),
    "Total Present",
  ];
  const tableRows = occurrences.map((o) => [
    o.date,
    o.type,
    o.name,
    ...CATEGORY_KEYS.map((c) => String(o.counts[c] ?? 0)),
    String(o.total),
  ]);

  return {
    chartData,
    chartSeries: [{ key: "total", label: "Total present" }],
    tableHeaders,
    tableRows,
  };
}

// ---- Membership & growth ----

export function buildMembershipReport(
  members: Member[],
  users: Pick<User, "id" | "fullName">[],
  from: string,
  to: string,
): ReportResult {
  const userById = new Map(users.map((u) => [u.id, u.fullName]));
  const newInRange = [...members]
    .filter((m) => m.joinDate && inRange(m.joinDate, from, to))
    .sort((a, b) => (a.joinDate! < b.joinDate! ? 1 : -1));

  const byMonth = new Map<string, number>();
  for (const m of newInRange) {
    const month = m.joinDate!.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const chartData = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, count]) => ({ name: month, newMembers: count }));

  const tableHeaders = ["Name", "Status", "Category", "Join Date", "Added By"];
  const tableRows = newInRange.map((m) => [
    `${m.firstName} ${m.lastName}`,
    m.status,
    m.category ? (CATEGORY_COLUMN_LABELS[m.category] ?? m.category) : "—",
    m.joinDate!,
    m.createdBy ? (userById.get(m.createdBy) ?? "Unknown") : "—",
  ]);

  return {
    chartData,
    chartSeries: [{ key: "newMembers", label: "New members" }],
    tableHeaders,
    tableRows,
  };
}

// ---- Cell & class performance ----

export function buildGroupPerformanceReport(
  data: {
    cells: Cell[];
    cellMeetings: CellMeeting[];
    cellAttendance: CellAttendance[];
    classes: DiscipleshipClass[];
    classSessions: ClassSession[];
    classAttendance: ClassAttendance[];
    members: Member[];
  },
  from: string,
  to: string,
  cellSingular: string = "Cell",
): ReportResult {
  interface GroupRow {
    name: string;
    type: string;
    memberCount: number;
    occurrenceCount: number;
    avgAttendance: number;
    offertoryTotal: number;
  }
  const rows: GroupRow[] = [];

  for (const cell of data.cells) {
    const memberCount = data.members.filter((m) => m.cellId === cell.id).length;
    const meetings = data.cellMeetings.filter(
      (m) => m.cellId === cell.id && inRange(m.date, from, to),
    );
    const offertoryTotal = meetings.reduce((sum, m) => sum + (m.offertoryAmount ?? 0), 0);
    const meetingIds = new Set(meetings.map((m) => m.id));
    const presentCount = data.cellAttendance.filter(
      (a) => meetingIds.has(a.meetingId) && a.present,
    ).length;
    rows.push({
      name: cell.name,
      type: cellSingular,
      memberCount,
      occurrenceCount: meetings.length,
      avgAttendance: meetings.length > 0 ? Math.round(presentCount / meetings.length) : 0,
      offertoryTotal,
    });
  }

  for (const cls of data.classes) {
    const memberCount = data.members.filter((m) => m.classId === cls.id).length;
    const sessions = data.classSessions.filter(
      (s) => s.classId === cls.id && inRange(s.date, from, to),
    );
    const offertoryTotal = sessions.reduce((sum, s) => sum + (s.offertoryAmount ?? 0), 0);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const presentCount = data.classAttendance.filter(
      (a) => sessionIds.has(a.sessionId) && a.present,
    ).length;
    rows.push({
      name: cls.name,
      type: "Class",
      memberCount,
      occurrenceCount: sessions.length,
      avgAttendance: sessions.length > 0 ? Math.round(presentCount / sessions.length) : 0,
      offertoryTotal,
    });
  }

  const chartData = rows.map((r) => ({ name: r.name, avgAttendance: r.avgAttendance }));
  const tableHeaders = [
    "Name",
    "Type",
    "Members",
    "Meetings/Sessions",
    "Avg attendance",
    "Offertory total (UGX)",
  ];
  const tableRows = rows.map((r) => [
    r.name,
    r.type,
    String(r.memberCount),
    String(r.occurrenceCount),
    String(r.avgAttendance),
    String(r.offertoryTotal),
  ]);

  return {
    chartData,
    chartSeries: [{ key: "avgAttendance", label: "Avg attendance" }],
    tableHeaders,
    tableRows,
  };
}
