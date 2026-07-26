import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { households, members } from "./db/schema";
import { requireSession, AuthError } from "./auth";

export const listHouseholdsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(households).orderBy(asc(households.name)),
  );
});

const householdFieldsSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createHouseholdFn = createServerFn({ method: "POST" })
  .validator(householdFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [household] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(households)
        .values({ organizationId: session.organizationId, createdBy: session.userId, ...data })
        .returning(),
    );
    return household;
  });

export const updateHouseholdFn = createServerFn({ method: "POST" })
  .validator(householdFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [household] = await withTenant(session.organizationId, (tx) =>
      tx.update(households).set(rest).where(eq(households.id, id)).returning(),
    );
    if (!household) throw new AuthError("Household not found");
    return household;
  });

// members.householdId is declared onDelete: "set null" (schema.ts), so
// Postgres automatically unlinks members when the household row is
// deleted — this only needs to explicitly clear isHeadOfHousehold first,
// since that flag isn't tied to the FK and would otherwise survive
// pointing at a household that no longer exists.
export const deleteHouseholdFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, async (tx) => {
      await tx
        .update(members)
        .set({ isHeadOfHousehold: false })
        .where(eq(members.householdId, data.id));
      await tx.delete(households).where(eq(households.id, data.id));
    });
    return { ok: true };
  });

// Sets (or clears) which member is head of a household — only one at a
// time, mirroring the original "toggle head" behavior.
export const setHouseholdHeadFn = createServerFn({ method: "POST" })
  .validator(z.object({ householdId: z.string().uuid(), memberId: z.string().uuid().nullable() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, async (tx) => {
      await tx
        .update(members)
        .set({ isHeadOfHousehold: false })
        .where(eq(members.householdId, data.householdId));
      if (data.memberId) {
        await tx
          .update(members)
          .set({ isHeadOfHousehold: true })
          .where(and(eq(members.id, data.memberId), eq(members.householdId, data.householdId)));
      }
    });
    return { ok: true };
  });
