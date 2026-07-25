import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { expenses, requisitions, departments, users, notifications } from "./db/schema";
import { requireSession, AuthError } from "./auth";

export const listExpensesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(expenses).orderBy(desc(expenses.createdAt)),
  );
});

const expenseInputSchema = z.object({
  departmentId: z.string().uuid(),
  amount: z.number().int().positive(),
  description: z.string().min(1),
  branchId: z.string().uuid().optional(),
});

// Admin/Treasurer entering an expense directly — posts immediately, same as
// before this workflow existed. Gate this at the call site with
// canEnterExpenses(session.role), same as the route already does.
export const createExpenseFn = createServerFn({ method: "POST" })
  .validator(expenseInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      tx
        .insert(expenses)
        .values({
          organizationId: session.organizationId,
          departmentId: data.departmentId,
          amount: data.amount,
          description: data.description.trim(),
          enteredBy: session.userId,
          branchId: data.branchId,
          status: "approved",
        })
        .returning()
        .then((rows) => rows[0]),
    );
  });

const updateExpenseSchema = expenseInputSchema.extend({ id: z.string().uuid() });

export const updateExpenseFn = createServerFn({ method: "POST" })
  .validator(updateExpenseSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [expense] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(expenses)
        .set({
          departmentId: data.departmentId,
          amount: data.amount,
          description: data.description.trim(),
          branchId: data.branchId,
        })
        .where(eq(expenses.id, data.id))
        .returning(),
    );
    if (!expense) throw new AuthError("Expense not found");
    return expense;
  });

const expenseIdSchema = z.object({ id: z.string().uuid() });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .validator(expenseIdSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(expenses).where(eq(expenses.id, data.id)),
    );
    return { ok: true as const };
  });

// Approved requisitions the caller booked, that don't have an accountability
// Expense against them yet — populates the "Submit accountability" picker.
export const listMyAccountableRequisitionsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const approved = await tx
        .select()
        .from(requisitions)
        .where(
          and(eq(requisitions.requestedBy, session.userId), eq(requisitions.status, "approved")),
        );
      if (approved.length === 0) return [];
      const accounted = await tx
        .select({ requisitionId: expenses.requisitionId })
        .from(expenses)
        .where(isNotNull(expenses.requisitionId));
      const accountedIds = new Set(accounted.map((r) => r.requisitionId).filter(Boolean));
      return approved.filter((r) => !accountedIds.has(r.id));
    });
  },
);

const submitAccountabilitySchema = z.object({
  requisitionId: z.string().uuid(),
  amount: z.number().int().positive(),
  description: z.string().min(1),
});

// A department leader's "here's what I spent the approved requisition on"
// submission — starts "pending" and doesn't count toward department totals
// until Finance approves it (decideExpenseFn below).
export const submitAccountabilityExpenseFn = createServerFn({ method: "POST" })
  .validator(submitAccountabilitySchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const requisition = await tx.query.requisitions.findFirst({
        where: eq(requisitions.id, data.requisitionId),
      });
      if (!requisition) throw new AuthError("Requisition not found");
      if (requisition.requestedBy !== session.userId) {
        throw new AuthError("You can only account for a requisition you booked");
      }
      if (requisition.status !== "approved") {
        throw new AuthError("This requisition hasn't been approved yet");
      }
      const existing = await tx.query.expenses.findFirst({
        where: eq(expenses.requisitionId, data.requisitionId),
      });
      if (existing) throw new AuthError("Accountability has already been submitted for this");

      const [expense] = await tx
        .insert(expenses)
        .values({
          organizationId: session.organizationId,
          departmentId: requisition.departmentId,
          amount: data.amount,
          description: data.description.trim(),
          enteredBy: session.userId,
          requisitionId: data.requisitionId,
          status: "pending",
        })
        .returning();

      const [department, orgUsers] = await Promise.all([
        tx.query.departments.findFirst({ where: eq(departments.id, requisition.departmentId) }),
        tx.select({ id: users.id, role: users.role }).from(users),
      ]);
      const recipients = orgUsers
        .filter((u) => u.role === "admin" || u.role === "pastor" || u.role === "treasurer")
        .map((u) => u.id)
        .filter((id) => id !== session.userId);
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((recipientUserId) => ({
            organizationId: session.organizationId,
            recipientUserId,
            type: "expense_submitted" as const,
            message: `${session.fullName} submitted accountability for ${department?.name ?? "a department"}`,
            entityType: "expense",
            entityId: expense.id,
          })),
        );
      }
      return expense;
    });
  });

const decideExpenseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  amount: z.number().int().positive().optional(), // lets Finance adjust the approved amount
});

export const decideExpenseFn = createServerFn({ method: "POST" })
  .validator(decideExpenseSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const [expense] = await tx
        .update(expenses)
        .set({
          status: data.status,
          amount: data.status === "approved" && data.amount ? data.amount : undefined,
          approvedBy: session.userId,
          approvedAt: new Date(),
        })
        .where(eq(expenses.id, data.id))
        .returning();
      if (!expense) throw new AuthError("Expense not found");

      if (data.status === "approved" && expense.enteredBy && expense.enteredBy !== session.userId) {
        const department = await tx.query.departments.findFirst({
          where: eq(departments.id, expense.departmentId),
        });
        await tx.insert(notifications).values({
          organizationId: session.organizationId,
          recipientUserId: expense.enteredBy,
          type: "expense_approved",
          message: `${session.fullName} approved your accountability for ${department?.name ?? "a department"}`,
          entityType: "expense",
          entityId: expense.id,
        });
      }
      return expense;
    });
  });
