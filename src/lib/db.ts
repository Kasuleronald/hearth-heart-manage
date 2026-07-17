import Dexie, { type EntityTable } from "dexie";

export type Role = "admin" | "pastor" | "cell_leader" | "leader" | "treasurer";

// A physical church location under the same (single, local) installation.
// branchId: undefined on a record means "applies to the whole church" — not
// every record has to belong to exactly one branch.
export interface Branch {
  id: string;
  name: string;
  address?: string;
  createdAt: number;
}

export interface User {
  id: string;
  email: string; // lowercase, unique — the sole login identifier
  fullName: string;
  role: Role;
  passwordHash: string; // "salt:hash" hex
  memberId?: string; // optional link to this user's own Member record
  financeTier?: "A"; // elevated finance powers for a leader/cell_leader; unset for others
  branchId?: string; // undefined = church-wide access (sees/manages every branch)
  needsEmailUpdate?: boolean; // set when a placeholder email was auto-assigned — see §14
  createdAt: number;
}

// Local-mode password reset: a single-use token an admin generates and relays
// to the user out-of-band (no SMTP). Structured so a real email-delivery layer
// can be swapped in later without changing the token logic itself.
export interface PasswordResetToken {
  token: string;
  userId: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

export type MemberStatus = "visitor" | "member" | "baptized" | "inactive";
// "new_member" and "convert" are older values kept only so existing records
// still render (via a label fallback) — new records use the set below.
export type MemberCategory =
  | "member"
  | "committed"
  | "pastor"
  | "leader"
  | "new_recruit"
  | "new_convert"
  | "visitor"
  | "uncommitted"
  | "fellowship_member"
  | "other"
  | "new_member"
  | "convert";

export interface Household {
  id: string;
  name: string;
  address?: string;
  branchId?: string;
  createdBy?: string; // User.id — who added this record
  createdAt: number;
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  gender?: "male" | "female" | "other";
  phone?: string;
  email?: string;
  // Month + day only by default — many people prefer not to share their
  // birth year, so it's a separate, optional field rather than baked into
  // one full date.
  birthMonth?: number; // 1-12
  birthDay?: number; // 1-31
  birthYear?: number; // optional
  address?: string;
  status: MemberStatus;
  category?: MemberCategory;
  categoryOther?: string; // free-text description when category === "other"
  number?: string; // admin-assigned, zero-padded to at least 3 digits (e.g. "001")
  joinDate?: string;
  householdId?: string;
  isHeadOfHousehold?: boolean;
  cellId?: string;
  classId?: string;
  notes?: string;
  branchId?: string;
  createdBy?: string; // User.id — who added this record
  createdAt: number;
}

export interface Cell {
  id: string;
  name: string;
  meetingDay?: string; // e.g. "Wednesday"
  meetingLocation?: string;
  description?: string;
  leaderId?: string; // User.id
  branchId?: string;
  createdAt: number;
}

// A cell report's offertory has two figures that only converge once finance
// reconciles it: offertoryReported (the leader's claim) vs. offertoryReceived
// (finance's confirmation) — see §9 of the feature brief / src/lib/finance.ts.
export type EditRequestStatus = "none" | "requested" | "approved";

export interface CellMeeting {
  id: string;
  cellId: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  notes?: string;
  offertoryReported: number; // UGX — what the cell leader says they collected
  offertoryReceived: number; // UGX — what finance has confirmed; 0 until acted on
  reportRef: string; // DDMMYYYY + 2-digit sequence for that date
  editRequestStatus: EditRequestStatus;
  branchId?: string; // inherited from the parent cell at creation time
  createdAt: number;
}

export interface CellAttendance {
  id: string;
  meetingId: string;
  memberId: string;
  present: boolean;
}

export type EventType = "sunday_service" | "prayer" | "overnight_prayer" | "special";

export interface ChurchEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  audience: "all" | "leaders"; // who gets notified when this event is created
  notes?: string;
  offertoryAmount?: number; // UGX
  branchId?: string;
  createdAt: number;
}

export interface EventAttendance {
  id: string;
  eventId: string;
  memberId: string;
  present: boolean;
}

export interface DiscipleshipClass {
  id: string;
  name: string;
  facilitatorId?: string; // User.id
  meetingDay?: string;
  meetingLocation?: string;
  description?: string;
  branchId?: string;
  createdAt: number;
}

export interface ClassSession {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  notes?: string;
  offertoryAmount?: number; // UGX
  branchId?: string; // inherited from the parent class at creation time
  createdAt: number;
}

export interface ClassAttendance {
  id: string;
  sessionId: string;
  memberId: string;
  present: boolean;
}

export type GivingCategory = "love_offering" | "tithe" | "first_fruit" | "seed" | "project";

export interface Giving {
  id: string;
  memberId?: string; // giver — mutually exclusive with partnerId; omitted if anonymous
  partnerId?: string; // giver — mutually exclusive with memberId
  category: GivingCategory;
  amount: number; // UGX
  projectId?: string; // only meaningful when category === "project"
  projectName?: string; // legacy free-text project label, kept for old records
  date: string; // YYYY-MM-DD
  notes?: string;
  branchId?: string;
  createdBy?: string; // User.id — who recorded this entry
  createdAt: number;
}

// A fundraising initiative (Building, Bible Distribution, etc.) with target
// amounts. Actual progress is derived from Giving records where
// category === "project" and projectId matches — not stored here.
export interface Project {
  id: string;
  name: string;
  scope?: string;
  financialTarget?: number; // UGX, overall goal
  weeklyTarget?: number; // UGX
  monthlyTarget?: number; // UGX
  branchId?: string;
  createdBy?: string;
  createdAt: number;
}

// An external supporting individual/organization — distinct from Members,
// who are congregation. Giving records can attribute an amount to a partner
// via Giving.partnerId.
export interface Partner {
  id: string;
  name: string;
  type?: "individual" | "organization" | "church";
  phone?: string;
  email?: string;
  pledgeAmount?: number; // UGX, optional recurring commitment
  notes?: string;
  branchId?: string;
  createdBy?: string;
  createdAt: number;
}

// A lightweight leadership directory for non-cell ministries (Ushering, Sound,
// Worship, etc.) — unlike Cells/Classes this has no roster or meeting tracking,
// just a name and an assigned leader.
export interface Department {
  id: string;
  name: string;
  description?: string;
  leaderId?: string; // User.id
  branchId?: string;
  createdAt: number;
}

// departmentId is required — every expense must roll up into some
// department's totals, so departmental report views stay complete.
export interface Expense {
  id: string;
  departmentId: string;
  amount: number; // UGX
  description: string;
  enteredBy: string; // User.id
  branchId?: string;
  createdAt: number;
}

export type RequisitionStatus = "pending" | "approved" | "rejected";

export interface Requisition {
  id: string;
  requestedBy: string; // User.id
  departmentId: string;
  amount: number; // UGX
  reason: string;
  status: RequisitionStatus;
  decidedBy?: string; // User.id
  decidedAt?: number;
  branchId?: string;
  createdAt: number;
}

export interface Settings {
  key: string;
  value: string;
}

// In-app notifications — local-mode: no email/push, just a bell + this table.
// If a real server is added later, only the delivery channel changes; the
// data model and bell UI stay the same.
export type NotificationType =
  | "member_added"
  | "member_deleted"
  | "event_created"
  | "requisition_submitted"
  | "cell_report_submitted";

export interface Notification {
  id: string;
  recipientUserId: string; // User.id
  type: NotificationType;
  message: string;
  entityType?: string; // e.g. "member", "event" — for click-through
  entityId?: string;
  read: boolean;
  createdAt: number;
}

export class MyChurchDB extends Dexie {
  branches!: EntityTable<Branch, "id">;
  users!: EntityTable<User, "id">;
  households!: EntityTable<Household, "id">;
  members!: EntityTable<Member, "id">;
  cells!: EntityTable<Cell, "id">;
  cellMeetings!: EntityTable<CellMeeting, "id">;
  cellAttendance!: EntityTable<CellAttendance, "id">;
  events!: EntityTable<ChurchEvent, "id">;
  eventAttendance!: EntityTable<EventAttendance, "id">;
  classes!: EntityTable<DiscipleshipClass, "id">;
  classSessions!: EntityTable<ClassSession, "id">;
  classAttendance!: EntityTable<ClassAttendance, "id">;
  givings!: EntityTable<Giving, "id">;
  departments!: EntityTable<Department, "id">;
  projects!: EntityTable<Project, "id">;
  partners!: EntityTable<Partner, "id">;
  passwordResetTokens!: EntityTable<PasswordResetToken, "token">;
  settings!: EntityTable<Settings, "key">;
  notifications!: EntityTable<Notification, "id">;
  expenses!: EntityTable<Expense, "id">;
  requisitions!: EntityTable<Requisition, "id">;

  constructor() {
    super("my_church");
    this.version(1).stores({
      users: "id, username, role",
      households: "id, name",
      members: "id, lastName, status, householdId, cellId",
      cells: "id, name, leaderId",
      cellMeetings: "id, cellId, date",
      cellAttendance: "id, meetingId, memberId, [meetingId+memberId]",
      events: "id, date, type",
      eventAttendance: "id, eventId, memberId, [eventId+memberId]",
      settings: "key",
    });
    this.version(2).stores({
      members: "id, lastName, status, category, householdId, cellId, classId",
      classes: "id, name, facilitatorId",
      classSessions: "id, classId, date",
      classAttendance: "id, sessionId, memberId, [sessionId+memberId]",
      givings: "id, memberId, category, date",
    });
    this.version(3).stores({
      departments: "id, name, leaderId",
    });
    this.version(4).stores({
      givings: "id, memberId, partnerId, category, date, projectId",
      projects: "id, name",
      partners: "id, name",
    });
    this.version(5)
      .stores({
        users: "id, &email, role",
        passwordResetTokens: "token, userId",
      })
      .upgrade(async (tx) => {
        // Existing accounts had no email; back-fill a placeholder from their
        // old username so the new unique index doesn't reject the row. The
        // username was already unique, so this stays unique too.
        await tx
          .table("users")
          .toCollection()
          .modify((user: Record<string, unknown>) => {
            if (!user.email) {
              const base = String(user.username ?? user.id)
                .toLowerCase()
                .replace(/[^a-z0-9.]/g, "");
              user.email = `${base}@church.local`;
            }
            delete user.username;
          });
      });
    this.version(6).stores({
      members: "id, lastName, status, category, householdId, cellId, classId, number",
    });
    this.version(7)
      .stores({
        notifications: "id, recipientUserId, read, createdAt",
      })
      .upgrade(async (tx) => {
        // Existing events predate the audience field — default them to "all"
        // to match their current (unrestricted) notification behavior.
        await tx
          .table("events")
          .toCollection()
          .modify((event: Record<string, unknown>) => {
            if (!event.audience) event.audience = "all";
          });
      });
    this.version(8).stores({
      branches: "id, name",
    });
    this.version(9).stores({
      expenses: "id, departmentId",
    });
    this.version(10).stores({
      requisitions: "id, requestedBy, departmentId, status",
    });
    this.version(11)
      .stores({
        cellMeetings: "id, cellId, date, reportRef",
      })
      .upgrade(async (tx) => {
        // Backfill the reconciliation fields for existing meetings: the old
        // free-form offertoryAmount becomes the leader's offertoryReported
        // claim, offertoryReceived starts at 0 (not yet reconciled), and
        // each gets a reportRef in submission order per calendar date.
        // createdAt isn't an indexed field, so sort in memory rather than
        // via .orderBy() (which requires an index and would throw here).
        const seqByDate = new Map<string, number>();
        const table = tx.table("cellMeetings");
        const meetings = (await table.toArray()) as Record<string, unknown>[];
        meetings.sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
        for (const m of meetings) {
          const [y, mo, d] = String(m.date).split("-");
          const prefix = `${d}${mo}${y}`;
          const seq = (seqByDate.get(prefix) ?? 0) + 1;
          seqByDate.set(prefix, seq);
          m.reportRef = `${prefix}${String(seq).padStart(2, "0")}`;
          m.offertoryReported = typeof m.offertoryAmount === "number" ? m.offertoryAmount : 0;
          m.offertoryReceived = 0;
          m.editRequestStatus = "none";
          delete m.offertoryAmount;
          await table.put(m);
        }
      });
    // §14: defensive re-pass, independent of v5's original email backfill —
    // any user row that still has a missing/empty email (e.g. one that
    // slipped through an earlier partial migration) gets a unique
    // placeholder here too, so no admin is ever locked out of login by a
    // missing email. Existing data under the old schema: rows with no email
    // get `user-{id}@local.invalid` (or a username-derived one if that
    // legacy field is somehow still present), flagged via
    // needsEmailUpdate so the UI can prompt them to set a real one.
    this.version(12)
      .stores({})
      .upgrade(async (tx) => {
        const table = tx.table("users");
        const users = (await table.toArray()) as Record<string, unknown>[];
        const takenEmails = new Set(
          users.map((u) => u.email).filter((e): e is string => typeof e === "string" && e !== ""),
        );
        for (const user of users) {
          if (user.email) continue;
          const base =
            String(user.username ?? `user-${user.id}`)
              .toLowerCase()
              .replace(/[^a-z0-9.]/g, "") || `user-${user.id}`;
          let email = `${base}@local.invalid`;
          let n = 1;
          while (takenEmails.has(email)) {
            email = `${base}${n}@local.invalid`;
            n++;
          }
          takenEmails.add(email);
          user.email = email;
          user.needsEmailUpdate = true;
          await table.put(user);
        }
      });
    this.version(13)
      .stores({})
      .upgrade(async (tx) => {
        // Split the old single `dob: "YYYY-MM-DD"` string into separate
        // month/day/year fields — year becomes optional going forward.
        const table = tx.table("members");
        const members = (await table.toArray()) as Record<string, unknown>[];
        for (const m of members) {
          if (typeof m.dob === "string" && m.dob) {
            const [y, mo, d] = m.dob.split("-").map(Number);
            if (!Number.isNaN(mo) && !Number.isNaN(d)) {
              m.birthMonth = mo;
              m.birthDay = d;
              if (!Number.isNaN(y) && y > 1900) m.birthYear = y;
            }
          }
          delete m.dob;
          await table.put(m);
        }
      });
  }
}

export const db = new MyChurchDB();

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "March 14" — or "March 14, 1990" only if a birth year was shared.
export function formatBirthday(
  m: Pick<Member, "birthMonth" | "birthDay" | "birthYear">,
): string | undefined {
  if (!m.birthMonth || !m.birthDay) return undefined;
  const monthName = MONTH_NAMES[m.birthMonth - 1];
  return m.birthYear ? `${monthName} ${m.birthDay}, ${m.birthYear}` : `${monthName} ${m.birthDay}`;
}

// Suggests the next member number: highest existing numeric value + 1,
// zero-padded to at least 3 digits. Admin can accept or override on the
// member detail page — numbers are never auto-assigned at creation.
export async function getNextMemberNumber(): Promise<string> {
  const members = await db.members.toArray();
  const highest = members.reduce((max, m) => {
    const n = m.number ? parseInt(m.number, 10) : NaN;
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return String(highest + 1).padStart(3, "0");
}

// ---- Cascading deletes ----
// Dexie has no foreign keys, so related rows must be cleaned up manually.
export async function deleteMemberCascade(memberId: string) {
  await db.transaction(
    "rw",
    [db.members, db.cellAttendance, db.eventAttendance, db.classAttendance, db.givings],
    async () => {
      await db.cellAttendance.where("memberId").equals(memberId).delete();
      await db.eventAttendance.where("memberId").equals(memberId).delete();
      await db.classAttendance.where("memberId").equals(memberId).delete();
      // Giving history is kept even if the member record is removed; just unlink it.
      const givings = await db.givings.where("memberId").equals(memberId).toArray();
      await Promise.all(givings.map((g) => db.givings.update(g.id, { memberId: undefined })));
      await db.members.delete(memberId);
    },
  );
}

export async function deleteCellCascade(cellId: string) {
  await db.transaction(
    "rw",
    [db.cells, db.members, db.cellMeetings, db.cellAttendance],
    async () => {
      const meetings = await db.cellMeetings.where("cellId").equals(cellId).toArray();
      const meetingIds = meetings.map((m) => m.id);
      if (meetingIds.length > 0) {
        await db.cellAttendance.where("meetingId").anyOf(meetingIds).delete();
      }
      await db.cellMeetings.where("cellId").equals(cellId).delete();
      const members = await db.members.where("cellId").equals(cellId).toArray();
      await Promise.all(members.map((m) => db.members.update(m.id, { cellId: undefined })));
      await db.cells.delete(cellId);
    },
  );
}

export async function deleteClassCascade(classId: string) {
  await db.transaction(
    "rw",
    [db.classes, db.members, db.classSessions, db.classAttendance],
    async () => {
      const sessions = await db.classSessions.where("classId").equals(classId).toArray();
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        await db.classAttendance.where("sessionId").anyOf(sessionIds).delete();
      }
      await db.classSessions.where("classId").equals(classId).delete();
      const members = await db.members.where("classId").equals(classId).toArray();
      await Promise.all(members.map((m) => db.members.update(m.id, { classId: undefined })));
      await db.classes.delete(classId);
    },
  );
}

export async function deleteEventCascade(eventId: string) {
  await db.transaction("rw", [db.events, db.eventAttendance], async () => {
    await db.eventAttendance.where("eventId").equals(eventId).delete();
    await db.events.delete(eventId);
  });
}

export async function deleteProjectCascade(projectId: string) {
  await db.transaction("rw", [db.projects, db.givings], async () => {
    const givings = await db.givings.where("projectId").equals(projectId).toArray();
    await Promise.all(givings.map((g) => db.givings.update(g.id, { projectId: undefined })));
    await db.projects.delete(projectId);
  });
}

export async function deletePartnerCascade(partnerId: string) {
  await db.transaction("rw", [db.partners, db.givings], async () => {
    const givings = await db.givings.where("partnerId").equals(partnerId).toArray();
    await Promise.all(givings.map((g) => db.givings.update(g.id, { partnerId: undefined })));
    await db.partners.delete(partnerId);
  });
}

// Clears this user as the leader of whichever department (if any) they head —
// used when a user is deleted or their role changes away from "leader".
export async function unassignDepartmentLeader(userId: string) {
  const led = await db.departments.where("leaderId").equals(userId).toArray();
  await Promise.all(led.map((d) => db.departments.update(d.id, { leaderId: undefined })));
}

// Expense.departmentId and Requisition.departmentId are both required (not
// optional), so unlike other cascades those rows can't be left dangling with
// the link cleared — they're deleted along with their department.
export async function deleteDepartmentCascade(departmentId: string) {
  await db.transaction("rw", [db.departments, db.expenses, db.requisitions], async () => {
    await db.expenses.where("departmentId").equals(departmentId).delete();
    await db.requisitions.where("departmentId").equals(departmentId).delete();
    await db.departments.delete(departmentId);
  });
}

// Deleting a branch doesn't delete its records — it un-scopes them back to
// "whole church" (branchId: undefined), same treatment as unlinking a leader.
// branchId isn't an indexed field (every list page already filters it in
// memory, same as the rest of the app), so this scans + filters in JS rather
// than using a Dexie `.where()` index query.
export async function deleteBranchCascade(branchId: string) {
  const tables = [
    db.users,
    db.households,
    db.members,
    db.cells,
    db.cellMeetings,
    db.events,
    db.classes,
    db.givings,
    db.departments,
    db.projects,
    db.partners,
  ];
  await db.transaction("rw", [db.branches, ...tables], async () => {
    for (const table of tables) {
      const rows = await table
        .filter((row) => (row as { branchId?: string }).branchId === branchId)
        .toArray();
      await Promise.all(
        rows.map((row) => table.update((row as { id: string }).id, { branchId: undefined })),
      );
    }
    await db.branches.delete(branchId);
  });
}

export async function deleteUserCascade(userId: string) {
  await db.transaction("rw", [db.users, db.departments], async () => {
    await unassignDepartmentLeader(userId);
    await db.users.delete(userId);
  });
}

// ---- Department seeding ----
// A starter set of ministries common to most churches, so the admin doesn't
// have to type them all in by hand. Runs on first admin setup (login.tsx) and
// can also be re-run on demand from the Departments page — safe either way,
// since it only adds names that don't already exist.
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

export async function seedDefaultDepartments() {
  const existing = await db.departments.toArray();
  const existingNames = new Set(existing.map((d) => d.name.trim().toLowerCase()));
  const missing = DEFAULT_DEPARTMENTS.filter((name) => !existingNames.has(name.toLowerCase()));
  if (missing.length === 0) return;
  const now = Date.now();
  await db.departments.bulkAdd(missing.map((name) => ({ id: uid(), name, createdAt: now })));
}

// ---- Backup & restore ----
// Every table except `users` (credentials shouldn't leave the device via a backup file).
const BACKUP_TABLES = [
  "branches",
  "households",
  "members",
  "cells",
  "cellMeetings",
  "cellAttendance",
  "events",
  "eventAttendance",
  "classes",
  "classSessions",
  "classAttendance",
  "givings",
  "departments",
  "projects",
  "partners",
  "expenses",
  "requisitions",
] as const;

export interface DatabaseBackup {
  format: "my-church-backup";
  version: 1;
  exportedAt: string;
  tables: Record<(typeof BACKUP_TABLES)[number], unknown[]>;
}

export async function exportDatabase(): Promise<DatabaseBackup> {
  const tables = {} as DatabaseBackup["tables"];
  for (const name of BACKUP_TABLES) {
    tables[name] = await db.table(name).toArray();
  }
  return {
    format: "my-church-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export async function importDatabase(backup: DatabaseBackup, mode: "replace" | "merge") {
  if (backup.format !== "my-church-backup") {
    throw new Error("This file isn't a My Church backup.");
  }
  const dexieTables = BACKUP_TABLES.map((name) => db.table(name));
  await db.transaction("rw", dexieTables, async () => {
    for (const name of BACKUP_TABLES) {
      const rows = backup.tables[name] ?? [];
      if (mode === "replace") await db.table(name).clear();
      await db.table(name).bulkPut(rows as never[]);
    }
  });
}
