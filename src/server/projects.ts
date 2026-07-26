import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "./db/client";
import { projects } from "./db/schema";
import { requireSession, AuthError } from "./auth";

export const listProjectsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(projects).orderBy(asc(projects.name)),
  );
});

const projectFieldsSchema = z.object({
  name: z.string().min(1),
  scope: z.string().optional(),
  financialTarget: z.number().int().optional(),
  weeklyTarget: z.number().int().optional(),
  monthlyTarget: z.number().int().optional(),
  branchId: z.string().uuid().optional(),
});

export const createProjectFn = createServerFn({ method: "POST" })
  .validator(projectFieldsSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const [project] = await withTenant(session.organizationId, (tx) =>
      tx
        .insert(projects)
        .values({ organizationId: session.organizationId, createdBy: session.userId, ...data })
        .returning(),
    );
    return project;
  });

export const updateProjectFn = createServerFn({ method: "POST" })
  .validator(projectFieldsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { id, ...rest } = data;
    const [project] = await withTenant(session.organizationId, (tx) =>
      tx.update(projects).set(rest).where(eq(projects.id, id)).returning(),
    );
    if (!project) throw new AuthError("Project not found");
    return project;
  });

// givings.projectId is onDelete: "set null" (schema.ts) — any recorded
// giving against this project is kept, just unlinked, same as before.
export const deleteProjectFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await withTenant(session.organizationId, (tx) =>
      tx.delete(projects).where(eq(projects.id, data.id)),
    );
    return { ok: true };
  });
