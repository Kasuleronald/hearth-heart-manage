import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { partners } from "./db/schema";
import { requireSession, AuthError } from "./auth";

export const listPartnersFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(partners).orderBy(asc(partners.name)),
  );
});

const partnerFieldsSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["individual", "organization", "church"]).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  pledgeAmount: z.number().int().optional(),
  notes: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createPartnerFn = createServerFn({ method: "POST" })
  .validator(partnerFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [partner] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(partners)
        .values({ organizationId: session.organizationId, createdBy: session.userId, ...data })
        .returning(),
    );
    return partner;
  });

export const updatePartnerFn = createServerFn({ method: "POST" })
  .validator(partnerFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [partner] = await withTenant(session.organizationId, (tx) =>
      tx.update(partners).set(rest).where(eq(partners.id, id)).returning(),
    );
    if (!partner) throw new AuthError("Partner not found");
    return partner;
  });

// givings.partnerId is onDelete: "set null" (schema.ts) — any recorded
// giving against this partner is kept, just unlinked, same as before.
export const deletePartnerFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(partners).where(eq(partners.id, data.id)),
    );
    return { ok: true };
  });
