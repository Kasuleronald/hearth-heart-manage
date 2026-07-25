// Pure display helpers shared by Member UI — deliberately no dependency on
// src/lib/db.ts (Dexie), so migrated modules don't drag in an unused local
// IndexedDB instance. Mirrors src/lib/db.ts's formatBirthday()/MONTH_NAMES
// exactly; once every module is migrated and db.ts is retired, this becomes
// the sole copy.
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatBirthday(m: {
  birthMonth?: number | null;
  birthDay?: number | null;
  birthYear?: number | null;
}): string | undefined {
  if (!m.birthMonth || !m.birthDay) return undefined;
  const monthName = MONTH_NAMES[m.birthMonth - 1];
  return m.birthYear ? `${monthName} ${m.birthDay}, ${m.birthYear}` : `${monthName} ${m.birthDay}`;
}
