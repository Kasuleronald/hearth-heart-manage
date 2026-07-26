import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { notifications, users } from "./db/schema";
import { requireSession } from "./auth";

export const listNotificationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, session.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50),
  );
});

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(notifications)
        .set({ read: true })
        .where(
          and(eq(notifications.id, data.id), eq(notifications.recipientUserId, session.userId)),
        ),
    );
    return { ok: true };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  await withTenant(session.organizationId, (tx) =>
    tx
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.recipientUserId, session.userId)),
  );
  return { ok: true };
});

export const updateMyNotificationPrefsFn = createServerFn({ method: "POST" })
  .validator(z.object({ emailNotificationsEnabled: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(users)
        .set({ emailNotificationsEnabled: data.emailNotificationsEnabled })
        .where(eq(users.id, session.userId)),
    );
    return { ok: true };
  });
