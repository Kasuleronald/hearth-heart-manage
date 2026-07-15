import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { db, uid } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/events/$id")({
  component: EventDetail,
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Event not found.</div>
  ),
});

function EventDetail() {
  const { id } = Route.useParams();
  const event = useLiveQuery(() => db.events.get(id), [id]);
  const members = useLiveQuery(() => db.members.orderBy("lastName").toArray(), []) ?? [];
  const attendance = useLiveQuery(
    () => db.eventAttendance.where("eventId").equals(id).toArray(),
    [id],
  ) ?? [];

  if (event === undefined) return null;
  if (!event) throw notFound();

  const map = new Map(attendance.map((a) => [a.memberId, a]));
  const presentCount = attendance.filter((a) => a.present).length;
  const activeMembers = members.filter((m) => m.status !== "inactive");

  async function toggle(memberId: string, present: boolean) {
    const rec = map.get(memberId);
    if (rec) {
      await db.eventAttendance.update(rec.id, { present });
    } else {
      await db.eventAttendance.add({ id: uid(), eventId: id, memberId, present });
    }
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/events"><ArrowLeft className="mr-1 h-4 w-4" /> All events</Link>
      </Button>
      <PageHeader
        title={event.title}
        description={format(new Date(event.date), "PPPP")}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">{event.type.replace("_", " ")}</Badge>
            <Badge className="bg-primary text-primary-foreground border-0">
              {presentCount} present
            </Badge>
          </div>
        }
      />
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 font-display text-lg font-semibold">Attendance</h3>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {activeMembers.map((m) => {
              const rec = map.get(m.id);
              return (
                <label key={m.id} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted">
                  <span className="text-sm">{m.firstName} {m.lastName}</span>
                  <Checkbox
                    checked={rec?.present ?? false}
                    onCheckedChange={(v) => toggle(m.id, Boolean(v))}
                  />
                </label>
              );
            })}
            {activeMembers.length === 0 && (
              <p className="text-sm text-muted-foreground">No active members to check in.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
