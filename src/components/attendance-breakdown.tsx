import type { Member, MemberCategory } from "@/lib/db";

const CATEGORY_LABELS: Record<MemberCategory, string> = {
  pastor: "Pastors",
  leader: "Leaders",
  member: "Members",
  new_member: "New Members",
  convert: "Converts",
};

const CATEGORY_ORDER: MemberCategory[] = ["pastor", "leader", "member", "new_member", "convert"];

export function AttendanceBreakdown({
  roster,
  presentIds,
}: {
  roster: Pick<Member, "id" | "category">[];
  presentIds: Set<string>;
}) {
  const counts = CATEGORY_ORDER.map((category) => ({
    category,
    count: roster.filter((m) => m.category === category && presentIds.has(m.id)).length,
  })).filter((c) => c.count > 0);

  const uncategorized = roster.filter((m) => !m.category && presentIds.has(m.id)).length;
  const total = presentIds.size;

  if (total === 0) return null;

  return (
    <p className="text-xs text-muted-foreground">
      {counts.map(({ category, count }) => `${count} ${CATEGORY_LABELS[category]}`).join(" · ")}
      {uncategorized > 0 &&
        (counts.length > 0
          ? ` · ${uncategorized} Uncategorized`
          : `${uncategorized} Uncategorized`)}
      {" — "}
      {total} present
    </p>
  );
}
