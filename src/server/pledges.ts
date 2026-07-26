import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "./db/client";
import { pledges, users, notifications } from "./db/schema";
import { requireSession, AuthError } from "./auth";

const PLEDGE_ARCHIVE_GRACE_DAYS = 30;

// No cron in this app — overdue pledges are archived opportunistically,
// the first time anyone loads the list after the grace period passes
// (mirrors the original client-side archiveOverduePledges(), just run
// server-side now so it actually affects the shared database).
async function archiveOverduePledges(tx: Tx, organizationId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PLEDGE_ARCHIVE_GRACE_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const overdue = await tx
    .select()
    .from(pledges)
    .where(and(eq(pledges.status, "active"), lt(pledges.collectionDate, cutoffStr)));
  if (overdue.length === 0) return;

  const orgUsers = await tx.select({ id: users.id, role: users.role }).from(users);
  const pastorsAndAdmins = orgUsers
    .filter((u) => u.role === "pastor" || u.role === "admin")
    .map((u) => u.id);

  for (const pledge of overdue) {
    await tx.update(pledges).set({ status: "archived" }).where(eq(pledges.id, pledge.id));
    const recipients = new Set(pastorsAndAdmins);
    if (pledge.bookedBy) recipients.add(pledge.bookedBy);
    if (recipients.size > 0) {
      await tx.insert(notifications).values(
        [...recipients].map((recipientUserId) => ({
          organizationId,
          recipientUserId,
          type: "pledge_archived" as const,
          message: `Pledge from ${pledge.name} has passed its due date by more than ${PLEDGE_ARCHIVE_GRACE_DAYS} days and was archived.`,
          entityType: "pledge",
          entityId: pledge.id,
        })),
      );
    }
  }
}

export const listPledgesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, async (tx) => {
    await archiveOverduePledges(tx, session.organizationId);
    return tx.select().from(pledges).orderBy(asc(pledges.collectionDate));
  });
});

const pledgeCauseValues = ["seed", "project"] as const;

const pledgeFieldsSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().positive(),
  collectionDate: z.string(),
  cause: z.enum(pledgeCauseValues),
  projectId: z.string().uuid().optional(),
  description: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createPledgeFn = createServerFn({ method: "POST" })
  .validator(pledgeFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [pledge] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(pledges)
        .values({ organizationId: session.organizationId, bookedBy: session.userId, ...data })
        .returning(),
    );
    return pledge;
  });

export const updatePledgeFn = createServerFn({ method: "POST" })
  .validator(pledgeFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [pledge] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(pledges)
        .set({ ...rest, projectId: rest.projectId ?? null })
        .where(eq(pledges.id, id))
        .returning(),
    );
    if (!pledge) throw new AuthError("Pledge not found");
    return pledge;
  });

export const decidePledgeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["fulfilled", "banned"]) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [pledge] = await withTenant(session.organizationId, (tx) =>
      tx.update(pledges).set({ status: data.status }).where(eq(pledges.id, data.id)).returning(),
    );
    if (!pledge) throw new AuthError("Pledge not found");
    return pledge;
  });

export const restorePledgeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), collectionDate: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [pledge] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(pledges)
        .set({ status: "active", collectionDate: data.collectionDate })
        .where(eq(pledges.id, data.id))
        .returning(),
    );
    if (!pledge) throw new AuthError("Pledge not found");
    return pledge;
  });

export const deletePledgeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(pledges).where(eq(pledges.id, data.id)),
    );
    return { ok: true };
  });
