import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "./db/client";
import { users, userCredentials } from "./db/schema";
import { requireSession, createResetToken, AuthError } from "./auth";
import { sendInviteEmail } from "./email";

const roleValues = ["admin", "pastor", "cell_leader", "leader", "treasurer"] as const;

export const listOrgUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, (tx) =>
    tx.select().from(users).orderBy(asc(users.fullName)),
  );
});

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  role: z.enum(roleValues),
  memberId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  financeTier: z.enum(["A"]).optional(),
});

// No password is typed here — the new user gets a real account with no
// password set yet, plus an emailed invite link, same mechanism already
// proven for a brand-new org's first Admin (createOrganizationFn) and for
// SuperAdmin-triggered resets. Avoids client-side password hashing
// entirely, which depends on crypto.subtle (unavailable without HTTPS).
export const createOrgUserFn = createServerFn({ method: "POST" })
  .validator(createUserSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin") throw new AuthError("Only an Admin can add users");
    const email = data.email.trim().toLowerCase();

    const existing = await db.query.userCredentials.findFirst({
      where: eq(userCredentials.email, email),
    });
    if (existing) throw new AuthError("A user with this email already exists");

    const user = await withTenant(session.organizationId, async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          organizationId: session.organizationId,
          email,
          fullName: data.fullName.trim(),
          role: data.role,
          memberId: data.memberId,
          branchId: data.branchId,
          financeTier: data.financeTier,
        })
        .returning();
      return u;
    });
    await db.insert(userCredentials).values({
      email,
      userId: user.id,
      organizationId: session.organizationId,
      passwordHash: null,
    });

    const token = await createResetToken(user.id, session.organizationId);
    const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const inviteLink = `${baseUrl}/accept-invite?token=${token}`;
    const { sent } = baseUrl
      ? await sendInviteEmail({
          to: email,
          adminName: user.fullName,
          orgName: session.organizationName,
          inviteLink,
          kind: "invite",
        })
      : { sent: false };

    return { user, inviteToken: token, emailSent: sent };
  });

const updateUserSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(2),
  email: z.string().email(),
  role: z.enum(roleValues),
  memberId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  financeTier: z.enum(["A"]).optional(),
});

export const updateOrgUserFn = createServerFn({ method: "POST" })
  .validator(updateUserSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin") throw new AuthError("Only an Admin can edit users");
    const email = data.email.trim().toLowerCase();

    const target = await withTenant(session.organizationId, (tx) =>
      tx.query.users.findFirst({ where: eq(users.id, data.id) }),
    );
    if (!target) throw new AuthError("User not found");

    if (email !== target.email) {
      const existing = await db.query.userCredentials.findFirst({
        where: eq(userCredentials.email, email),
      });
      if (existing) throw new AuthError("A user with this email already exists");
    }

    const user = await withTenant(session.organizationId, (tx) =>
      tx
        .update(users)
        .set({
          fullName: data.fullName.trim(),
          email,
          role: data.role,
          memberId: data.memberId,
          branchId: data.branchId,
          financeTier: data.financeTier,
          needsEmailUpdate: email !== target.email ? false : target.needsEmailUpdate,
        })
        .where(eq(users.id, data.id))
        .returning()
        .then((rows) => rows[0]),
    );
    if (email !== target.email) {
      await db.update(userCredentials).set({ email }).where(eq(userCredentials.userId, data.id));
    }
    return { user };
  });

const userIdSchema = z.object({ id: z.string().uuid() });

export const deleteOrgUserFn = createServerFn({ method: "POST" })
  .validator(userIdSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin") throw new AuthError("Only an Admin can delete users");
    if (data.id === session.userId) throw new AuthError("You can't delete your own account");
    // user_credentials and sessions cascade-delete via their FK to users.id.
    await withTenant(session.organizationId, (tx) => tx.delete(users).where(eq(users.id, data.id)));
    return { ok: true as const };
  });

// Lets an org Admin get a locked-out teammate back in without knowing their
// current password — same mechanism as SuperAdmin's org-admin reset.
export const resetOrgUserPasswordFn = createServerFn({ method: "POST" })
  .validator(userIdSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin") throw new AuthError("Only an Admin can reset a user's password");

    const target = await withTenant(session.organizationId, (tx) =>
      tx.query.users.findFirst({ where: eq(users.id, data.id) }),
    );
    if (!target) throw new AuthError("User not found");

    const token = await createResetToken(target.id, session.organizationId);
    const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const resetLink = `${baseUrl}/accept-invite?token=${token}`;
    const { sent } = baseUrl
      ? await sendInviteEmail({
          to: target.email,
          adminName: target.fullName,
          orgName: session.organizationName,
          inviteLink: resetLink,
          kind: "reset",
        })
      : { sent: false };

    return { resetToken: token, emailSent: sent };
  });
