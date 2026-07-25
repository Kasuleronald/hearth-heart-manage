import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { organizations, users, userCredentials } from "./db/schema";
import { requirePlatformSession, createResetToken, AuthError } from "./auth";
import { sendInviteEmail } from "./email";

// Most of this file is platform-level (spans every church) and doesn't touch
// RLS-protected tables at all — organizations and userCredentials are
// deliberately not tenant-scoped (see schema.ts). createOrganizationFn is the
// exception: it also inserts into `users`, which IS RLS-protected, so that
// one insert needs app.current_org_id set for the brand-new org, same as
// withTenant() does elsewhere — see the set_config call below.

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
      // The `users` table's RLS policy requires app.current_org_id to match
      // the row being inserted — set it for this transaction now that the
      // org actually exists (mirrors withTenant() in db/client.ts).
      await tx.execute(sql`select set_config('app.current_org_id', ${org.id}, true)`);
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
    const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const inviteLink = `${baseUrl}/accept-invite?token=${token}`;
    // Degrades gracefully to manual relay if SMTP isn't configured (see
    // src/server/email.ts) — the link is always returned either way so the
    // SuperAdmin UI can show/copy it as a fallback.
    const { sent } = baseUrl
      ? await sendInviteEmail({
          to: email,
          adminName: result.admin.fullName,
          orgName: result.org.name,
          inviteLink,
        })
      : { sent: false };

    return {
      organization: result.org,
      admin: result.admin,
      inviteToken: token,
      emailSent: sent,
    };
  });

const updateOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2),
  type: z.enum(["church", "ministry", "organization"]),
  timezone: z.string().optional(),
});

export const updateOrganizationFn = createServerFn({ method: "POST" })
  .validator(updateOrganizationSchema)
  .handler(async ({ data }) => {
    await requirePlatformSession();
    const [org] = await db
      .update(organizations)
      .set({ name: data.name.trim(), type: data.type, timezone: data.timezone || null })
      .where(eq(organizations.id, data.organizationId))
      .returning();
    if (!org) throw new AuthError("Organization not found");
    return { organization: org };
  });

const resetAdminPasswordSchema = z.object({ adminUserId: z.string().uuid() });

// Lets a SuperAdmin get a locked-out org Admin back in, without needing to
// know their current password — generates a fresh set-password token via
// the same mechanism as a brand-new org's first invite (createResetToken),
// and emails it the same way if SMTP is configured.
export const resetOrgAdminPasswordFn = createServerFn({ method: "POST" })
  .validator(resetAdminPasswordSchema)
  .handler(async ({ data }) => {
    await requirePlatformSession();
    const admin = await db.query.users.findFirst({ where: eq(users.id, data.adminUserId) });
    if (!admin) throw new AuthError("Admin not found");
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, admin.organizationId),
    });
    if (!org) throw new AuthError("Organization not found");

    const token = await createResetToken(admin.id, admin.organizationId);
    const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const resetLink = `${baseUrl}/accept-invite?token=${token}`;
    const { sent } = baseUrl
      ? await sendInviteEmail({
          to: admin.email,
          adminName: admin.fullName,
          orgName: org.name,
          inviteLink: resetLink,
          kind: "reset",
        })
      : { sent: false };

    return { resetToken: token, emailSent: sent };
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
