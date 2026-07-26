import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "./db/client";
import {
  cells,
  cellMeetings,
  cellAttendance,
  members,
  departments,
  expenses,
  users,
  notifications,
} from "./db/schema";
import { requireSession, AuthError } from "./auth";

// ---- Cells ----

export const listCellsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(cells).orderBy(asc(cells.name)),
  );
});

export const getCellFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const cell = await withTenant(session.organizationId, (tx) =>
      tx.query.cells.findFirst({ where: eq(cells.id, data.id) }),
    );
    if (!cell) throw new AuthError("Cell not found");
    return cell;
  });

const cellFieldsSchema = z.object({
  name: z.string().min(1),
  meetingDay: z.string().optional(),
  meetingLocation: z.string().optional(),
  leaderId: z.string().uuid().optional(),
  description: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createCellFn = createServerFn({ method: "POST" })
  .validator(cellFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [cell] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(cells)
        .values({ organizationId: session.organizationId, ...data })
        .returning(),
    );
    return cell;
  });

export const updateCellFn = createServerFn({ method: "POST" })
  .validator(cellFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [cell] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(cells)
        .set({ ...rest, leaderId: rest.leaderId ?? null })
        .where(eq(cells.id, id))
        .returning(),
    );
    if (!cell) throw new AuthError("Cell not found");
    return cell;
  });

// cellMeetings.cellId is onDelete: "cascade" and members.cellId is
// onDelete: "set null" (schema.ts) — meetings/attendance are removed and
// members un-linked automatically, no manual cascade needed.
export const deleteCellFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) => tx.delete(cells).where(eq(cells.id, data.id)));
    return { ok: true };
  });

export const setCellMembershipFn = createServerFn({ method: "POST" })
  .validator(z.object({ memberId: z.string().uuid(), cellId: z.string().uuid().nullable() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.update(members).set({ cellId: data.cellId }).where(eq(members.id, data.memberId)),
    );
    return { ok: true };
  });

// ---- Cell meetings ----

export const listCellMeetingsFn = createServerFn({ method: "GET" })
  .validator(z.object({ cellId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      tx
        .select()
        .from(cellMeetings)
        .where(eq(cellMeetings.cellId, data.cellId))
        .orderBy(desc(cellMeetings.date)),
    );
  });

// Org-wide, for Cell Reports / Dashboard / Reports aggregation.
export const listAllCellMeetingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(cellMeetings).orderBy(desc(cellMeetings.date)),
  );
});

// Reference number format: DDMMYYYY + a 2-digit sequence for that date —
// generated once, at submission time, never changes afterward.
async function generateReportRef(tx: Tx, date: string): Promise<string> {
  const [y, m, d] = date.split("-");
  const prefix = `${d}${m}${y}`;
  const existing = await tx
    .select({ reportRef: cellMeetings.reportRef })
    .from(cellMeetings)
    .where(ilike(cellMeetings.reportRef, `${prefix}%`));
  return `${prefix}${String(existing.length + 1).padStart(2, "0")}`;
}

const meetingFieldsSchema = z.object({
  cellId: z.string().uuid(),
  date: z.string(),
  topic: z.string().optional(),
  notes: z.string().optional(),
  offertoryReported: z.number().int().min(0),
  expenseClaimed: z.number().int().positive().optional(),
  expenseDescription: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createCellMeetingFn = createServerFn({ method: "POST" })
  .validator(meetingFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const meeting = await withTenant(session.organizationId, async (tx) => {
      const reportRef = await generateReportRef(tx, data.date);
      const [meeting] = await tx
        .insert(cellMeetings)
        .values({
          organizationId: session.organizationId,
          ...data,
          reportRef,
          expenseStatus: data.expenseClaimed ? "pending" : "none",
        })
        .returning();
      const cell = await tx.query.cells.findFirst({ where: eq(cells.id, data.cellId) });

      const orgUsers = await tx
        .select({ id: users.id, role: users.role, financeTier: users.financeTier })
        .from(users);
      const recipients = orgUsers
        .filter(
          (u) =>
            u.role === "admin" ||
            u.role === "pastor" ||
            u.role === "treasurer" ||
            ((u.role === "leader" || u.role === "cell_leader") && u.financeTier === "A"),
        )
        .map((u) => u.id);
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((recipientUserId) => ({
            organizationId: session.organizationId,
            recipientUserId,
            type: "cell_report_submitted" as const,
            message: `${cell?.name ?? "A cell"} entered a report`,
            entityType: "cell",
            entityId: data.cellId,
          })),
        );
      }
      return meeting;
    });
    return meeting;
  });

export const updateCellMeetingFn = createServerFn({ method: "POST" })
  .validator(meetingFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [existing] = await withTenant(session.organizationId, (tx) =>
      tx.select().from(cellMeetings).where(eq(cellMeetings.id, id)),
    );
    if (!existing) throw new AuthError("Meeting not found");

    // An already-Treasurer-approved expense claim is locked — edit/delete
    // it from the Expenses page instead, same rule as before. Otherwise, if
    // the claim amount/description changed, it resets to a fresh "pending"
    // claim needing approval again (or "none" if cleared to 0).
    const expenseApproved = existing.expenseStatus === "approved";
    const claimChanged =
      !expenseApproved &&
      (rest.expenseClaimed !== (existing.expenseClaimed ?? undefined) ||
        rest.expenseDescription !== (existing.expenseDescription ?? undefined));

    const [meeting] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(cellMeetings)
        .set({
          cellId: rest.cellId,
          date: rest.date,
          topic: rest.topic,
          notes: rest.notes,
          offertoryReported: rest.offertoryReported,
          branchId: rest.branchId,
          editRequestStatus: "none",
          expenseClaimed: expenseApproved ? existing.expenseClaimed : (rest.expenseClaimed ?? null),
          expenseDescription: expenseApproved
            ? existing.expenseDescription
            : (rest.expenseDescription ?? null),
          expenseStatus: expenseApproved
            ? existing.expenseStatus
            : claimChanged
              ? rest.expenseClaimed
                ? "pending"
                : "none"
              : existing.expenseStatus,
          expenseApproved: expenseApproved
            ? existing.expenseApproved
            : claimChanged
              ? null
              : existing.expenseApproved,
          expenseId: expenseApproved
            ? existing.expenseId
            : claimChanged
              ? null
              : existing.expenseId,
        })
        .where(eq(cellMeetings.id, id))
        .returning(),
    );
    return meeting;
  });

export const deleteCellMeetingFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(cellMeetings).where(eq(cellMeetings.id, data.id)),
    );
    return { ok: true };
  });

export const requestMeetingEditFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(cellMeetings)
        .set({ editRequestStatus: "requested" })
        .where(eq(cellMeetings.id, data.id)),
    );
    return { ok: true };
  });

export const approveMeetingEditFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(cellMeetings)
        .set({ editRequestStatus: "approved" })
        .where(eq(cellMeetings.id, data.id)),
    );
    return { ok: true };
  });

export const recordOffertoryReceivedFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), amount: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(cellMeetings)
        .set({ offertoryReceived: data.amount })
        .where(eq(cellMeetings.id, data.id)),
    );
    return { ok: true };
  });

// Matches the cell term's own default plural ("Cell Fellowships") so the
// department name reads naturally as "in charge of the Cell Fellowships."
const CELL_FELLOWSHIPS_DEPARTMENT_NAME = "Cell Fellowships";

// Idempotent, case-insensitive — safe to call repeatedly (e.g. once per
// session, and again defensively before posting an approved cell expense).
async function ensureCellFellowshipsDepartment(tx: Tx, organizationId: string) {
  const existing = await tx.query.departments.findFirst({
    where: eq(departments.name, CELL_FELLOWSHIPS_DEPARTMENT_NAME),
  });
  if (existing) return existing;
  const [department] = await tx
    .insert(departments)
    .values({ organizationId, name: CELL_FELLOWSHIPS_DEPARTMENT_NAME, allowedModules: [] })
    .returning();
  return department;
}

export const ensureCellFellowshipsDepartmentFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      ensureCellFellowshipsDepartment(tx, session.organizationId),
    );
  },
);

export const approveCellExpenseFn = createServerFn({ method: "POST" })
  .validator(z.object({ meetingId: z.string().uuid(), amount: z.number().int().min(0) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, async (tx) => {
      const meeting = await tx.query.cellMeetings.findFirst({
        where: eq(cellMeetings.id, data.meetingId),
      });
      if (!meeting) throw new AuthError("Meeting not found");
      const cell = await tx.query.cells.findFirst({ where: eq(cells.id, meeting.cellId) });
      const department = await ensureCellFellowshipsDepartment(tx, session.organizationId);

      const [expense] = await tx
        .insert(expenses)
        .values({
          organizationId: session.organizationId,
          departmentId: department.id,
          amount: data.amount,
          description: `${cell?.name ?? "Cell"} — ${meeting.reportRef} — ${meeting.expenseDescription ?? "Cell expense"}`,
          enteredBy: session.userId,
          branchId: meeting.branchId,
        })
        .returning();

      await tx
        .update(cellMeetings)
        .set({ expenseApproved: data.amount, expenseStatus: "approved", expenseId: expense.id })
        .where(eq(cellMeetings.id, data.meetingId));

      const orgUsers = await tx
        .select({ id: users.id, role: users.role, financeTier: users.financeTier })
        .from(users);
      const recipients = new Set(
        orgUsers
          .filter(
            (u) =>
              u.role === "admin" ||
              u.role === "pastor" ||
              u.role === "treasurer" ||
              ((u.role === "leader" || u.role === "cell_leader") && u.financeTier === "A"),
          )
          .map((u) => u.id),
      );
      if (cell?.leaderId) recipients.add(cell.leaderId);
      if (recipients.size > 0) {
        await tx.insert(notifications).values(
          [...recipients].map((recipientUserId) => ({
            organizationId: session.organizationId,
            recipientUserId,
            type: "cell_expense_approved" as const,
            message: `${cell?.name ?? "A cell"}'s reported expense was approved and posted to Expenses`,
            entityType: "cell",
            entityId: meeting.cellId,
          })),
        );
      }
    });
    return { ok: true };
  });

export const rejectCellExpenseFn = createServerFn({ method: "POST" })
  .validator(z.object({ meetingId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(cellMeetings)
        .set({ expenseStatus: "rejected" })
        .where(eq(cellMeetings.id, data.meetingId)),
    );
    return { ok: true };
  });

// ---- Cell attendance ----

export const listCellAttendanceFn = createServerFn({ method: "GET" })
  .validator(z.object({ meetingId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      tx.select().from(cellAttendance).where(eq(cellAttendance.meetingId, data.meetingId)),
    );
  });

// Org-wide, for Dashboard/Reports aggregation.
export const listAllCellAttendanceFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) => tx.select().from(cellAttendance));
});

export const setCellAttendanceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ meetingId: z.string().uuid(), memberId: z.string().uuid(), present: z.boolean() }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .insert(cellAttendance)
        .values({
          organizationId: session.organizationId,
          meetingId: data.meetingId,
          memberId: data.memberId,
          present: data.present,
        })
        .onConflictDoUpdate({
          target: [cellAttendance.meetingId, cellAttendance.memberId],
          set: { present: data.present },
        }),
    );
    return { ok: true };
  });

export const addGuestAttendanceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      meetingId: z.string().uuid(),
      guestName: z.string().min(1),
      guestPhone: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [record] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(cellAttendance)
        .values({
          organizationId: session.organizationId,
          meetingId: data.meetingId,
          guestName: data.guestName,
          guestPhone: data.guestPhone,
          present: true,
        })
        .returning(),
    );
    return record;
  });

export const removeGuestAttendanceFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .delete(cellAttendance)
        .where(and(eq(cellAttendance.id, data.id), isNull(cellAttendance.memberId))),
    );
    return { ok: true };
  });
