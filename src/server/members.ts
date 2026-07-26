import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "./db/client";
import { members, households, cells, classes, branches, users, notifications } from "./db/schema";
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

// Mirrors the display labels in _authenticated.members.tsx (STATUS_LABELS /
// CATEGORIES) — the import template shows these human labels, not the raw
// enum values, so matchEnum needs to recognize both.
const MEMBER_STATUS_LABELS: Record<(typeof memberStatusValues)[number], string> = {
  active: "Active Member",
  inactive: "Inactive Member",
  leader: "Leader",
  deacon: "Deacon",
  elder: "Elder",
  pastor: "Pastor",
  minister: "Minister",
};
const MEMBER_CATEGORY_LABELS: Record<(typeof memberCategoryValues)[number], string> = {
  member: "Member",
  committed: "Committed",
  pastor: "Pastor",
  leader: "Leader",
  new_recruit: "New Recruit",
  new_convert: "New Convert",
  visitor: "Visitor",
  uncommitted: "Uncommitted",
  fellowship_member: "Fellowship Member",
  other: "Other",
};

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
      tx
        .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role })
        .from(users),
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
      await assertNumberAvailable(tx, data.number, data.id);
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
  address: z.string().min(1, "Address is required"),
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

// Shared by createMemberFn/updateMemberFn (assigning a number right in the
// member form) and assignMemberNumberFn (the dedicated "change number"
// action) — a number left blank is always fine, but a non-blank one must be
// unique within the org.
async function assertNumberAvailable(tx: Tx, number: string, excludeId?: string) {
  const clashing = await tx
    .select({ id: members.id })
    .from(members)
    .where(eq(members.number, number));
  if (clashing.some((m) => m.id !== excludeId)) {
    throw new AuthError(`Number ${number} is already assigned to another member`);
  }
}

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
    address: data.address.trim(),
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
      if (data.number) await assertNumberAvailable(tx, data.number);
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
      if (rest.number) await assertNumberAvailable(tx, rest.number, id);
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

// One raw string per template column — every field is optional at the zod
// level because bad data should skip *that row*, not reject the whole
// upload; the handler below applies the real (per-row) validation rules.
const memberImportRowSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  gender: z.string().optional(),
  birthMonth: z.string().optional(),
  birthDay: z.string().optional(),
  birthYear: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  joinDate: z.string().optional(),
  household: z.string().optional(),
  cell: z.string().optional(),
  class: z.string().optional(),
  branch: z.string().optional(),
  notes: z.string().optional(),
  number: z.string().optional(),
});

const importMembersSchema = z.object({
  rows: z.array(memberImportRowSchema).min(1).max(2000),
});

// Case/whitespace-insensitive match against a fixed enum list — template
// values are hand-typed, so "New Recruit" and "new_recruit" should both work.
function matchEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  labels?: Record<T, string>,
): T | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  const direct = allowed.find((v) => v === normalized.replace(/\s+/g, "_"));
  if (direct) return direct;
  if (!labels) return undefined;
  return allowed.find((v) => labels[v].toLowerCase() === normalized);
}

function matchByName<T extends { id: string; name: string }>(
  raw: string | undefined,
  options: T[],
): T | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = raw.trim().toLowerCase();
  return options.find((o) => o.name.trim().toLowerCase() === normalized);
}

export const importMembersFn = createServerFn({ method: "POST" })
  .validator(importMembersSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin" && session.role !== "pastor") {
      throw new AuthError("Only an Admin or Pastor can import members");
    }

    return withTenant(session.organizationId, async (tx) => {
      const [householdRows, cellRows, classRows, branchRows, existingMembers] = await Promise.all([
        tx.select({ id: households.id, name: households.name }).from(households),
        tx.select({ id: cells.id, name: cells.name }).from(cells),
        tx.select({ id: classes.id, name: classes.name }).from(classes),
        tx.select({ id: branches.id, name: branches.name }).from(branches),
        tx.select({ number: members.number }).from(members),
      ]);
      const takenNumbers = new Set(
        existingMembers.map((m) => m.number).filter((n): n is string => !!n),
      );

      const toInsert: (typeof members.$inferInsert)[] = [];
      const skipped: { row: number; reason: string }[] = [];
      const warnings: { row: number; note: string }[] = [];

      data.rows.forEach((raw, i) => {
        const rowNum = i + 2; // header is row 1
        const firstName = raw.firstName?.trim() ?? "";
        const lastName = raw.lastName?.trim() ?? "";
        const address = raw.address?.trim() ?? "";
        if (!firstName || !lastName || !address) {
          skipped.push({
            row: rowNum,
            reason: "First name, last name, and address are all required",
          });
          return;
        }

        const gender = matchEnum(raw.gender, ["male", "female", "other"] as const);
        if (raw.gender?.trim() && !gender) {
          warnings.push({
            row: rowNum,
            note: `Gender "${raw.gender}" not recognized — left blank`,
          });
        }
        const status = matchEnum(raw.status, memberStatusValues, MEMBER_STATUS_LABELS) ?? "active";
        if (
          raw.status?.trim() &&
          !matchEnum(raw.status, memberStatusValues, MEMBER_STATUS_LABELS)
        ) {
          warnings.push({
            row: rowNum,
            note: `Status "${raw.status}" not recognized — set to Active`,
          });
        }
        const category = matchEnum(raw.category, memberCategoryValues, MEMBER_CATEGORY_LABELS);
        if (raw.category?.trim() && !category) {
          warnings.push({
            row: rowNum,
            note: `Category "${raw.category}" not recognized — left blank`,
          });
        }

        const household = matchByName(raw.household, householdRows);
        if (raw.household?.trim() && !household) {
          warnings.push({ row: rowNum, note: `Household "${raw.household}" not found` });
        }
        const cell = matchByName(raw.cell, cellRows);
        if (raw.cell?.trim() && !cell) {
          warnings.push({ row: rowNum, note: `Cell "${raw.cell}" not found` });
        }
        const cls = matchByName(raw.class, classRows);
        if (raw.class?.trim() && !cls) {
          warnings.push({ row: rowNum, note: `Class "${raw.class}" not found` });
        }
        const branch = matchByName(raw.branch, branchRows);
        if (raw.branch?.trim() && !branch) {
          warnings.push({ row: rowNum, note: `Branch "${raw.branch}" not found` });
        }

        let number = raw.number?.trim() || undefined;
        if (number) {
          if (takenNumbers.has(number)) {
            warnings.push({
              row: rowNum,
              note: `Number "${number}" is already in use — left blank`,
            });
            number = undefined;
          } else {
            takenNumbers.add(number);
          }
        }

        let birthMonth = raw.birthMonth ? parseInt(raw.birthMonth, 10) : undefined;
        if (
          birthMonth !== undefined &&
          (!Number.isFinite(birthMonth) || birthMonth < 1 || birthMonth > 12)
        ) {
          warnings.push({
            row: rowNum,
            note: `Birth month "${raw.birthMonth}" is invalid — left blank`,
          });
          birthMonth = undefined;
        }
        let birthDay = raw.birthDay ? parseInt(raw.birthDay, 10) : undefined;
        if (
          birthDay !== undefined &&
          (!Number.isFinite(birthDay) || birthDay < 1 || birthDay > 31)
        ) {
          warnings.push({
            row: rowNum,
            note: `Birth day "${raw.birthDay}" is invalid — left blank`,
          });
          birthDay = undefined;
        }
        let birthYear = raw.birthYear ? parseInt(raw.birthYear, 10) : undefined;
        if (birthYear !== undefined && (!Number.isFinite(birthYear) || birthYear < 1900)) {
          warnings.push({
            row: rowNum,
            note: `Birth year "${raw.birthYear}" is invalid — left blank`,
          });
          birthYear = undefined;
        }

        toInsert.push({
          organizationId: session.organizationId,
          createdBy: session.userId,
          firstName,
          lastName,
          address,
          phone: raw.phone?.trim() || undefined,
          email: raw.email?.trim() || undefined,
          gender,
          birthMonth,
          birthDay,
          birthYear,
          status,
          category,
          number,
          joinDate: raw.joinDate?.trim() || undefined,
          householdId: household?.id,
          cellId: cell?.id,
          classId: cls?.id,
          branchId: branch?.id,
          notes: raw.notes?.trim() || undefined,
        });
      });

      if (toInsert.length > 0) {
        await tx.insert(members).values(toInsert);

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
              message: `${session.fullName} imported ${toInsert.length} member${toInsert.length === 1 ? "" : "s"} from a file`,
            })),
          );
        }
      }

      return { imported: toInsert.length, skipped, warnings };
    });
  });
