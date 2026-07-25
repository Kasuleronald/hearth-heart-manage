import { sql } from "drizzle-orm";
import {
  pgTable,
  pgPolicy,
  pgRole,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  primaryKey,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type {
  Role,
  MemberStatus,
  MemberCategory,
  EventType,
  EventRecurrence,
  GivingCategory,
  RequisitionStatus,
  PledgeCause,
  PledgeStatus,
  TestimonyCategory,
  NotificationType,
  EditRequestStatus,
  CellExpenseStatus,
  DepartmentModule,
  ExpenseStatus,
} from "@/lib/db";

// This mirrors src/lib/db.ts's shape closely (same field names/semantics) so
// the eventual per-module migration stays mechanical. Once every module is
// migrated, src/lib/db.ts (Dexie) is retired and these `import type`s should
// move to a shared, framework-agnostic types file instead of pointing at it.

// ---- Tenant isolation ----
//
// Every table below that belongs to a specific church carries a required
// `organizationId` and is covered by a Postgres Row-Level Security policy
// scoped to `current_setting('app.current_org_id')` — set once per request
// by src/server/db/client.ts right after a session is resolved. This is a
// defense-in-depth backstop *underneath* the application-level `WHERE
// organization_id = ...` every server function also applies: even a bug in a
// query can't return another church's rows, because Postgres itself won't.
//
// The app's Postgres connection must run as `app_user` (a non-owner role
// with only DML grants — see scripts/db-setup.sql), not as the migration
// owner role, or these policies would be bypassed entirely (RLS policies
// don't apply to a table's owner by default).
export const appUser = pgRole("app_user", { createDb: false, createRole: false }).existing();

function tenantPolicy(organizationId: AnyPgColumn) {
  return pgPolicy("tenant_isolation", {
    for: "all",
    to: appUser,
    using: sql`${organizationId} = current_setting('app.current_org_id', true)::uuid`,
    withCheck: sql`${organizationId} = current_setting('app.current_org_id', true)::uuid`,
  });
}

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---- Platform level (outside any single church) ----

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull().default("church"), // "church" | "ministry" | "organization"
  status: text("status").notNull().default("active"), // "active" | "suspended" | "disabled"
  timezone: text("timezone"),
  // Set by the org's own Admin (not SuperAdmin) once there's an in-church
  // settings UI backed by this table — shown at the top of the app for
  // every signed-in user. A URL, not a stored blob (unlike the interim
  // local-only implementation's base64 data URL) — logos belong in object
  // storage/CDN once one exists, not row data.
  logoUrl: text("logo_url"),
  ...timestamps,
});

// SuperAdmin accounts. Deliberately separate from `users` — a platform owner
// isn't a member of any single church, so reusing the in-church Role enum
// (or table) here would conflate two different trust boundaries.
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("platform_admins_email_idx").on(t.email)],
);

// Server-side sessions for BOTH in-church users and platform admins — an
// opaque id in an httpOnly cookie references a row here, rather than a
// signed/JWT blob the client could inspect or that can't be revoked.
// Exactly one of userId / platformAdminId is set.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  platformAdminId: uuid("platform_admin_id").references(() => platformAdmins.id, {
    onDelete: "cascade",
  }),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

// Deliberately NOT RLS-protected, and the only place an in-church user's
// password hash is stored. Login is a plain email+password form with no
// organization selector (see `users`'s email-uniqueness comment below), so
// the server must be able to look a user up by email BEFORE it knows which
// organization's RLS context to set — querying the (RLS-protected) `users`
// table itself can't do that chicken-and-egg lookup. This table exists
// purely to break that cycle: login resolves organizationId + userId here
// first, verifies the password, THEN opens a withTenant() transaction to
// load the real `users` row. Kept in sync with `users.email` at exactly the
// three places a user's login identity changes: create, update email,
// delete — see src/server/auth.ts.
export const userCredentials = pgTable("user_credentials", {
  email: text("email").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash"), // null until an invited admin sets one
});

// ---- Branch (within-church, multi-location — NOT the tenant boundary) ----

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    leadPastorId: uuid("lead_pastor_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    startDate: text("start_date"), // YYYY-MM-DD
    ...timestamps,
  },
  (t) => [index("branches_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

// ---- Users (in-church accounts) ----

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role").notNull().$type<Role>(),
    memberId: uuid("member_id").references((): AnyPgColumn => members.id, { onDelete: "set null" }),
    financeTier: text("finance_tier").$type<"A">(),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    needsEmailUpdate: boolean("needs_email_update").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("users_org_idx").on(t.organizationId),
    // Globally unique (not just per-organization): login is a plain
    // email+password form with no organization selector or subdomain
    // routing (Phase 0 scope) — the server resolves which organization a
    // user belongs to from this row, so two churches can't share an email
    // for now. Matches the original single-tenant app's own "email is the
    // sole login identifier" rule.
    uniqueIndex("users_email_idx").on(t.email),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

// Deliberately NOT RLS-protected — same chicken-and-egg reason as
// userCredentials above: a "set your password" link only carries the token
// itself, so the server must be able to look it up before it knows which
// organization's RLS context to set. The token is a high-entropy random
// UUID, so this isn't a meaningful exposure — RLS guards against
// legitimately-scoped-but-wrong-tenant queries, not secret-guessing, and an
// exact `WHERE token = $1` lookup is precise regardless.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    token: uuid("token").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("password_reset_tokens_org_idx").on(t.organizationId)],
);

// ---- Households & Members ----

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("households_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    gender: text("gender").$type<"male" | "female" | "other">(),
    phone: text("phone"),
    email: text("email"),
    birthMonth: integer("birth_month"),
    birthDay: integer("birth_day"),
    birthYear: integer("birth_year"),
    lastBirthdayReminderYear: integer("last_birthday_reminder_year"),
    address: text("address"),
    status: text("status").notNull().$type<MemberStatus>(),
    category: text("category").$type<MemberCategory>(),
    categoryOther: text("category_other"),
    number: text("number"),
    joinDate: text("join_date"), // YYYY-MM-DD
    householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
    isHeadOfHousehold: boolean("is_head_of_household").notNull().default(false),
    cellId: uuid("cell_id").references((): AnyPgColumn => cells.id, { onDelete: "set null" }),
    classId: uuid("class_id").references((): AnyPgColumn => classes.id, { onDelete: "set null" }),
    notes: text("notes"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("members_org_idx").on(t.organizationId),
    index("members_last_name_idx").on(t.organizationId, t.lastName),
    index("members_household_idx").on(t.householdId),
    index("members_cell_idx").on(t.cellId),
    index("members_class_idx").on(t.classId),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

// ---- Cells (small groups) ----

export const cells = pgTable(
  "cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    meetingDay: text("meeting_day"),
    meetingLocation: text("meeting_location"),
    description: text("description"),
    leaderId: uuid("leader_id").references(() => users.id, { onDelete: "set null" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("cells_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

export const cellMeetings = pgTable(
  "cell_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => cells.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    topic: text("topic"),
    notes: text("notes"),
    offertoryReported: integer("offertory_reported").notNull().default(0),
    offertoryReceived: integer("offertory_received").notNull().default(0),
    reportRef: text("report_ref").notNull(),
    editRequestStatus: text("edit_request_status")
      .notNull()
      .$type<EditRequestStatus>()
      .default("none"),
    expenseClaimed: integer("expense_claimed"),
    expenseDescription: text("expense_description"),
    expenseStatus: text("expense_status").$type<CellExpenseStatus>(),
    expenseApproved: integer("expense_approved"),
    expenseId: uuid("expense_id").references((): AnyPgColumn => expenses.id, {
      onDelete: "set null",
    }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("cell_meetings_org_idx").on(t.organizationId),
    index("cell_meetings_cell_idx").on(t.cellId),
    index("cell_meetings_date_idx").on(t.organizationId, t.date),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

export const cellAttendance = pgTable(
  "cell_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => cellMeetings.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    present: boolean("present").notNull().default(false),
  },
  (t) => [
    index("cell_attendance_org_idx").on(t.organizationId),
    index("cell_attendance_meeting_idx").on(t.meetingId),
    uniqueIndex("cell_attendance_meeting_member_idx").on(t.meetingId, t.memberId),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

// ---- Events ----

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    startTime: text("start_time"), // HH:MM
    endTime: text("end_time"), // HH:MM
    type: text("type").notNull().$type<EventType>(),
    audience: text("audience").notNull().$type<"all" | "leaders">().default("all"),
    notes: text("notes"),
    offertoryAmount: integer("offertory_amount"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    recurrenceId: uuid("recurrence_id"),
    recurrence: jsonb("recurrence").$type<EventRecurrence>(),
    ...timestamps,
  },
  (t) => [
    index("events_org_idx").on(t.organizationId),
    index("events_date_idx").on(t.organizationId, t.date),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

export const eventAttendance = pgTable(
  "event_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    present: boolean("present").notNull().default(false),
  },
  (t) => [
    index("event_attendance_org_idx").on(t.organizationId),
    index("event_attendance_event_idx").on(t.eventId),
    uniqueIndex("event_attendance_event_member_idx").on(t.eventId, t.memberId),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

// ---- Discipleship classes ----

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    facilitatorId: uuid("facilitator_id").references(() => users.id, { onDelete: "set null" }),
    meetingDay: text("meeting_day"),
    meetingLocation: text("meeting_location"),
    description: text("description"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("classes_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

export const classSessions = pgTable(
  "class_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    topic: text("topic"),
    notes: text("notes"),
    offertoryAmount: integer("offertory_amount"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("class_sessions_org_idx").on(t.organizationId),
    index("class_sessions_class_idx").on(t.classId),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

export const classAttendance = pgTable(
  "class_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    present: boolean("present").notNull().default(false),
  },
  (t) => [
    index("class_attendance_org_idx").on(t.organizationId),
    index("class_attendance_session_idx").on(t.sessionId),
    uniqueIndex("class_attendance_session_member_idx").on(t.sessionId, t.memberId),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

// ---- Givings, Projects, Partners ----

export const givings = pgTable(
  "givings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    partnerId: uuid("partner_id").references((): AnyPgColumn => partners.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull().$type<GivingCategory>(),
    amount: integer("amount").notNull(),
    projectId: uuid("project_id").references((): AnyPgColumn => projects.id, {
      onDelete: "set null",
    }),
    projectName: text("project_name"), // legacy free-text label, kept for old records
    date: text("date").notNull(), // YYYY-MM-DD
    notes: text("notes"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("givings_org_idx").on(t.organizationId),
    index("givings_date_idx").on(t.organizationId, t.date),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    scope: text("scope"),
    financialTarget: integer("financial_target"),
    weeklyTarget: integer("weekly_target"),
    monthlyTarget: integer("monthly_target"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("projects_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<"individual" | "organization" | "church">(),
    phone: text("phone"),
    email: text("email"),
    pledgeAmount: integer("pledge_amount"),
    notes: text("notes"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("partners_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

// ---- Departments, Expenses, Requisitions ----

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    leaderId: uuid("leader_id").references(() => users.id, { onDelete: "set null" }),
    // Modules (Givings/Projects/Pledges/Partners) this department's leader
    // is additionally granted view access to, on top of whatever their
    // account role already grants — see canAccessGivings() etc. in
    // src/lib/auth.ts. A leader can only lead one department, so this is
    // their whole extra grant set.
    allowedModules: jsonb("allowed_modules").$type<DepartmentModule[]>().notNull().default([]),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("departments_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    enteredBy: uuid("entered_by").references(() => users.id, { onDelete: "set null" }),
    // Directly-entered (Admin/Treasurer) expenses default "approved" and
    // count immediately, unchanged from before this column existed. A
    // department leader's accountability submission against an approved
    // Requisition starts "pending" and only counts once Finance approves it.
    status: text("status").notNull().$type<ExpenseStatus>().default("approved"),
    requisitionId: uuid("requisition_id").references((): AnyPgColumn => requisitions.id, {
      onDelete: "set null",
    }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("expenses_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

export const requisitions = pgTable(
  "requisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().$type<RequisitionStatus>().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("requisitions_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

// ---- Pledges ----

export const pledges = pgTable(
  "pledges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // who is pledging — may not be a Member/Partner record
    amount: integer("amount").notNull(),
    collectionDate: text("collection_date").notNull(), // YYYY-MM-DD, target date
    cause: text("cause").notNull().$type<PledgeCause>(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    description: text("description"),
    bookedBy: uuid("booked_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().$type<PledgeStatus>().default("active"),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("pledges_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

// ---- Testimonies ----

export const testimonies = pgTable(
  "testimonies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull().$type<TestimonyCategory>(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [index("testimonies_org_idx").on(t.organizationId), tenantPolicy(t.organizationId)],
).enableRLS();

// ---- Settings (per-organization key/value) ----

export const settings = pgTable(
  "settings",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.key] }), tenantPolicy(t.organizationId)],
).enableRLS();

// ---- Notifications ----

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<NotificationType>(),
    message: text("message").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    read: boolean("read").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("notifications_org_idx").on(t.organizationId),
    index("notifications_recipient_idx").on(t.recipientUserId, t.read),
    tenantPolicy(t.organizationId),
  ],
).enableRLS();
