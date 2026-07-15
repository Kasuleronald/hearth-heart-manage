import Dexie, { type EntityTable } from "dexie";

export type Role = "admin" | "pastor" | "cell_leader";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  passwordHash: string; // "salt:hash" hex
  createdAt: number;
}

export type MemberStatus = "visitor" | "member" | "baptized" | "inactive";

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
  joinDate?: string;
  householdId?: string;
  isHeadOfHousehold?: boolean;
  cellId?: string;
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
  createdAt: number;
}

export interface CellAttendance {
  id: string;
  meetingId: string;
  memberId: string;
  present: boolean;
}

export type EventType = "sunday_service" | "prayer" | "special";

export interface ChurchEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  notes?: string;
  createdAt: number;
}

export interface EventAttendance {
  id: string;
  eventId: string;
  memberId: string;
  present: boolean;
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
  }
}

export const db = new MyChurchDB();

export const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
