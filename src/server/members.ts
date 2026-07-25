import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { members, households, cells, classes, users, notifications } from "./db/schema";
import { requireSession, AuthError } from "./auth";

const memberStatusValues = [
  "active",
  "inactive",
  "leader",
  "deacon",
  "elder",
  "pastor",
  "minister",
] as const;
const memberCategoryValues = [
  "member",
  "committed",
  "pastor",
  "leader",
  "new_recruit",
  "new_convert",
  "visitor",
  "uncommitted",
  "fellowship_member",
  "other",
] as const;

// ---- Lookups the Members page needs for its relation pickers/columns.
// Lightweight, read-only — full CRUD for these modules is Phase 2+.

export const listMemberFormOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, async (tx) => {
    const [householdRows, cellRows, classRows, userRows] = await Promise.all([
      tx
        .select({ id: households.id, name: households.name })
        .from(households)
        .orderBy(asc(households.name)),
      tx.select({ id: cells.id, name: cells.name }).from(cells).orderBy(asc(cells.name)),
      tx.select({ id: classes.id, name: classes.name }).from(classes).orderBy(asc(classes.name)),
      tx.select({ id: users.id, fullName: users.fullName }).from(users),
    ]);
    return { households: householdRows, cells: cellRows, classes: classRows, users: userRows };
  });
});

export const listMembersFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(members).orderBy(asc(members.lastName)),
  );
});

export const getMemberFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const member = await withTenant(session.organizationId, (tx) =>
      tx.query.members.findFirst({ where: eq(members.id, data.id) }),
    );
    if (!member) throw new AuthError("Member not found");
    return member;
  });

// Highest existing numeric member number + 1, zero-padded to 3 digits —
// just a suggestion; assignMemberNumberFn re-checks uniqueness at save time.
export const nextMemberNumberFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const rows = await withTenant(session.organizationId, (tx) =>
    tx.select({ number: members.number }).from(members),
  );
  const highest = rows.reduce((max, r) => {
    const n = r.number ? parseInt(r.number, 10) : NaN;
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return String(highest + 1).padStart(3, "0");
});

const assignMemberNumberSchema = z.object({
  id: z.string().uuid(),
  number: z.string().regex(/^\d{3,}$/, "Number must be at least 3 digits"),
});

export const assignMemberNumberFn = createServerFn({ method: "POST" })
  .validator(assignMemberNumberSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const clashing = await tx
        .select({ id: members.id })
        .from(members)
        .where(eq(members.number, data.number));
      if (clashing.some((m) => m.id !== data.id)) {
        throw new AuthError(`Number ${data.number} is already assigned to another member`);
      }
      const [member] = await tx
        .update(members)
        .set({ number: data.number })
        .where(eq(members.id, data.id))
        .returning();
      if (!member) throw new AuthError("Member not found");
      return member;
    });
  });

const memberInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(["male", "female", "other"]).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  birthMonth: z.number().int().min(1).max(12).optional(),
  birthDay: z.number().int().min(1).max(31).optional(),
  birthYear: z.number().int().min(1900).optional(),
  address: z.string().optional(),
  status: z.enum(memberStatusValues),
  category: z.enum(memberCategoryValues).optional(),
  categoryOther: z.string().optional(),
  number: z.string().optional(),
  joinDate: z.string().optional(),
  householdId: z.string().uuid().optional().or(z.literal("")),
  cellId: z.string().uuid().optional().or(z.literal("")),
  classId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().optional(),
  branchId: z.string().uuid().optional().or(z.literal("")),
});

function normalizeMemberInput(data: z.infer<typeof memberInputSchema>) {
  return {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    gender: data.gender,
    phone: data.phone || undefined,
    email: data.email || undefined,
    birthMonth: data.birthMonth,
    birthDay: data.birthDay,
    birthYear: data.birthYear,
    address: data.address || undefined,
    status: data.status,
    category: data.category,
    categoryOther: data.category === "other" ? data.categoryOther || undefined : undefined,
    number: data.number || undefined,
    joinDate: data.joinDate || undefined,
    householdId: data.householdId || undefined,
    cellId: data.cellId || undefined,
    classId: data.classId || undefined,
    notes: data.notes || undefined,
    branchId: data.branchId || undefined,
  };
}

export const createMemberFn = createServerFn({ method: "POST" })
  .validator(memberInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const [member] = await tx
        .insert(members)
        .values({
          organizationId: session.organizationId,
          createdBy: session.userId,
          ...normalizeMemberInput(data),
        })
        .returning();
      // Same recipients as the original notifyMemberAdded: admin/pastor,
      // excluding whoever just added the record.
      const roleRows = await tx.select({ id: users.id, role: users.role }).from(users);
      const toNotify = roleRows
        .filter((u) => (u.role === "admin" || u.role === "pastor") && u.id !== session.userId)
        .map((u) => u.id);
      if (toNotify.length > 0) {
        await tx.insert(notifications).values(
          toNotify.map((recipientUserId) => ({
            organizationId: session.organizationId,
            recipientUserId,
            type: "member_added" as const,
            message: `${session.fullName} added a member: ${member.firstName} ${member.lastName}`,
            entityType: "member",
            entityId: member.id,
          })),
        );
      }
      return member;
    });
  });

const updateMemberSchema = memberInputSchema.extend({ id: z.string().uuid() });

export const updateMemberFn = createServerFn({ method: "POST" })
  .validator(updateMemberSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    return withTenant(session.organizationId, async (tx) => {
      const [member] = await tx
        .update(members)
        .set(normalizeMemberInput(rest))
        .where(eq(members.id, id))
        .returning();
      return member;
    });
  });

const deleteMemberSchema = z.object({ id: z.string().uuid(), reason: z.string().min(15) });

// Attendance rows and Giving.memberId are handled automatically by the
// database's own foreign-key rules (cascade-delete attendance, set-null
// givings — see schema.ts), so this doesn't need to hand-roll the original
// deleteMemberCascade()'s manual cleanup steps.
export const deleteMemberFn = createServerFn({ method: "POST" })
  .validator(deleteMemberSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const [member] = await tx.select().from(members).where(eq(members.id, data.id));
      if (!member) return { ok: true as const };
      await tx.delete(members).where(eq(members.id, data.id));

      const pastors = await tx.select({ id: users.id }).from(users).where(eq(users.role, "pastor"));
      const recipients = new Set(pastors.map((p) => p.id));
      if (member.createdBy) recipients.add(member.createdBy);
      recipients.delete(session.userId);
      if (recipients.size > 0) {
        await tx.insert(notifications).values(
          [...recipients].map((recipientUserId) => ({
            organizationId: session.organizationId,
            recipientUserId,
            type: "member_deleted" as const,
            message: `${session.fullName} deleted member ${member.firstName} ${member.lastName}. Reason: ${data.reason}`,
          })),
        );
      }
      return { ok: true as const };
    });
  });
