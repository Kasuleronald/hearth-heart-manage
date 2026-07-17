import { db, PLEDGE_ARCHIVE_GRACE_DAYS, type Pledge } from "./db";
import { notifyPledgeArchived } from "./notifications";

// No server/cron in this local-first app, so overdue pledges are archived
// opportunistically — call this once when the Pledges page loads. Only
// "active" pledges are eligible; fulfilled/banned/already-archived ones are
// left alone.
export async function archiveOverduePledges(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PLEDGE_ARCHIVE_GRACE_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const overdue = await db.pledges
    .filter((p) => p.status === "active" && p.collectionDate < cutoffStr)
    .toArray();

  for (const pledge of overdue) {
    await db.transaction("rw", [db.pledges, db.users, db.notifications], async () => {
      await db.pledges.update(pledge.id, { status: "archived" });
      await notifyPledgeArchived({ ...pledge, status: "archived" } as Pledge);
    });
  }
}
