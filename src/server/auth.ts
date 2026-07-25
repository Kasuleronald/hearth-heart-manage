import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { and, eq, gt } from "drizzle-orm";
import argon2 from "argon2";
import { z } from "zod";
import { db, withTenant } from "./db/client";
import {
  organizations,
  users,
  platformAdmins,
  sessions,
  userCredentials,
  passwordResetTokens,
} from "./db/schema";
import type { Role } from "@/lib/db";

const SESSION_COOKIE = "mychurch_session";
// Matches the original client-only app's 10-minute idle timeout — enforced
// here server-side against `sessions.expiresAt`, extended ("touched") on
// activity rather than on every single request (see TOUCH_THROTTLE_MS).
const SESSION_IDLE_MS = 10 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 1000;
// The cookie's own lifetime is a generous outer ceiling — the real
// expiration authority is the DB-side idle timeout above.
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, matches the original

export class AuthError extends Error {}

// Plain (non-createServerFn) helpers below are wrapped in createServerOnlyFn:
// TanStack Start's compiler only auto-splits the literal .handler() bodies
// of createServerFn()s into a server-only chunk — a plain function in the
// same file, even if only ever called from within a handler, still trips
// import-protection at build time once the file is reachable from client
// code (any route importing e.g. loginFn also reaches this file's other
// top-level imports, like ./db/schema). createServerOnlyFn marks these for
// the same server-only splitting explicitly.
const cookieOptions = createServerOnlyFn(() => ({
  httpOnly: true,
  // Secure by default in production, but overridable via COOKIE_SECURE=false
  // for a bootstrap window serving plain HTTP before a domain + TLS cert
  // exist — a Secure cookie is silently dropped by the browser over HTTP,
  // which otherwise makes login appear to succeed while no session sticks.
  secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE_SEC,
}));

const hashPassword = createServerOnlyFn(async (password: string): Promise<string> => {
  return argon2.hash(password, { type: argon2.argon2id });
});

const verifyPassword = createServerOnlyFn(
  async (hash: string, password: string): Promise<boolean> => {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  },
);

export interface AuthedSession {
  kind: "user";
  sessionId: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  fullName: string;
  role: Role;
  branchId?: string;
  financeTier?: "A";
  needsEmailUpdate: boolean;
}

export interface PlatformSession {
  kind: "platform_admin";
  sessionId: string;
  platformAdminId: string;
  email: string;
  fullName: string;
}

// The one chokepoint every authenticated server function routes through.
// Reads the session cookie, validates it against the `sessions` table
// (platform-level, not RLS-protected — see schema.ts), touches it if it's
// been a while since the last activity, and returns a typed session or
// null. Callers that need real data access should follow up with
// `withTenant(session.organizationId, ...)` for an AuthedSession.
export const resolveSession = createServerOnlyFn(
  async (): Promise<AuthedSession | PlatformSession | null> => {
    const sessionId = getCookie(SESSION_COOKIE);
    if (!sessionId) return null;

    const row = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      if (row) await db.delete(sessions).where(eq(sessions.id, sessionId));
      deleteCookie(SESSION_COOKIE, cookieOptions());
      return null;
    }

    const now = Date.now();
    if (row.expiresAt.getTime() - now < SESSION_IDLE_MS - TOUCH_THROTTLE_MS) {
      await db
        .update(sessions)
        .set({ expiresAt: new Date(now + SESSION_IDLE_MS) })
        .where(eq(sessions.id, sessionId));
    }

    if (row.platformAdminId) {
      const admin = await db.query.platformAdmins.findFirst({
        where: eq(platformAdmins.id, row.platformAdminId),
      });
      if (!admin) return null;
      return {
        kind: "platform_admin",
        sessionId: row.id,
        platformAdminId: admin.id,
        email: admin.email,
        fullName: admin.fullName,
      };
    }

    if (row.userId && row.organizationId) {
      return withTenant(row.organizationId, async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .innerJoin(organizations, eq(organizations.id, users.organizationId))
          .where(eq(users.id, row.userId!));
        if (!user) return null;
        if (user.organizations.status !== "active") return null;
        return {
          kind: "user",
          sessionId: row.id,
          userId: user.users.id,
          organizationId: user.users.organizationId,
          organizationName: user.organizations.name,
          email: user.users.email,
          fullName: user.users.fullName,
          role: user.users.role,
          branchId: user.users.branchId ?? undefined,
          financeTier: user.users.financeTier ?? undefined,
          needsEmailUpdate: user.users.needsEmailUpdate,
        };
      });
    }

    return null;
  },
);

export const requireSession = createServerOnlyFn(async (): Promise<AuthedSession> => {
  const session = await resolveSession();
  if (!session || session.kind !== "user") {
    throw new AuthError("Not signed in");
  }
  return session;
});

export const requirePlatformSession = createServerOnlyFn(async (): Promise<PlatformSession> => {
  const session = await resolveSession();
  if (!session || session.kind !== "platform_admin") {
    throw new AuthError("Not signed in as a platform admin");
  }
  return session;
});

const createSessionCookie = createServerOnlyFn(
  async (fields: { userId?: string; organizationId?: string; platformAdminId?: string }) => {
    const [row] = await db
      .insert(sessions)
      .values({ ...fields, expiresAt: new Date(Date.now() + SESSION_IDLE_MS) })
      .returning({ id: sessions.id });
    setCookie(SESSION_COOKIE, row.id, cookieOptions());
  },
);

// ---- Server functions ----

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const loginFn = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const credentials = await db.query.userCredentials.findFirst({
      where: eq(userCredentials.email, email),
    });
    if (!credentials || !credentials.passwordHash) {
      throw new AuthError("Invalid email or password");
    }
    const ok = await verifyPassword(credentials.passwordHash, data.password);
    if (!ok) throw new AuthError("Invalid email or password");

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, credentials.organizationId),
    });
    if (!org || org.status !== "active") {
      throw new AuthError("Account inactive — contact your Administrator");
    }

    await createSessionCookie({ userId: credentials.userId, organizationId: org.id });
    return { ok: true as const };
  });

const platformLoginSchema = loginSchema;

export const platformLoginFn = createServerFn({ method: "POST" })
  .validator(platformLoginSchema)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const admin = await db.query.platformAdmins.findFirst({
      where: eq(platformAdmins.email, email),
    });
    if (!admin) throw new AuthError("Invalid email or password");
    const ok = await verifyPassword(admin.passwordHash, data.password);
    if (!ok) throw new AuthError("Invalid email or password");

    await createSessionCookie({ platformAdminId: admin.id });
    return { ok: true as const };
  });

const changePlatformAdminPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const changePlatformAdminPasswordFn = createServerFn({ method: "POST" })
  .validator(changePlatformAdminPasswordSchema)
  .handler(async ({ data }) => {
    const session = await requirePlatformSession();
    const admin = await db.query.platformAdmins.findFirst({
      where: eq(platformAdmins.id, session.platformAdminId),
    });
    if (!admin) throw new AuthError("Account not found");
    const ok = await verifyPassword(admin.passwordHash, data.currentPassword);
    if (!ok) throw new AuthError("Current password is incorrect");

    const passwordHash = await hashPassword(data.newPassword);
    await db.update(platformAdmins).set({ passwordHash }).where(eq(platformAdmins.id, admin.id));
    return { ok: true as const };
  });

const changeUserPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// user_credentials isn't RLS-protected (see schema.ts), so this doesn't need
// withTenant() — requireSession() alone is enough to know which account.
export const changeUserPasswordFn = createServerFn({ method: "POST" })
  .validator(changeUserPasswordSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const cred = await db.query.userCredentials.findFirst({
      where: eq(userCredentials.userId, session.userId),
    });
    if (!cred || !cred.passwordHash) throw new AuthError("Account not found");
    const ok = await verifyPassword(cred.passwordHash, data.currentPassword);
    if (!ok) throw new AuthError("Current password is incorrect");

    const passwordHash = await hashPassword(data.newPassword);
    await db
      .update(userCredentials)
      .set({ passwordHash })
      .where(eq(userCredentials.userId, session.userId));
    return { ok: true as const };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const sessionId = getCookie(SESSION_COOKIE);
  if (sessionId) await db.delete(sessions).where(eq(sessions.id, sessionId));
  deleteCookie(SESSION_COOKIE, cookieOptions());
  return { ok: true as const };
});

export const getCurrentSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  return resolveSession();
});

// ---- Invite / password reset ----
// Same underlying token mechanism serves two flows: a brand-new invited
// user setting their first password, and an existing user resetting a
// forgotten one — both are "prove you control this email, then set a
// password" with a single-use, time-limited token, exactly like the
// original local-only app's admin-relayed reset code.

export const createResetToken = createServerOnlyFn(
  async (userId: string, organizationId: string): Promise<string> => {
    const [row] = await db
      .insert(passwordResetTokens)
      .values({
        userId,
        organizationId,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      })
      .returning({ token: passwordResetTokens.token });
    return row.token;
  },
);

const acceptInviteSchema = z.object({
  token: z.string().uuid(),
  password: z.string().min(8),
});

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(acceptInviteSchema)
  .handler(async ({ data }) => {
    const tokenRow = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, data.token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    });
    if (!tokenRow) throw new AuthError("This link is invalid or has expired");

    const passwordHash = await hashPassword(data.password);
    await db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.token, data.token));
      const cred = await tx.query.userCredentials.findFirst({
        where: eq(userCredentials.userId, tokenRow.userId),
      });
      if (!cred) throw new AuthError("Account not found");
      await tx
        .update(userCredentials)
        .set({ passwordHash })
        .where(eq(userCredentials.userId, tokenRow.userId));
    });

    await createSessionCookie({ userId: tokenRow.userId, organizationId: tokenRow.organizationId });
    return { ok: true as const };
  });
