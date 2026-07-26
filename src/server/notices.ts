import { createServerFn } from "@tanstack/react-start";
import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { notices, users, notifications } from "./db/schema";
import { requireSession, AuthError } from "./auth";

// Recent-first, capped — this is a lightweight announcements feed shown on
// the Dashboard, not a paginated archive.
export const listNoticesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(notices).orderBy(desc(notices.createdAt)).limit(20),
  );
});

// Any signed-in user can post a notice — same openness as Testimonies —
// and it goes to every other user, both as a bell notification and in the
// Dashboard's Notices feed.
export const createNoticeFn = createServerFn({ method: "POST" })
  .validator(z.object({ message: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      const [notice] = await tx
        .insert(notices)
        .values({
          organizationId: session.organizationId,
          authorId: session.userId,
          message: data.message.trim(),
        })
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
            type: "notice_posted" as const,
            message: `${session.fullName} posted a notice: ${data.message.trim().slice(0, 120)}`,
            entityType: "notice",
            entityId: notice.id,
          })),
        );
      }
      return notice;
    });
  });

export const deleteNoticeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin") throw new AuthError("Only an Admin can delete a notice");
    await withTenant(session.organizationId, (tx) =>
      tx.delete(notices).where(eq(notices.id, data.id)),
    );
    return { ok: true };
  });
