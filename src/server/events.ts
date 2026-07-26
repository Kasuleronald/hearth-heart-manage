import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withTenant, type Tx } from "./db/client";
import { events, eventAttendance, users, notifications } from "./db/schema";
import { requireSession, AuthError, type AuthedSession } from "./auth";
import { sendEventNotificationEmail, sendEventReportEmail } from "./email";
import { format } from "date-fns";

const eventTypeValues = ["sunday_service", "prayer", "overnight_prayer", "special"] as const;
const audienceValues = ["all", "leaders"] as const;
const monthlyPositionValues = ["first", "second", "third", "fourth", "last"] as const;

const eventRecurrenceSchema = z.object({
  frequency: z.enum(["weekly", "monthly"]),
  weekday: z.number().int().min(0).max(6),
  monthlyPosition: z.enum(monthlyPositionValues).optional(),
  until: z.string(),
});

const eventFieldsSchema = z.object({
  title: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  type: z.enum(eventTypeValues),
  audience: z.enum(audienceValues),
  notes: z.string().optional(),
  offertoryAmount: z.number().int().optional(),
  branchId: z.string().uuid().optional(),
});

export const listEventsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(events).orderBy(desc(events.date)),
  );
});

export const getEventFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const event = await withTenant(session.organizationId, (tx) =>
      tx.query.events.findFirst({ where: eq(events.id, data.id) }),
    );
    if (!event) throw new AuthError("Event not found");
    return event;
  });

type RecipientRow = {
  id: string;
  fullName: string;
  email: string;
  emailNotificationsEnabled: boolean;
};

async function notifyRecipients(
  tx: Tx,
  session: AuthedSession,
  event: { id: string; title: string; audience: "all" | "leaders" },
): Promise<RecipientRow[]> {
  const orgUsers = await tx
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      emailNotificationsEnabled: users.emailNotificationsEnabled,
    })
    .from(users);

  const recipients = orgUsers.filter((u) => {
    if (u.id === session.userId) return false;
    if (event.audience === "leaders") {
      return ["leader", "cell_leader", "pastor", "admin"].includes(u.role);
    }
    return true;
  });

  if (recipients.length > 0) {
    await tx.insert(notifications).values(
      recipients.map((r) => ({
        organizationId: session.organizationId,
        recipientUserId: r.id,
        type: "event_created" as const,
        message: `New event: ${event.title}`,
        entityType: "event",
        entityId: event.id,
      })),
    );
  }

  return recipients;
}

async function sendEventEmails(
  session: AuthedSession,
  event: { id: string; title: string; date: string },
  recipients: RecipientRow[],
) {
  const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const eventLink = baseUrl ? `${baseUrl}/events/${event.id}` : undefined;
  const eventDateLabel = format(new Date(`${event.date}T00:00:00`), "PPPP");
  const toNotify = recipients.filter((r) => r.emailNotificationsEnabled);
  await Promise.allSettled(
    toNotify.map((r) =>
      sendEventNotificationEmail({
        to: r.email,
        recipientName: r.fullName,
        eventTitle: event.title,
        eventDateLabel,
        orgName: session.organizationName,
        eventLink,
      }),
    ),
  );
}

export const createEventFn = createServerFn({ method: "POST" })
  .validator(eventFieldsSchema.extend({ date: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { event, recipients } = await withTenant(session.organizationId, async (tx) => {
      const [event] = await tx
        .insert(events)
        .values({ organizationId: session.organizationId, ...data })
        .returning();
      const recipients = await notifyRecipients(tx, session, event);
      return { event, recipients };
    });
    await sendEventEmails(session, event, recipients);
    return event;
  });

export const createRecurringEventsFn = createServerFn({ method: "POST" })
  .validator(
    eventFieldsSchema.extend({
      dates: z.array(z.string()).min(1),
      recurrence: eventRecurrenceSchema,
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { dates, recurrence, ...base } = data;
    const { rows, recipients } = await withTenant(session.organizationId, async (tx) => {
      const recurrenceId = randomUUID();
      const rows = await tx
        .insert(events)
        .values(
          dates.map((date) => ({
            organizationId: session.organizationId,
            ...base,
            date,
            recurrenceId,
            recurrence,
          })),
        )
        .returning();
      const recipients = await notifyRecipients(tx, session, rows[0]);
      return { rows, recipients };
    });
    await sendEventEmails(session, rows[0], recipients);
    return rows;
  });

export const updateEventFn = createServerFn({ method: "POST" })
  .validator(eventFieldsSchema.extend({ id: z.string().uuid(), date: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [event] = await withTenant(session.organizationId, (tx) =>
      tx.update(events).set(rest).where(eq(events.id, id)).returning(),
    );
    if (!event) throw new AuthError("Event not found");
    return event;
  });

export const deleteEventFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(events).where(eq(events.id, data.id)),
    );
    return { ok: true };
  });

export const deleteEventSeriesFn = createServerFn({ method: "POST" })
  .validator(z.object({ recurrenceId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const deleted = await withTenant(session.organizationId, (tx) =>
      tx
        .delete(events)
        .where(eq(events.recurrenceId, data.recurrenceId))
        .returning({ id: events.id }),
    );
    return { count: deleted.length };
  });

const eventReportSchema = z.object({
  eventId: z.string().uuid(),
  venue: z.string().optional(),
  reportAttendance: z.number().int().min(0).optional(),
  ministers: z.string().optional(),
  strengths: z.string().optional(),
  challengesFaced: z.string().optional(),
  offertoryAmount: z.number().int().optional(),
  recommendations: z.string().optional(),
  reportNotes: z.string().optional(),
});

// Post-event report — open to whoever can manage Events, or the leader of a
// department granted the "events" module (see canSubmitEventReport in
// lib/auth.ts). Unlike event-creation notifications (which respect the
// event's audience setting), a submitted report always goes to everyone.
export const submitEventReportFn = createServerFn({ method: "POST" })
  .validator(eventReportSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { eventId, ...rest } = data;
    const { event, recipients } = await withTenant(session.organizationId, async (tx) => {
      const [event] = await tx
        .update(events)
        .set({ ...rest, reportSubmittedBy: session.userId, reportSubmittedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();
      if (!event) throw new AuthError("Event not found");

      const orgUsers = await tx
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          emailNotificationsEnabled: users.emailNotificationsEnabled,
        })
        .from(users);
      const recipients = orgUsers.filter((u) => u.id !== session.userId);
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((r) => ({
            organizationId: session.organizationId,
            recipientUserId: r.id,
            type: "event_report_submitted" as const,
            message: `${session.fullName} submitted a report for ${event.title}`,
            entityType: "event",
            entityId: event.id,
          })),
        );
      }
      return { event, recipients };
    });

    const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const eventLink = baseUrl ? `${baseUrl}/events/${event.id}` : undefined;
    const eventDateLabel = format(new Date(`${event.date}T00:00:00`), "PPPP");
    const toNotify = recipients.filter((r) => r.emailNotificationsEnabled);
    await Promise.allSettled(
      toNotify.map((r) =>
        sendEventReportEmail({
          to: r.email,
          recipientName: r.fullName,
          eventTitle: event.title,
          eventDateLabel,
          orgName: session.organizationName,
          submittedByName: session.fullName,
          eventLink,
        }),
      ),
    );
    return event;
  });

export const listEventAttendanceFn = createServerFn({ method: "GET" })
  .validator(z.object({ eventId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      tx.select().from(eventAttendance).where(eq(eventAttendance.eventId, data.eventId)),
    );
  });

// Org-wide, for aggregate reporting (Reports page) — unlike
// listEventAttendanceFn above, not scoped to a single event.
export const listAllEventAttendanceFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) => tx.select().from(eventAttendance));
});

export const setEventAttendanceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ eventId: z.string().uuid(), memberId: z.string().uuid(), present: z.boolean() }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .insert(eventAttendance)
        .values({
          organizationId: session.organizationId,
          eventId: data.eventId,
          memberId: data.memberId,
          present: data.present,
        })
        .onConflictDoUpdate({
          target: [eventAttendance.eventId, eventAttendance.memberId],
          set: { present: data.present },
        }),
    );
    return { ok: true };
  });
