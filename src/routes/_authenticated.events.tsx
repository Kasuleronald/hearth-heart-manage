import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { db, deleteEventCascade, uid, type ChurchEvent, type EventType } from "@/lib/db";
import { notifyEventCreated } from "@/lib/notifications";
import { useBaseCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { PageHeader } from "@/components/page-header";
import { CurrencyToggle } from "@/components/currency-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import { BranchField } from "@/components/branch-field";
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
import { useSession, canManageEvents, canToggleCurrency } from "@/lib/auth";
import { useEffectiveBranch, matchesBranchFilter } from "@/lib/branch-filter";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

const TYPES: { value: EventType; label: string }[] = [
  { value: "sunday_service", label: "Sunday Service" },
  { value: "prayer", label: "Prayer Meeting" },
  { value: "overnight_prayer", label: "Overnight Prayer" },
  { value: "special", label: "Special Event" },
];

function EventsPage() {
  const { session } = useSession();
  const canManage = session ? canManageEvents(session.role) : false;
  const allEvents = useLiveQuery(() => db.events.orderBy("date").reverse().toArray(), []) ?? [];
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const events = allEvents.filter((e) => matchesBranchFilter(effectiveBranch, e.branchId));
  const [editing, setEditing] = useState<ChurchEvent | null>(null);
  const [open, setOpen] = useState(false);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  return (
    <div>
      <PageHeader
        title="Events"
        description="Services, prayer meetings and special gatherings."
        actions={
          <div className="flex items-center gap-2">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            {canManage && (
              <Dialog
                open={open}
                onOpenChange={(o) => {
                  setOpen(o);
                  if (!o) setEditing(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => setEditing(null)}>
                    <Plus className="mr-2 h-4 w-4" /> New event
                  </Button>
                </DialogTrigger>
                <EventDialog
                  event={editing}
                  currentUserId={session?.userId}
                  onClose={() => setOpen(false)}
                />
              </Dialog>
            )}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((e) => (
          <Card key={e.id} className="group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <Link to="/events/$id" params={{ id: e.id }}>
                  <h3 className="font-display text-lg font-semibold group-hover:text-primary">
                    {e.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(e.date), "PPPP")}
                  </p>
                </Link>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${e.title}`}
                      onClick={() => {
                        setEditing(e);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton
                      label={`Delete ${e.title}`}
                      title={`Delete "${e.title}"?`}
                      description="This also removes its attendance records. This can't be undone."
                      onConfirm={async () => {
                        try {
                          await deleteEventCascade(e.id);
                          toast.success("Event deleted");
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Failed to delete event",
                          );
                        }
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {e.type.replace("_", " ")}
                </Badge>
                {!!e.offertoryAmount && (
                  <span className="text-xs text-muted-foreground">
                    {formatAmount(e.offertoryAmount)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
      </div>
    </div>
  );
}

function EventDialog({
  event,
  currentUserId,
  onClose,
}: {
  event: ChurchEvent | null;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<EventType>(event?.type ?? "sunday_service");
  const [audience, setAudience] = useState<ChurchEvent["audience"]>(event?.audience ?? "all");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [offertoryAmount, setOffertoryAmount] = useState(
    event?.offertoryAmount != null ? String(event.offertoryAmount) : "",
  );
  const [branchId, setBranchId] = useState(event?.branchId ?? "");
  const baseCurrency = useBaseCurrency();

  async function save() {
    if (!title.trim()) return toast.error("Title required");
    try {
      const amount = offertoryAmount ? Number(offertoryAmount) : undefined;
      if (offertoryAmount && Number.isNaN(amount)) {
        toast.error("Enter a valid offertory amount");
        return;
      }
      const data: ChurchEvent = {
        id: event?.id ?? uid(),
        title: title.trim(),
        date,
        type,
        audience,
        notes: notes || undefined,
        offertoryAmount: amount,
        branchId: branchId || undefined,
        createdAt: event?.createdAt ?? Date.now(),
      };
      await db.transaction("rw", [db.events, db.users, db.notifications], async () => {
        await db.events.put(data);
        if (!event) {
          await notifyEventCreated(data, currentUserId);
        }
      });
      toast.success(event ? "Event updated" : "Event created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save event");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">{event ? "Edit event" : "New event"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Notify</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as ChurchEvent["audience"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="leaders">Leaders only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Who gets notified when this event is created.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Offertory ({baseCurrency.code})</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={offertoryAmount}
            onChange={(e) => setOffertoryAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Enter 0 if not applicable.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <BranchField value={branchId} onChange={setBranchId} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>{event ? "Save changes" : "Create event"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
