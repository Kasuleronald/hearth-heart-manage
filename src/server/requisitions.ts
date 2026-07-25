import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { requisitions, departments, users, notifications } from "./db/schema";
import { requireSession, AuthError } from "./auth";

export const listRequisitionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(requisitions).orderBy(desc(requisitions.createdAt)),
  );
});

const createRequisitionSchema = z.object({
  departmentId: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  branchId: z.string().uuid().optional(),
});

export const createRequisitionFn = createServerFn({ method: "POST" })
  .validator(createRequisitionSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const [requisition] = await tx
        .insert(requisitions)
        .values({
          organizationId: session.organizationId,
          requestedBy: session.userId,
          departmentId: data.departmentId,
          amount: data.amount,
          reason: data.reason.trim(),
          branchId: data.branchId,
        })
        .returning();

      const [department, orgUsers] = await Promise.all([
        tx.query.departments.findFirst({ where: eq(departments.id, data.departmentId) }),
        tx.select({ id: users.id, role: users.role, financeTier: users.financeTier }).from(users),
      ]);
      const recipients = orgUsers
        .filter(
          (u) =>
            u.role === "admin" ||
            u.role === "pastor" ||
            u.role === "treasurer" ||
            ((u.role === "leader" || u.role === "cell_leader") && u.financeTier === "A"),
        )
        .map((u) => u.id)
        .filter((id) => id !== session.userId);
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((recipientUserId) => ({
            organizationId: session.organizationId,
            recipientUserId,
            type: "requisition_submitted" as const,
            message: `${session.fullName} submitted a requisition for ${department?.name ?? "a department"}`,
            entityType: "requisition",
            entityId: requisition.id,
          })),
        );
      }
      return requisition;
    });
  });

const decideRequisitionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export const decideRequisitionFn = createServerFn({ method: "POST" })
  .validator(decideRequisitionSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [requisition] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(requisitions)
        .set({ status: data.status, decidedBy: session.userId, decidedAt: new Date() })
        .where(eq(requisitions.id, data.id))
        .returning(),
    );
    if (!requisition) throw new AuthError("Requisition not found");
    return requisition;
  });
