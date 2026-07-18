import { format } from "date-fns";
import type { EventRecurrence, MonthlyPosition } from "./db";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const MONTHLY_POSITIONS: { value: MonthlyPosition; label: string }[] = [
  { value: "first", label: "First" },
  { value: "second", label: "Second" },
  { value: "third", label: "Third" },
  { value: "fourth", label: "Fourth" },
  { value: "last", label: "Last" },
];

// Safety cap so a mistaken far-future "until" date can't generate an
// unbounded number of rows — this is enough for ~3 years weekly.
const MAX_OCCURRENCES = 156;

export function describeRecurrence(r: EventRecurrence): string {
  const weekday = WEEKDAY_LABELS[r.weekday];
  if (r.frequency === "weekly") return `Every ${weekday}`;
  const position = MONTHLY_POSITIONS.find((p) => p.value === r.monthlyPosition)?.label ?? "";
  return `${position} ${weekday} of the month`;
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  position: MonthlyPosition,
): Date | null {
  if (position === "last") {
    const d = new Date(year, month + 1, 0); // last day of the month
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return d;
  }
  const positionIndex = { first: 0, second: 1, third: 2, fourth: 3 }[position];
  const d = new Date(year, month, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + positionIndex * 7);
  return d.getMonth() === month ? d : null;
}

// Generates every occurrence date (inclusive) from `start` through
// `rule.until`, capped at MAX_OCCURRENCES.
export function generateOccurrenceDates(start: string, rule: EventRecurrence): string[] {
  const startDate = new Date(`${start}T00:00:00`);
  const until = new Date(`${rule.until}T00:00:00`);
  const dates: string[] = [];

  if (rule.frequency === "weekly") {
    const d = new Date(startDate);
    while (d.getDay() !== rule.weekday) d.setDate(d.getDate() + 1);
    while (d <= until && dates.length < MAX_OCCURRENCES) {
      dates.push(format(d, "yyyy-MM-dd"));
      d.setDate(d.getDate() + 7);
    }
    return dates;
  }

  const position = rule.monthlyPosition ?? "first";
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursor <= until && dates.length < MAX_OCCURRENCES) {
    const occurrence = nthWeekdayOfMonth(
      cursor.getFullYear(),
      cursor.getMonth(),
      rule.weekday,
      position,
    );
    if (occurrence && occurrence >= startDate && occurrence <= until) {
      dates.push(format(occurrence, "yyyy-MM-dd"));
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return dates;
}
