import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { organizations, users, userCredentials } from "./db/schema";
import { requirePlatformSession, createResetToken, AuthError } from "./auth";

// Every function here is platform-level (spans every church), so none of it
// goes through withTenant()/RLS — organizations and userCredentials are
// deliberately not tenant-scoped tables (see schema.ts).

export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requirePlatformSession();
  const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  const adminsByOrg = new Map<string, typeof admins>();
  for (const admin of admins) {
    const arr = adminsByOrg.get(admin.organizationId) ?? [];
    arr.push(admin);
    adminsByOrg.set(admin.organizationId, arr);
  }
  return orgs.map((org) => ({
    ...org,
    admins: (adminsByOrg.get(org.id) ?? []).map((a) => ({
      id: a.id,
      fullName: a.fullName,
      email: a.email,
    })),
  }));
});

const createOrganizationSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["church", "ministry", "organization"]).default("church"),
  timezone: z.string().optional(),
  adminFullName: z.string().min(2),
  adminEmail: z.string().email(),
});

// Creates the organization's isolated workspace and its first Admin in one
// step. The admin gets no password yet — only an invite/set-password token,
// same mechanism as an ordinary forgotten-password reset (see
// src/server/auth.ts's createResetToken). This replaces the original local
// app's "first person to open the app just types a password" bootstrap,
// which only made sense for a single, local install — it can't be how a
// shared hosted install works, since anyone hitting the login page
// shouldn't be able to self-provision as Admin of a real organization.
export const createOrganizationFn = createServerFn({ method: "POST" })
  .validator(createOrganizationSchema)
  .handler(async ({ data }) => {
    await requirePlatformSession();
    const email = data.adminEmail.trim().toLowerCase();

    const existing = await db.query.userCredentials.findFirst({
      where: eq(userCredentials.email, email),
    });
    if (existing) throw new AuthError("A user with this email already exists");

    const result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: data.name.trim(), type: data.type, timezone: data.timezone })
        .returning();
      const [admin] = await tx
        .insert(users)
        .values({
          organizationId: org.id,
          email,
          fullName: data.adminFullName.trim(),
          role: "admin",
        })
        .returning();
      await tx.insert(userCredentials).values({
        email,
        userId: admin.id,
        organizationId: org.id,
        passwordHash: null,
      });
      return { org, admin };
    });

    const token = await createResetToken(result.admin.id, result.org.id);
    // Local-mode, no SMTP yet: relayed out-of-band by whoever is running
    // this, same spirit as the original app's admin-relayed reset code.
    // The real invite link is /accept-invite?token=<token>.
    return { organization: result.org, admin: result.admin, inviteToken: token };
  });

const orgIdSchema = z.object({ organizationId: z.string().uuid() });

export const suspendOrganizationFn = createServerFn({ method: "POST" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    await requirePlatformSession();
    await db
      .update(organizations)
      .set({ status: "suspended" })
      .where(eq(organizations.id, data.organizationId));
    return { ok: true as const };
  });

export const reactivateOrganizationFn = createServerFn({ method: "POST" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    await requirePlatformSession();
    await db
      .update(organizations)
      .set({ status: "active" })
      .where(eq(organizations.id, data.organizationId));
    return { ok: true as const };
  });

export const disableOrganizationFn = createServerFn({ method: "POST" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    await requirePlatformSession();
    await db
      .update(organizations)
      .set({ status: "disabled" })
      .where(eq(organizations.id, data.organizationId));
    return { ok: true as const };
  });
