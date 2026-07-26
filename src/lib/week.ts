import { useQuery } from "@tanstack/react-query";
import { listSettingsFn, setSettingFn } from "@/server/settings";

// Matches the existing hardcoded weekStartsOn: 1 in _authenticated.projects.tsx
// (kept as-is there, out of scope for this setting) — Monday stays the
// default until an admin changes it, so nothing shifts silently.
export const DEFAULT_WEEK_START_DAY = 1;

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const WEEK_START_DAY_KEY = "weekStartDay";

export function useWeekStartDay(): number {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => listSettingsFn() });
  const raw = data?.[WEEK_START_DAY_KEY];
  const parsed = raw ? Number(raw) : DEFAULT_WEEK_START_DAY;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : DEFAULT_WEEK_START_DAY;
}

export async function setWeekStartDay(day: number): Promise<void> {
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error("Invalid weekday");
  }
  await setSettingFn({ data: { key: WEEK_START_DAY_KEY, value: String(day) } });
}
