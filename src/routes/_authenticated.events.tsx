import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { db, uid, type ChurchEvent, type EventType } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

const TYPES: { value: EventType; label: string }[] = [
  { value: "sunday_service", label: "Sunday Service" },
  { value: "prayer", label: "Prayer Meeting" },
  { value: "special", label: "Special Event" },
];

function EventsPage() {
  const events = useLiveQuery(() => db.events.orderBy("date").reverse().toArray(), []) ?? [];
  const [editing, setEditing] = useState<ChurchEvent | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Events"
        description="Services, prayer meetings and special gatherings."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="mr-2 h-4 w-4" /> New event
              </Button>
            </DialogTrigger>
            <EventDialog event={editing} onClose={() => setOpen(false)} />
          </Dialog>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((e) => (
          <Card key={e.id} className="group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <Link to="/events/$id" params={{ id: e.id }}>
                  <h3 className="font-display text-lg font-semibold group-hover:text-primary">{e.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{format(new Date(e.date), "PPPP")}</p>
                </Link>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(e); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Delete "${e.title}"?`)) return;
                      await db.eventAttendance.where("eventId").equals(e.id).delete();
                      await db.events.delete(e.id);
                      toast.success("Event deleted");
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <Badge variant="secondary" className="capitalize">{e.type.replace("_", " ")}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
      </div>
    </div>
  );
}

function EventDialog({ event, onClose }: { event: ChurchEvent | null; onClose: () => void }) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<EventType>(event?.type ?? "sunday_service");
  const [notes, setNotes] = useState(event?.notes ?? "");

  async function save() {
    if (!title.trim()) return toast.error("Title required");
    await db.events.put({
      id: event?.id ?? uid(),
      title: title.trim(),
      date,
      type,
      notes: notes || undefined,
      createdAt: event?.createdAt ?? Date.now(),
    });
    toast.success(event ? "Event updated" : "Event created");
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle className="font-display">{event ? "Edit event" : "New event"}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>{event ? "Save changes" : "Create event"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
