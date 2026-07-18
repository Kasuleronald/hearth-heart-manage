import { db, type CellMeeting } from "./db";

// Reference number format: DDMMYYYY + a 2-digit sequence for that date
// (e.g. "2312202601" for the first report on 23 Dec 2026). Generated once,
// at submission time, and never changes afterward.
export async function generateReportRef(date: string): Promise<string> {
  const [y, m, d] = date.split("-");
  const prefix = `${d}${m}${y}`;
  const existing = await db.cellMeetings.toArray();
  const countForDate = existing.filter((cm) => cm.reportRef?.startsWith(prefix)).length;
  return `${prefix}${String(countForDate + 1).padStart(2, "0")}`;
}

// A cell's running offertory balance: what finance has actually received
// plus any Treasurer-approved expense, minus what the cell leader reported,
// summed across every report. Negative = the cell still owes money against
// what it reported; positive = it has brought in more than reported (or made
// up an earlier shortfall). A pending/unapproved expense claim doesn't count
// yet — it only closes the gap once the Treasurer approves it.
export function getCellBalance(
  meetings: Pick<CellMeeting, "offertoryReported" | "offertoryReceived" | "expenseApproved">[],
): number {
  return meetings.reduce(
    (sum, m) =>
      sum + (m.offertoryReceived ?? 0) + (m.expenseApproved ?? 0) - (m.offertoryReported ?? 0),
    0,
  );
}

// Per-report running balance, grouped by cell and accumulated in
// chronological order — the same delta math as getCellBalance, just kept as
// a cumulative total as of each individual report rather than one grand
// total. Used by the cross-cell report index (§13) where each row needs to
// show where that cell's balance stood at that point in time.
export function getRunningBalances(
  meetings: Pick<
    CellMeeting,
    | "id"
    | "cellId"
    | "date"
    | "createdAt"
    | "offertoryReported"
    | "offertoryReceived"
    | "expenseApproved"
  >[],
): Map<string, number> {
  const byCell = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const arr = byCell.get(m.cellId) ?? [];
    arr.push(m);
    byCell.set(m.cellId, arr);
  }
  const result = new Map<string, number>();
  for (const cellMeetings of byCell.values()) {
    const sorted = [...cellMeetings].sort((a, b) =>
      a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
    );
    let running = 0;
    for (const m of sorted) {
      running += (m.offertoryReceived ?? 0) + (m.expenseApproved ?? 0) - (m.offertoryReported ?? 0);
      result.set(m.id, running);
    }
  }
  return result;
}
