import type { Member } from "@/lib/db";

const CATEGORY_LABELS: Record<string, string> = {
  pastor: "Pastors",
  leader: "Leaders",
  member: "Members",
  committed: "Committed",
  new_recruit: "New Recruits",
  new_convert: "New Converts",
  visitor: "Visitors",
  uncommitted: "Uncommitted",
  fellowship_member: "Fellowship Members",
  other: "Other",
};
// Older records used these category values; fold them into their modern
// equivalent instead of dropping out of every bucket silently.
const LEGACY_ALIASES: Record<string, string> = {
  new_member: "new_recruit",
  convert: "new_convert",
};
function normalizeCategory(category?: string): string | undefined {
  if (!category) return undefined;
  return LEGACY_ALIASES[category] ?? category;
}

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export function AttendanceBreakdown({
  roster,
  presentIds,
  guestCount = 0,
}: {
  roster: Pick<Member, "id" | "category">[];
  presentIds: Set<string>;
  guestCount?: number;
}) {
  const counts = CATEGORY_ORDER.map((category) => ({
    category,
    count: roster.filter((m) => normalizeCategory(m.category) === category && presentIds.has(m.id))
      .length,
  })).filter((c) => c.count > 0);

  const uncategorized = roster.filter((m) => !m.category && presentIds.has(m.id)).length;
  const total = presentIds.size + guestCount;

  if (total === 0) return null;

  const segments = counts.map(({ category, count }) => `${count} ${CATEGORY_LABELS[category]}`);
  if (uncategorized > 0) segments.push(`${uncategorized} Uncategorized`);
  if (guestCount > 0) segments.push(`${guestCount} Guests`);

  return (
    <p className="text-xs text-muted-foreground">
      {segments.join(" · ")}
      {" — "}
      {total} present
    </p>
  );
}
