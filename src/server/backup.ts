import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "./db/client";
import {
  branches,
  households,
  members,
  cells,
  cellMeetings,
  cellAttendance,
  events,
  eventAttendance,
  classes,
  classSessions,
  classAttendance,
  givings,
  departments,
  projects,
  partners,
  expenses,
  requisitions,
  testimonies,
  pledges,
  users,
} from "./db/schema";
import { requireSession, AuthError } from "./auth";
import type { DepartmentModule } from "@/lib/db";

const BACKUP_FORMAT = "my-church-backup";
const BACKUP_VERSION = 2;

// Every table except `users`/credentials — accounts aren't included in a
// data backup, same rule as the local-storage version this replaces.
const TABLE_NAMES = [
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
  "testimonies",
  "pledges",
] as const;
type TableName = (typeof TABLE_NAMES)[number];

export interface OrgBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  organizationName: string;
  exportedAt: string;
  tables: Record<TableName, Record<string, unknown>[]>;
}

export const exportOrgDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  return withTenant(session.organizationId, async (tx) => {
    const tables = {
      branches: await tx.select().from(branches),
      households: await tx.select().from(households),
      members: await tx.select().from(members),
      cells: await tx.select().from(cells),
      cellMeetings: await tx.select().from(cellMeetings),
      cellAttendance: await tx.select().from(cellAttendance),
      events: await tx.select().from(events),
      eventAttendance: await tx.select().from(eventAttendance),
      classes: await tx.select().from(classes),
      classSessions: await tx.select().from(classSessions),
      classAttendance: await tx.select().from(classAttendance),
      givings: await tx.select().from(givings),
      departments: await tx.select().from(departments),
      projects: await tx.select().from(projects),
      partners: await tx.select().from(partners),
      expenses: await tx.select().from(expenses),
      requisitions: await tx.select().from(requisitions),
      testimonies: await tx.select().from(testimonies),
      pledges: await tx.select().from(pledges),
    };

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      organizationName: session.organizationName,
      exportedAt: new Date().toISOString(),
      tables,
    };
  });
});

function row(r: Record<string, unknown>) {
  return r as Record<string, never>;
}

function str(r: Record<string, unknown>, key: string): string {
  return r[key] as string;
}
function opt(r: Record<string, unknown>, key: string) {
  const v = r[key];
  return v === undefined || v === null ? undefined : v;
}
function date(r: Record<string, unknown>, key: string): Date | undefined {
  const v = r[key];
  return v ? new Date(v as string) : undefined;
}
// Only keep a user reference if that user still exists in this org — a
// backup restored after the referenced user was deleted (or restored into
// a different org entirely) would otherwise violate the foreign key.
function safeUser(id: unknown, validUserIds: Set<string>): string | undefined {
  return typeof id === "string" && validUserIds.has(id) ? id : undefined;
}

const importSchema = z.object({
  mode: z.enum(["replace", "merge"]),
  backup: z.object({
    format: z.string(),
    version: z.number().optional(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});

export const importOrgDataFn = createServerFn({ method: "POST" })
  .validator(importSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (data.backup.format !== BACKUP_FORMAT) {
      throw new AuthError("This file isn't a My Church backup.");
    }
    if (!data.backup.version || data.backup.version < BACKUP_VERSION) {
      throw new AuthError(
        "This backup was exported from local browser storage before the app moved to the real database — it can't be restored. Export a fresh backup from this page instead.",
      );
    }
    const t = data.backup.tables as OrgBackup["tables"];
    const orgId = session.organizationId;
    const skipped: Partial<Record<TableName, number>> = {};

    await withTenant(orgId, async (tx) => {
      const validUserIds = new Set(
        (await tx.select({ id: users.id }).from(users)).map((u) => u.id),
      );

      if (data.mode === "replace") {
        for (const name of TABLE_NAMES) {
          await deleteAll(tx, name, orgId);
        }
      }

      // Parents before children — a row referencing a not-yet-inserted
      // parent would fail its foreign key check.
      await upsertBranches(tx, orgId, t.branches ?? []);
      await upsertDepartments(tx, orgId, t.departments ?? [], validUserIds);
      await upsertCells(tx, orgId, t.cells ?? [], validUserIds);
      await upsertClasses(tx, orgId, t.classes ?? [], validUserIds);
      await upsertHouseholds(tx, orgId, t.households ?? [], validUserIds);
      await upsertMembers(tx, orgId, t.members ?? [], validUserIds);
      await upsertProjects(tx, orgId, t.projects ?? [], validUserIds);
      await upsertPartners(tx, orgId, t.partners ?? [], validUserIds);

      // cellMeetings.expenseId is filled in afterward (phase D) — expenses
      // don't exist yet at this point, and the column is nullable.
      await upsertCellMeetings(tx, orgId, t.cellMeetings ?? []);
      await upsertClassSessions(tx, orgId, t.classSessions ?? []);
      await upsertEvents(tx, orgId, t.events ?? []);
      await upsertRequisitions(tx, orgId, t.requisitions ?? [], validUserIds);
      await upsertExpenses(tx, orgId, t.expenses ?? [], validUserIds);

      await upsertCellAttendance(tx, orgId, t.cellAttendance ?? []);
      await upsertClassAttendance(tx, orgId, t.classAttendance ?? []);
      await upsertEventAttendance(tx, orgId, t.eventAttendance ?? []);
      await upsertGivings(tx, orgId, t.givings ?? [], validUserIds);
      await upsertPledges(tx, orgId, t.pledges ?? [], validUserIds);
      skipped.testimonies = await upsertTestimonies(tx, orgId, t.testimonies ?? [], validUserIds);

      // Phase D: now that expenses exist, restore the cellMeetings ->
      // expenses link the backup had.
      for (const r of t.cellMeetings ?? []) {
        const expenseId = opt(row(r), "expenseId");
        if (expenseId) {
          await tx
            .update(cellMeetings)
            .set({ expenseId: expenseId as string })
            .where(eq(cellMeetings.id, str(row(r), "id")));
        }
      }
    });

    return { ok: true, skipped };
  });

async function deleteAll(tx: Tx, name: TableName, orgId: string) {
  const table = {
    branches,
    households,
    members,
    cells,
    cellMeetings,
    cellAttendance,
    events,
    eventAttendance,
    classes,
    classSessions,
    classAttendance,
    givings,
    departments,
    projects,
    partners,
    expenses,
    requisitions,
    testimonies,
    pledges,
  }[name];
  await tx.delete(table).where(eq(table.organizationId, orgId));
}

async function upsertBranches(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    await tx
      .insert(branches)
      .values({
        id: str(row(r), "id"),
        organizationId: orgId,
        name: str(row(r), "name"),
        address: opt(row(r), "address") as string | undefined,
        leadPastorId: undefined,
        startDate: opt(row(r), "startDate") as string | undefined,
        createdAt: date(row(r), "createdAt"),
      })
      .onConflictDoUpdate({
        target: branches.id,
        set: {
          name: str(row(r), "name"),
          address: opt(row(r), "address") as string | undefined,
          startDate: opt(row(r), "startDate") as string | undefined,
        },
      });
  }
}

async function upsertDepartments(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      description: opt(row(r), "description") as string | undefined,
      leaderId: safeUser(row(r).leaderId, validUserIds),
      allowedModules: (opt(row(r), "allowedModules") as DepartmentModule[] | undefined) ?? [],
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(departments)
      .values(values)
      .onConflictDoUpdate({ target: departments.id, set: values });
  }
}

async function upsertCells(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      meetingDay: opt(row(r), "meetingDay") as string | undefined,
      meetingLocation: opt(row(r), "meetingLocation") as string | undefined,
      description: opt(row(r), "description") as string | undefined,
      leaderId: safeUser(row(r).leaderId, validUserIds),
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx.insert(cells).values(values).onConflictDoUpdate({ target: cells.id, set: values });
  }
}

async function upsertClasses(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      facilitatorId: safeUser(row(r).facilitatorId, validUserIds),
      meetingDay: opt(row(r), "meetingDay") as string | undefined,
      meetingLocation: opt(row(r), "meetingLocation") as string | undefined,
      description: opt(row(r), "description") as string | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx.insert(classes).values(values).onConflictDoUpdate({ target: classes.id, set: values });
  }
}

async function upsertHouseholds(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      address: opt(row(r), "address") as string | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdBy: safeUser(row(r).createdBy, validUserIds),
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(households)
      .values(values)
      .onConflictDoUpdate({ target: households.id, set: values });
  }
}

async function upsertMembers(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      firstName: str(row(r), "firstName"),
      lastName: str(row(r), "lastName"),
      gender: opt(row(r), "gender") as "male" | "female" | "other" | undefined,
      phone: opt(row(r), "phone") as string | undefined,
      email: opt(row(r), "email") as string | undefined,
      birthMonth: opt(row(r), "birthMonth") as number | undefined,
      birthDay: opt(row(r), "birthDay") as number | undefined,
      birthYear: opt(row(r), "birthYear") as number | undefined,
      lastBirthdayReminderYear: opt(row(r), "lastBirthdayReminderYear") as number | undefined,
      address: opt(row(r), "address") as string | undefined,
      status: str(row(r), "status") as never,
      category: opt(row(r), "category") as never,
      categoryOther: opt(row(r), "categoryOther") as string | undefined,
      number: opt(row(r), "number") as string | undefined,
      joinDate: opt(row(r), "joinDate") as string | undefined,
      householdId: opt(row(r), "householdId") as string | undefined,
      isHeadOfHousehold: (opt(row(r), "isHeadOfHousehold") as boolean | undefined) ?? false,
      cellId: opt(row(r), "cellId") as string | undefined,
      classId: opt(row(r), "classId") as string | undefined,
      notes: opt(row(r), "notes") as string | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdBy: safeUser(row(r).createdBy, validUserIds),
      createdAt: date(row(r), "createdAt"),
    };
    await tx.insert(members).values(values).onConflictDoUpdate({ target: members.id, set: values });
  }
}

async function upsertProjects(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      scope: opt(row(r), "scope") as string | undefined,
      financialTarget: opt(row(r), "financialTarget") as number | undefined,
      weeklyTarget: opt(row(r), "weeklyTarget") as number | undefined,
      monthlyTarget: opt(row(r), "monthlyTarget") as number | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdBy: safeUser(row(r).createdBy, validUserIds),
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({ target: projects.id, set: values });
  }
}

async function upsertPartners(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      type: opt(row(r), "type") as "individual" | "organization" | "church" | undefined,
      phone: opt(row(r), "phone") as string | undefined,
      email: opt(row(r), "email") as string | undefined,
      pledgeAmount: opt(row(r), "pledgeAmount") as number | undefined,
      notes: opt(row(r), "notes") as string | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdBy: safeUser(row(r).createdBy, validUserIds),
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(partners)
      .values(values)
      .onConflictDoUpdate({ target: partners.id, set: values });
  }
}

async function upsertCellMeetings(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      cellId: str(row(r), "cellId"),
      date: str(row(r), "date"),
      topic: opt(row(r), "topic") as string | undefined,
      notes: opt(row(r), "notes") as string | undefined,
      offertoryReported: (opt(row(r), "offertoryReported") as number | undefined) ?? 0,
      offertoryReceived: (opt(row(r), "offertoryReceived") as number | undefined) ?? 0,
      reportRef: str(row(r), "reportRef"),
      editRequestStatus: (opt(row(r), "editRequestStatus") as never) ?? "none",
      expenseClaimed: opt(row(r), "expenseClaimed") as number | undefined,
      expenseDescription: opt(row(r), "expenseDescription") as string | undefined,
      expenseStatus: opt(row(r), "expenseStatus") as never,
      expenseApproved: opt(row(r), "expenseApproved") as number | undefined,
      expenseId: undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(cellMeetings)
      .values(values)
      .onConflictDoUpdate({ target: cellMeetings.id, set: values });
  }
}

async function upsertClassSessions(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      classId: str(row(r), "classId"),
      date: str(row(r), "date"),
      topic: opt(row(r), "topic") as string | undefined,
      notes: opt(row(r), "notes") as string | undefined,
      offertoryAmount: opt(row(r), "offertoryAmount") as number | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(classSessions)
      .values(values)
      .onConflictDoUpdate({ target: classSessions.id, set: values });
  }
}

async function upsertEvents(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      title: str(row(r), "title"),
      date: str(row(r), "date"),
      startTime: opt(row(r), "startTime") as string | undefined,
      endTime: opt(row(r), "endTime") as string | undefined,
      type: str(row(r), "type") as never,
      audience: (opt(row(r), "audience") as never) ?? "all",
      notes: opt(row(r), "notes") as string | undefined,
      offertoryAmount: opt(row(r), "offertoryAmount") as number | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      recurrenceId: opt(row(r), "recurrenceId") as string | undefined,
      recurrence: opt(row(r), "recurrence") as never,
      createdAt: date(row(r), "createdAt"),
    };
    await tx.insert(events).values(values).onConflictDoUpdate({ target: events.id, set: values });
  }
}

async function upsertRequisitions(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      departmentId: str(row(r), "departmentId"),
      amount: str(row(r), "amount") as unknown as number,
      reason: str(row(r), "reason"),
      branchId: opt(row(r), "branchId") as string | undefined,
      requestedBy: safeUser(row(r).requestedBy, validUserIds),
      status: (opt(row(r), "status") as never) ?? "pending",
      decidedBy: safeUser(row(r).decidedBy, validUserIds),
      decidedAt: date(row(r), "decidedAt"),
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(requisitions)
      .values(values)
      .onConflictDoUpdate({ target: requisitions.id, set: values });
  }
}

async function upsertExpenses(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      departmentId: str(row(r), "departmentId"),
      amount: opt(row(r), "amount") as unknown as number,
      description: str(row(r), "description"),
      enteredBy: safeUser(row(r).enteredBy, validUserIds),
      status: (opt(row(r), "status") as never) ?? "approved",
      requisitionId: opt(row(r), "requisitionId") as string | undefined,
      approvedBy: safeUser(row(r).approvedBy, validUserIds),
      approvedAt: date(row(r), "approvedAt"),
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(expenses)
      .values(values)
      .onConflictDoUpdate({ target: expenses.id, set: values });
  }
}

async function upsertCellAttendance(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      meetingId: str(row(r), "meetingId"),
      memberId: opt(row(r), "memberId") as string | undefined,
      guestName: opt(row(r), "guestName") as string | undefined,
      guestPhone: opt(row(r), "guestPhone") as string | undefined,
      present: (opt(row(r), "present") as boolean | undefined) ?? false,
    };
    await tx
      .insert(cellAttendance)
      .values(values)
      .onConflictDoUpdate({ target: cellAttendance.id, set: values });
  }
}

async function upsertClassAttendance(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      sessionId: str(row(r), "sessionId"),
      memberId: str(row(r), "memberId"),
      present: (opt(row(r), "present") as boolean | undefined) ?? false,
    };
    await tx
      .insert(classAttendance)
      .values(values)
      .onConflictDoUpdate({ target: classAttendance.id, set: values });
  }
}

async function upsertEventAttendance(tx: Tx, orgId: string, rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      eventId: str(row(r), "eventId"),
      memberId: str(row(r), "memberId"),
      present: (opt(row(r), "present") as boolean | undefined) ?? false,
    };
    await tx
      .insert(eventAttendance)
      .values(values)
      .onConflictDoUpdate({ target: eventAttendance.id, set: values });
  }
}

async function upsertGivings(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      memberId: opt(row(r), "memberId") as string | undefined,
      partnerId: opt(row(r), "partnerId") as string | undefined,
      category: str(row(r), "category") as never,
      amount: opt(row(r), "amount") as unknown as number,
      projectId: opt(row(r), "projectId") as string | undefined,
      projectName: opt(row(r), "projectName") as string | undefined,
      date: str(row(r), "date"),
      notes: opt(row(r), "notes") as string | undefined,
      branchId: opt(row(r), "branchId") as string | undefined,
      createdBy: safeUser(row(r).createdBy, validUserIds),
      createdAt: date(row(r), "createdAt"),
    };
    await tx.insert(givings).values(values).onConflictDoUpdate({ target: givings.id, set: values });
  }
}

async function upsertPledges(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
) {
  for (const r of rows) {
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      name: str(row(r), "name"),
      amount: opt(row(r), "amount") as unknown as number,
      collectionDate: str(row(r), "collectionDate"),
      cause: str(row(r), "cause") as never,
      projectId: opt(row(r), "projectId") as string | undefined,
      description: opt(row(r), "description") as string | undefined,
      bookedBy: safeUser(row(r).bookedBy, validUserIds),
      status: (opt(row(r), "status") as never) ?? "active",
      branchId: opt(row(r), "branchId") as string | undefined,
      createdAt: date(row(r), "createdAt"),
    };
    await tx.insert(pledges).values(values).onConflictDoUpdate({ target: pledges.id, set: values });
  }
}

// Returns how many rows were skipped (userId no longer resolves to a real
// account in this org — testimonies.userId can't be null, unlike the other
// tables' optional "who did this" references).
async function upsertTestimonies(
  tx: Tx,
  orgId: string,
  rows: Record<string, unknown>[],
  validUserIds: Set<string>,
): Promise<number> {
  let skipped = 0;
  for (const r of rows) {
    const userId = row(r).userId;
    if (typeof userId !== "string" || !validUserIds.has(userId)) {
      skipped++;
      continue;
    }
    const values = {
      id: str(row(r), "id"),
      organizationId: orgId,
      userId,
      category: str(row(r), "category") as never,
      body: str(row(r), "body"),
      createdAt: date(row(r), "createdAt"),
    };
    await tx
      .insert(testimonies)
      .values(values)
      .onConflictDoUpdate({ target: testimonies.id, set: values });
  }
  return skipped;
}
