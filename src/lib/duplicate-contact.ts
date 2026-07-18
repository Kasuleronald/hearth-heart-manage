import { db } from "./db";

export interface DuplicateEmailMatch {
  kind: "user" | "member";
  id: string;
  name: string;
  detail: string;
}

// Case-insensitive lookup for an email already in use by another User or
// Member — used to prompt "is this the same person?" before saving, rather
// than silently allowing (or bluntly rejecting) a duplicate.
export async function findEmailMatches(
  email: string,
  exclude: { userId?: string; memberId?: string } = {},
): Promise<DuplicateEmailMatch[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const matches: DuplicateEmailMatch[] = [];

  const users = await db.users.toArray();
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

  const members = await db.members.toArray();
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
