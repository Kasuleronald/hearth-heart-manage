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

// A cell's running offertory balance: what finance has actually received,
// minus what the cell leader reported, summed across every report. Negative
// = the cell still owes money against what it reported; positive = it has
// brought in more than reported (or made up an earlier shortfall).
export function getCellBalance(
  meetings: Pick<CellMeeting, "offertoryReported" | "offertoryReceived">[],
): number {
  return meetings.reduce(
    (sum, m) => sum + (m.offertoryReceived ?? 0) - (m.offertoryReported ?? 0),
    0,
  );
}
