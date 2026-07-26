import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { givings } from "./db/schema";
import { requireSession, AuthError } from "./auth";

const givingCategoryValues = ["love_offering", "tithe", "first_fruit", "seed", "project"] as const;

export const listGivingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(givings).orderBy(desc(givings.date)),
  );
});

const givingFieldsSchema = z.object({
  memberId: z.string().uuid().optional(),
  partnerId: z.string().uuid().optional(),
  category: z.enum(givingCategoryValues),
  amount: z.number().int().positive(),
  projectId: z.string().uuid().optional(),
  date: z.string(),
  notes: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createGivingFn = createServerFn({ method: "POST" })
  .validator(givingFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [giving] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(givings)
        .values({ organizationId: session.organizationId, createdBy: session.userId, ...data })
        .returning(),
    );
    return giving;
  });

export const updateGivingFn = createServerFn({ method: "POST" })
  .validator(givingFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [giving] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(givings)
        .set({
          ...rest,
          memberId: rest.memberId ?? null,
          partnerId: rest.partnerId ?? null,
          projectId: rest.projectId ?? null,
        })
        .where(eq(givings.id, id))
        .returning(),
    );
    if (!giving) throw new AuthError("Giving not found");
    return giving;
  });

export const deleteGivingFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(givings).where(eq(givings.id, data.id)),
    );
    return { ok: true };
  });
