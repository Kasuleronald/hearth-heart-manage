export interface DuplicateEmailMatch {
  kind: "user" | "member";
  id: string;
  name: string;
  detail: string;
}

// Case-insensitive lookup for an email already in use by another User or
// Member — used to prompt "is this the same person?" before saving, rather
// than silently allowing (or bluntly rejecting) a duplicate.
//
// Both `members` and `users` must be the caller's already-fetched real
// (Postgres-backed) lists — this never reads storage itself, so it can't go
// stale the way a locally-cached table could.
export function findEmailMatches(
  email: string,
  exclude: { userId?: string; memberId?: string } = {},
  members: { id: string; firstName: string; lastName: string; email?: string | null }[] = [],
  users: { id: string; fullName: string; email: string; role: string }[] = [],
): DuplicateEmailMatch[] {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const matches: DuplicateEmailMatch[] = [];

  for (const u of users) {
    if (u.id === exclude.userId) continue;
    if (u.email.toLowerCase() === normalized) {
      matches.push({
        kind: "user",
        id: u.id,
        name: u.fullName,
        detail: `user, ${u.role.replace("_", " ")}`,
      });
    }
  }

  for (const m of members) {
    if (m.id === exclude.memberId) continue;
    if (m.email && m.email.toLowerCase() === normalized) {
      matches.push({
        kind: "member",
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        detail: "member",
      });
    }
  }

  return matches;
}
