import {
  db,
  uid,
  type CellMeeting,
  type ChurchEvent,
  type Member,
  type NotificationType,
  type Pledge,
  type Requisition,
  type Role,
  type Testimony,
} from "./db";

async function notify(
  recipientUserIds: string[],
  type: NotificationType,
  message: string,
  entity?: { type: string; id: string },
) {
  const uniqueIds = [...new Set(recipientUserIds)];
  if (uniqueIds.length === 0) return;
  const now = Date.now();
  await db.notifications.bulkAdd(
    uniqueIds.map((recipientUserId) => ({
      id: uid(),
      recipientUserId,
      type,
      message,
      entityType: entity?.type,
      entityId: entity?.id,
      read: false,
      createdAt: now,
    })),
  );
}

async function userIdsByRoles(roles: Role[]): Promise<string[]> {
  const users = await db.users.where("role").anyOf(roles).toArray();
  return users.map((u) => u.id);
}

async function tierAFinanceLeaderIds(): Promise<string[]> {
  const users = await db.users
    .filter((u) => (u.role === "leader" || u.role === "cell_leader") && u.financeTier === "A")
    .toArray();
  return users.map((u) => u.id);
}

export async function markNotificationRead(id: string) {
  await db.notifications.update(id, { read: true });
}

export async function markAllNotificationsRead(userId: string) {
  await db.notifications.where("recipientUserId").equals(userId).modify({ read: true });
}

export async function notifyMemberAdded(member: Member, addedByUserId: string) {
  const recipients = (await userIdsByRoles(["admin", "pastor"])).filter(
    (id) => id !== addedByUserId,
  );
  const adder = await db.users.get(addedByUserId);
  await notify(
    recipients,
    "member_added",
    `${adder?.fullName ?? "Someone"} added a member: ${member.firstName} ${member.lastName}`,
    { type: "member", id: member.id },
  );
}

export async function notifyMemberDeleted(
  memberName: string,
  reason: string,
  deletedByUserId: string,
  creatorUserId: string | undefined,
) {
  const pastors = await userIdsByRoles(["pastor"]);
  const recipients = [...pastors, ...(creatorUserId ? [creatorUserId] : [])].filter(
    (id) => id !== deletedByUserId,
  );
  const deleter = await db.users.get(deletedByUserId);
  await notify(
    recipients,
    "member_deleted",
    `${deleter?.fullName ?? "Someone"} deleted member ${memberName}. Reason: ${reason}`,
  );
}

export async function notifyEventCreated(event: ChurchEvent, createdByUserId: string | undefined) {
  const recipients =
    event.audience === "leaders"
      ? await userIdsByRoles(["leader", "cell_leader", "pastor", "admin"])
      : (await db.users.toArray()).map((u) => u.id);
  await notify(
    createdByUserId ? recipients.filter((id) => id !== createdByUserId) : recipients,
    "event_created",
    `New event: ${event.title}`,
    { type: "event", id: event.id },
  );
}

export async function notifyCellReportSubmitted(meeting: CellMeeting, cellName: string) {
  const [roleRecipients, tierARecipients] = await Promise.all([
    userIdsByRoles(["admin", "pastor", "treasurer"]),
    tierAFinanceLeaderIds(),
  ]);
  const recipients = [...roleRecipients, ...tierARecipients];
  await notify(recipients, "cell_report_submitted", `${cellName} entered a report`, {
    type: "cell",
    id: meeting.cellId,
  });
}

export async function notifyTestimonyAdded(testimony: Testimony) {
  const author = await db.users.get(testimony.userId);
  const recipients = (await db.users.toArray())
    .map((u) => u.id)
    .filter((id) => id !== testimony.userId);
  await notify(
    recipients,
    "testimony_added",
    `${author?.fullName ?? "Someone"} has entered a testimony under category ${testimony.category}.`,
    { type: "testimony", id: testimony.id },
  );
}

export async function notifyPledgeArchived(pledge: Pledge) {
  const [pastors, admins] = await Promise.all([
    userIdsByRoles(["pastor"]),
    userIdsByRoles(["admin"]),
  ]);
  const recipients = [...pastors, ...admins, pledge.bookedBy];
  await notify(
    recipients,
    "pledge_archived",
    `Pledge from ${pledge.name} has passed its due date by more than 30 days and was archived.`,
    { type: "pledge", id: pledge.id },
  );
}

export async function notifyRequisitionSubmitted(requisition: Requisition) {
  const [roleRecipients, tierARecipients, requester, department] = await Promise.all([
    userIdsByRoles(["admin", "pastor", "treasurer"]),
    tierAFinanceLeaderIds(),
    db.users.get(requisition.requestedBy),
    db.departments.get(requisition.departmentId),
  ]);
  const recipients = [...roleRecipients, ...tierARecipients].filter(
    (id) => id !== requisition.requestedBy,
  );
  await notify(
    recipients,
    "requisition_submitted",
    `${requester?.fullName ?? "Someone"} submitted a requisition for ${department?.name ?? "a department"}`,
    { type: "requisition", id: requisition.id },
  );
}
