// Case/whitespace-insensitive "is this already here?" check, used right
// before creating a new named record (Household, Cell, Class, Branch,
// Partner, Project, Department) — a slow network or an accidental double
// click shouldn't silently produce two rows with the same name.
export function findDuplicateByName<T extends { id: string; name: string }>(
  list: T[],
  name: string,
  excludeId?: string,
): T | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return list.find(
    (item) => item.id !== excludeId && item.name.trim().toLowerCase() === normalized,
  );
}
