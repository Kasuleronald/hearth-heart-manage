import { createServerFn } from "@tanstack/react-start";
import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { testimonies, users, notifications } from "./db/schema";
import { requireSession } from "./auth";

const testimonyCategoryValues = [
  "Salvation",
  "Healing",
  "Financial Liberty",
  "Breakthrough",
  "Employment",
  "Restoration",
  "Spiritual Growth",
  "Academic",
  "Miracle",
  "Other",
] as const;

export const listTestimoniesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(testimonies).orderBy(desc(testimonies.createdAt)),
  );
});

export const createTestimonyFn = createServerFn({ method: "POST" })
  .validator(z.object({ category: z.enum(testimonyCategoryValues), body: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const [testimony] = await tx
        .insert(testimonies)
        .values({ organizationId: session.organizationId, userId: session.userId, ...data })
        .returning();

      const recipients = await tx
        .select({ id: users.id })
        .from(users)
        .where(ne(users.id, session.userId));
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((r) => ({
            organizationId: session.organizationId,
            recipientUserId: r.id,
            type: "testimony_added" as const,
            message: `${session.fullName} has entered a testimony under category ${data.category}.`,
            entityType: "testimony",
            entityId: testimony.id,
          })),
        );
      }
      return testimony;
    });
  });

export const deleteTestimonyFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(testimonies).where(eq(testimonies.id, data.id)),
    );
    return { ok: true };
  });
