import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { departments, expenses, requisitions } from "./db/schema";
import { requireSession, AuthError } from "./auth";

const departmentModuleValues = ["givings", "projects", "pledges", "partners", "events"] as const;

export const listDepartmentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(departments).orderBy(asc(departments.name)),
  );
});

const departmentInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  leaderId: z.string().uuid().optional(),
  allowedModules: z.array(z.enum(departmentModuleValues)).default([]),
  branchId: z.string().uuid().optional(),
});

export const createDepartmentFn = createServerFn({ method: "POST" })
  .validator(departmentInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      if (data.leaderId) {
        // Keep leadership 1:1 — clear this leader from any other department first.
        await tx
          .update(departments)
          .set({ leaderId: null })
          .where(eq(departments.leaderId, data.leaderId));
      }
      const [dept] = await tx
        .insert(departments)
        .values({
          organizationId: session.organizationId,
          name: data.name.trim(),
          description: data.description || undefined,
          leaderId: data.leaderId,
          allowedModules: data.allowedModules,
          branchId: data.branchId,
        })
        .returning();
      return dept;
    });
  });

const updateDepartmentSchema = departmentInputSchema.extend({ id: z.string().uuid() });

export const updateDepartmentFn = createServerFn({ method: "POST" })
  .validator(updateDepartmentSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    return withTenant(session.organizationId, async (tx) => {
      if (data.leaderId) {
        await tx
          .update(departments)
          .set({ leaderId: null })
          .where(and(eq(departments.leaderId, data.leaderId), ne(departments.id, data.id)));
      }
      const [dept] = await tx
        .update(departments)
        .set({
          name: data.name.trim(),
          description: data.description || undefined,
          leaderId: data.leaderId ?? null,
          allowedModules: data.allowedModules,
          branchId: data.branchId,
        })
        .where(eq(departments.id, data.id))
        .returning();
      if (!dept) throw new AuthError("Department not found");
      return dept;
    });
  });

const departmentIdSchema = z.object({ id: z.string().uuid() });

// Expense.departmentId and Requisition.departmentId are both required (not
// optional), so unlike other cascades those rows can't be left dangling with
// the link cleared — delete them along with their department.
export const deleteDepartmentFn = createServerFn({ method: "POST" })
  .validator(departmentIdSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, async (tx) => {
      await tx.delete(expenses).where(eq(expenses.departmentId, data.id));
      await tx.delete(requisitions).where(eq(requisitions.departmentId, data.id));
      await tx.delete(departments).where(eq(departments.id, data.id));
    });
    return { ok: true as const };
  });

// A starter set of ministries common to most churches, so the admin doesn't
// have to type them all in by hand — safe to re-run, only adds missing names.
const DEFAULT_DEPARTMENTS = [
  "Protocol",
  "Ushering",
  "Hospitality",
  "Missions",
  "Service",
  "Programs",
  "Finance",
  "Events",
  "Sound",
  "Worship",
  "Media",
  "Marriage",
  "Gender",
  "Youth",
  "Campus",
  "Sunday School",
  "Welfare",
  "Prayer & Intercession",
  "Children's Ministry",
  "Choir",
  "Security",
  "Technical / ICT",
  "Evangelism & Outreach",
  "Counseling & Pastoral Care",
  "Administration",
  "Transport",
];

export const seedDefaultDepartmentsFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, async (tx) => {
    const existing = await tx
      .select({ name: departments.name })
      .from(departments)
      .where(eq(departments.organizationId, session.organizationId));
    const existingNames = new Set(existing.map((d) => d.name.trim().toLowerCase()));
    const missing = DEFAULT_DEPARTMENTS.filter((name) => !existingNames.has(name.toLowerCase()));
    if (missing.length === 0) return { added: 0 };
    await tx
      .insert(departments)
      .values(missing.map((name) => ({ organizationId: session.organizationId, name })));
    return { added: missing.length };
  });
});
