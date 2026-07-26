import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { branches } from "./db/schema";
import { requireSession, AuthError } from "./auth";

export const listBranchesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(branches).orderBy(asc(branches.name)),
  );
});

const branchFieldsSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  leadPastorId: z.string().uuid().optional(),
  startDate: z.string().optional(),
});

export const createBranchFn = createServerFn({ method: "POST" })
  .validator(branchFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [branch] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(branches)
        .values({ organizationId: session.organizationId, ...data })
        .returning(),
    );
    return branch;
  });

export const updateBranchFn = createServerFn({ method: "POST" })
  .validator(branchFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [branch] = await withTenant(session.organizationId, (tx) =>
      tx.update(branches).set(rest).where(eq(branches.id, id)).returning(),
    );
    if (!branch) throw new AuthError("Branch not found");
    return branch;
  });

// Every tenant table with a branchId column has it declared
// onDelete: "set null" (see schema.ts) — Postgres automatically un-scopes
// every record tied to this branch when the row is deleted, no manual
// cascade needed (unlike the old Dexie version, which had to walk every
// table by hand since IndexedDB has no FK constraints).
export const deleteBranchFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(branches).where(eq(branches.id, data.id)),
    );
    return { ok: true };
  });
