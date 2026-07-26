import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { settings } from "./db/schema";
import { requireSession } from "./auth";

export const listSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const rows = await withTenant(session.organizationId, (tx) =>
    tx.select().from(settings).where(eq(settings.organizationId, session.organizationId)),
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
});

const setSettingSchema = z.object({ key: z.string().min(1), value: z.string() });

export const setSettingFn = createServerFn({ method: "POST" })
  .validator(setSettingSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .insert(settings)
        .values({ organizationId: session.organizationId, key: data.key, value: data.value })
        .onConflictDoUpdate({
          target: [settings.organizationId, settings.key],
          set: { value: data.value },
        }),
    );
    return { ok: true };
  });
