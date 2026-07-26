import { createServerFn } from "@tanstack/react-start";
import { asc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, withTenant } from "./db/client";
import { memberRegistrations, members, users, notifications, organizations } from "./db/schema";
import { requireSession, AuthError } from "./auth";

const memberStatusValues = [
  "active",
  "inactive",
  "leader",
  "deacon",
  "elder",
  "pastor",
  "minister",
] as const;

// Public — no session. Just enough to render the registration form's
// heading and confirm the link is still live; returns null (not an error)
// for an unknown or non-active org so the page can show a friendly
// "this link isn't available" message instead of a stack of error toasts.
export const getOrgPublicInfoFn = createServerFn({ method: "GET" })
  .validator(z.object({ organizationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [org] = await db
      .select({ name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId));
    if (!org || org.status !== "active") return null;
    return { name: org.name };
  });

const registrationSchema = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional(),
  birthMonth: z.number().int().min(1).max(12).optional(),
  birthDay: z.number().int().min(1).max(31).optional(),
  birthYear: z.number().int().min(1900).optional(),
  notes: z.string().optional(),
});

// Public — a prospective member submits this from the org's own
// /register/$organizationId link, no account needed. Never writes directly
// into `members`; Admin/Pastor review it first (see approve/reject below).
export const submitMemberRegistrationFn = createServerFn({ method: "POST" })
  .validator(registrationSchema)
  .handler(async ({ data }) => {
    const [org] = await db
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId));
    if (!org || org.status !== "active") {
      throw new AuthError("This registration link isn't available");
    }

    return withTenant(data.organizationId, async (tx) => {
      const [registration] = await tx
        .insert(memberRegistrations)
        .values({
          organizationId: data.organizationId,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          address: data.address.trim(),
          phone: data.phone || undefined,
          email: data.email || undefined,
          gender: data.gender,
          birthMonth: data.birthMonth,
          birthDay: data.birthDay,
          birthYear: data.birthYear,
          notes: data.notes || undefined,
        })
        .returning();

      const reviewers = await tx
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.role, "admin"), eq(users.role, "pastor")));
      if (reviewers.length > 0) {
        await tx.insert(notifications).values(
          reviewers.map((r) => ({
            organizationId: data.organizationId,
            recipientUserId: r.id,
            type: "member_registration_submitted" as const,
            message: `${data.firstName.trim()} ${data.lastName.trim()} submitted a self-registration for review`,
            entityType: "member_registration",
            entityId: registration.id,
          })),
        );
      }
      return { ok: true as const };
    });
  });

export const listPendingRegistrationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "pastor") {
    throw new AuthError("Only an Admin or Pastor can review registrations");
  }
  return withTenant(session.organizationId, (tx) =>
    tx
      .select()
      .from(memberRegistrations)
      .where(eq(memberRegistrations.status, "pending"))
      .orderBy(asc(memberRegistrations.createdAt)),
  );
});

export const approveMemberRegistrationFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ id: z.string().uuid(), status: z.enum(memberStatusValues).default("active") }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin" && session.role !== "pastor") {
      throw new AuthError("Only an Admin or Pastor can approve a registration");
    }
    return withTenant(session.organizationId, async (tx) => {
      const [registration] = await tx
        .select()
        .from(memberRegistrations)
        .where(eq(memberRegistrations.id, data.id));
      if (!registration) throw new AuthError("Registration not found");
      if (registration.status !== "pending") throw new AuthError("Already reviewed");

      const [member] = await tx
        .insert(members)
        .values({
          organizationId: session.organizationId,
          createdBy: session.userId,
          firstName: registration.firstName,
          lastName: registration.lastName,
          address: registration.address,
          phone: registration.phone ?? undefined,
          email: registration.email ?? undefined,
          gender: registration.gender ?? undefined,
          birthMonth: registration.birthMonth ?? undefined,
          birthDay: registration.birthDay ?? undefined,
          birthYear: registration.birthYear ?? undefined,
          notes: registration.notes ?? undefined,
          status: data.status,
        })
        .returning();

      await tx
        .update(memberRegistrations)
        .set({
          status: "approved",
          reviewedBy: session.userId,
          reviewedAt: new Date(),
          createdMemberId: member.id,
        })
        .where(eq(memberRegistrations.id, data.id));

      return member;
    });
  });

export const rejectMemberRegistrationFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (session.role !== "admin" && session.role !== "pastor") {
      throw new AuthError("Only an Admin or Pastor can reject a registration");
    }
    await withTenant(session.organizationId, (tx) =>
      tx
        .update(memberRegistrations)
        .set({
          status: "rejected",
          reviewedBy: session.userId,
          reviewedAt: new Date(),
          rejectionReason: data.reason || undefined,
        })
        .where(eq(memberRegistrations.id, data.id)),
    );
    return { ok: true as const };
  });
