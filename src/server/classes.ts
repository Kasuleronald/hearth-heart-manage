import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { classes, classSessions, classAttendance, members } from "./db/schema";
import { requireSession, AuthError } from "./auth";

// ---- Classes ----

export const listClassesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(classes).orderBy(asc(classes.name)),
  );
});

export const getClassFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const cls = await withTenant(session.organizationId, (tx) =>
      tx.query.classes.findFirst({ where: eq(classes.id, data.id) }),
    );
    if (!cls) throw new AuthError("Class not found");
    return cls;
  });

const classFieldsSchema = z.object({
  name: z.string().min(1),
  meetingDay: z.string().optional(),
  meetingLocation: z.string().optional(),
  facilitatorId: z.string().uuid().optional(),
  description: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createClassFn = createServerFn({ method: "POST" })
  .validator(classFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [cls] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(classes)
        .values({ organizationId: session.organizationId, ...data })
        .returning(),
    );
    return cls;
  });

export const updateClassFn = createServerFn({ method: "POST" })
  .validator(classFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [cls] = await withTenant(session.organizationId, (tx) =>
      tx
        .update(classes)
        .set({ ...rest, facilitatorId: rest.facilitatorId ?? null })
        .where(eq(classes.id, id))
        .returning(),
    );
    if (!cls) throw new AuthError("Class not found");
    return cls;
  });

// classSessions.classId is onDelete: "cascade" and members.classId is
// onDelete: "set null" (schema.ts) — sessions/attendance are removed and
// members un-linked automatically, no manual cascade needed.
export const deleteClassFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(classes).where(eq(classes.id, data.id)),
    );
    return { ok: true };
  });

export const setClassMembershipFn = createServerFn({ method: "POST" })
  .validator(z.object({ memberId: z.string().uuid(), classId: z.string().uuid().nullable() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.update(members).set({ classId: data.classId }).where(eq(members.id, data.memberId)),
    );
    return { ok: true };
  });

// ---- Class sessions ----

export const listClassSessionsFn = createServerFn({ method: "GET" })
  .validator(z.object({ classId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      tx
        .select()
        .from(classSessions)
        .where(eq(classSessions.classId, data.classId))
        .orderBy(desc(classSessions.date)),
    );
  });

// Org-wide, for Reports aggregation.
export const listAllClassSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(classSessions).orderBy(desc(classSessions.date)),
  );
});

const sessionFieldsSchema = z.object({
  classId: z.string().uuid(),
  date: z.string(),
  topic: z.string().optional(),
  notes: z.string().optional(),
  offertoryAmount: z.number().int().optional(),
  branchId: z.string().uuid().optional(),
});

export const createClassSessionFn = createServerFn({ method: "POST" })
  .validator(sessionFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [record] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(classSessions)
        .values({ organizationId: session.organizationId, ...data })
        .returning(),
    );
    return record;
  });

export const updateClassSessionFn = createServerFn({ method: "POST" })
  .validator(sessionFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [record] = await withTenant(session.organizationId, (tx) =>
      tx.update(classSessions).set(rest).where(eq(classSessions.id, id)).returning(),
    );
    if (!record) throw new AuthError("Session not found");
    return record;
  });

export const deleteClassSessionFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(classSessions).where(eq(classSessions.id, data.id)),
    );
    return { ok: true };
  });

// ---- Class attendance ----

export const listClassAttendanceFn = createServerFn({ method: "GET" })
  .validator(z.object({ sessionId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, (tx) =>
      tx.select().from(classAttendance).where(eq(classAttendance.sessionId, data.sessionId)),
    );
  });

// Org-wide, for Reports aggregation.
export const listAllClassAttendanceFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) => tx.select().from(classAttendance));
});

export const setClassAttendanceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ sessionId: z.string().uuid(), memberId: z.string().uuid(), present: z.boolean() }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx
        .insert(classAttendance)
        .values({
          organizationId: session.organizationId,
          sessionId: data.sessionId,
          memberId: data.memberId,
          present: data.present,
        })
        .onConflictDoUpdate({
          target: [classAttendance.sessionId, classAttendance.memberId],
          set: { present: data.present },
        }),
    );
    return { ok: true };
  });
