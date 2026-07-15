import Dexie, { type EntityTable } from "dexie";

export type Role = "admin" | "pastor" | "cell_leader" | "leader" | "treasurer";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  passwordHash: string; // "salt:hash" hex
  createdAt: number;
}

export type MemberStatus = "visitor" | "member" | "baptized" | "inactive";
export type MemberCategory = "pastor" | "leader" | "member" | "new_member" | "convert";

export interface Household {
  id: string;
  name: string;
  address?: string;
  createdAt: number;
}

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  gender?: "male" | "female" | "other";
  phone?: string;
  email?: string;
  dob?: string; // YYYY-MM-DD
  address?: string;
  status: MemberStatus;
  category?: MemberCategory;
  joinDate?: string;
  householdId?: string;
  isHeadOfHousehold?: boolean;
  cellId?: string;
  classId?: string;
  notes?: string;
  createdAt: number;
}

export interface Cell {
  id: string;
  name: string;
  meetingDay?: string; // e.g. "Wednesday"
  meetingLocation?: string;
  description?: string;
  leaderId?: string; // User.id
  createdAt: number;
}

export interface CellMeeting {
  id: string;
  cellId: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  notes?: string;
  offertoryAmount?: number; // UGX
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
  notes?: string;
  offertoryAmount?: number; // UGX
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
  createdAt: number;
}

export interface ClassSession {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  notes?: string;
  offertoryAmount?: number; // UGX
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
  memberId?: string; // omitted for anonymous givings
  category: GivingCategory;
  amount: number; // UGX
  projectName?: string; // only meaningful when category === "project"
  date: string; // YYYY-MM-DD
  notes?: string;
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
  createdAt: number;
}

export interface Settings {
  key: string;
  value: string;
}

export class MyChurchDB extends Dexie {
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
  settings!: EntityTable<Settings, "key">;

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
  }
}

export const db = new MyChurchDB();

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

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

// Clears this user as the leader of whichever department (if any) they head —
// used when a user is deleted or their role changes away from "leader".
export async function unassignDepartmentLeader(userId: string) {
  const led = await db.departments.where("leaderId").equals(userId).toArray();
  await Promise.all(led.map((d) => db.departments.update(d.id, { leaderId: undefined })));
}

export async function deleteUserCascade(userId: string) {
  await db.transaction("rw", [db.users, db.departments], async () => {
    await unassignDepartmentLeader(userId);
    await db.users.delete(userId);
  });
}

// ---- Department seeding ----
// A starter set of ministries common to most churches, so the admin doesn't
// have to type them all in by hand on day one. Only ever run once, guarded by
// the departments table being empty (see login.tsx first-run setup).
const DEFAULT_DEPARTMENTS = [
  "Protocol",
  "Ushering",
  "Hospitality",
  "Missions",
  "Service",
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
  if ((await db.departments.count()) > 0) return;
  const now = Date.now();
  await db.departments.bulkAdd(
    DEFAULT_DEPARTMENTS.map((name) => ({ id: uid(), name, createdAt: now })),
  );
}

// ---- Backup & restore ----
// Every table except `users` (credentials shouldn't leave the device via a backup file).
const BACKUP_TABLES = [
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
