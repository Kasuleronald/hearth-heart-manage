import { db } from "./db";
import { notifyBirthdayReminder } from "./notifications";

// No server/cron in this local-first app, so birthday reminders are checked
// opportunistically — call this once when the app loads. `lastBirthdayReminderYear`
// guards against re-notifying every user again if the app is reopened later the same day.
export async function checkBirthdayReminders(): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const month = tomorrow.getMonth() + 1;
  const day = tomorrow.getDate();
  const year = tomorrow.getFullYear();

  const due = await db.members
    .filter(
      (m) => m.birthMonth === month && m.birthDay === day && m.lastBirthdayReminderYear !== year,
    )
    .toArray();

  for (const member of due) {
    await db.transaction("rw", [db.members, db.users, db.notifications], async () => {
      await db.members.update(member.id, { lastBirthdayReminderYear: year });
      await notifyBirthdayReminder({ ...member, lastBirthdayReminderYear: year });
    });
  }
}
