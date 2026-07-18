import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Plus, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
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
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  setYear,
  isSameMonth,
  isSameDay,
} from "date-fns";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

const TYPES: { value: EventType; label: string }[] = [
  { value: "sunday_service", label: "Sunday Service" },
  { value: "prayer", label: "Prayer Meeting" },
  { value: "overnight_prayer", label: "Overnight Prayer" },
  { value: "special", label: "Special Event" },
];

const TYPE_DOT: Record<EventType, string> = {
  sunday_service: "bg-primary",
  prayer: "bg-accent",
  overnight_prayer: "bg-purple-500",
  special: "bg-amber-500",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const YEAR_RANGE = 6; // years shown on either side of the current year

function EventsPage() {
  const { session } = useSession();
  const canManage = session ? canManageEvents(session.role) : false;
  const allEvents = useLiveQuery(() => db.events.orderBy("date").toArray(), []) ?? [];
  const effectiveBranch = useEffectiveBranch(session?.branchId);
  const events = allEvents.filter((e) => matchesBranchFilter(effectiveBranch, e.branchId));
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState<ChurchEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { base } = useDisplayCurrency(canToggle);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ChurchEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(viewMonth));
    const gridEnd = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const currentRealYear = new Date().getFullYear();
  const viewYear = viewMonth.getFullYear();
  const yearOptions = useMemo(() => {
    const min = Math.min(currentRealYear - YEAR_RANGE, viewYear);
    const max = Math.max(currentRealYear + YEAR_RANGE, viewYear);
    const list: number[] = [];
    for (let y = min; y <= max; y++) list.push(y);
    return list;
  }, [currentRealYear, viewYear]);

  function openNewEventDialog(date?: string) {
    setEditing(null);
    setDefaultDate(date);
    setOpen(true);
  }

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
                  if (!o) {
                    setEditing(null);
                    setDefaultDate(undefined);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => openNewEventDialog()}>
                    <Plus className="mr-2 h-4 w-4" /> New event
                  </Button>
                </DialogTrigger>
                <EventDialog
                  key={editing?.id ?? defaultDate ?? "new"}
                  event={editing}
                  defaultDate={defaultDate}
                  currentUserId={session?.userId}
                  onClose={() => setOpen(false)}
                />
              </Dialog>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="w-36 text-center font-display text-xl font-semibold">
            {format(viewMonth, "MMMM")}
          </h2>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewMonth(startOfMonth(new Date()))}>
            Today
          </Button>
          <Select
            value={String(viewYear)}
            onValueChange={(v) => setViewMonth((m) => setYear(m, Number(v)))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, viewMonth);
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={dateStr}
              role={canManage ? "button" : undefined}
              onClick={canManage ? () => openNewEventDialog(dateStr) : undefined}
              className={`group flex min-h-28 flex-col gap-1 bg-card p-1.5 sm:min-h-32 ${
                inMonth ? "" : "bg-muted/40"
              } ${canManage ? "cursor-pointer hover:bg-accent/10" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-primary font-semibold text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {canManage && (
                  <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                {dayEvents.map((e) => (
                  <div
                    key={e.id}
                    onClick={(ev) => ev.stopPropagation()}
                    className="group/event flex items-center gap-1 rounded bg-secondary px-1.5 py-1 text-[11px] leading-tight"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[e.type]}`} />
                    <Link
                      to="/events/$id"
                      params={{ id: e.id }}
                      className="min-w-0 flex-1 truncate hover:underline"
                      title={e.title}
                    >
                      {e.title}
                    </Link>
                    {canManage && (
                      <div className="hidden shrink-0 items-center gap-0.5 group-hover/event:flex">
                        <button
                          type="button"
                          aria-label={`Edit ${e.title}`}
                          onClick={() => {
                            setEditing(e);
                            setDefaultDate(undefined);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                        <DeleteButton
                          size="icon"
                          variant="ghost"
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
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {TYPES.map((t) => (
          <div key={t.value} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${TYPE_DOT[t.value]}`} />
            {t.label}
          </div>
        ))}
      </div>

      {events.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No events yet.</p>}
    </div>
  );
}

function EventDialog({
  event,
  defaultDate,
  currentUserId,
  onClose,
}: {
  event: ChurchEvent | null;
  defaultDate?: string;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? defaultDate ?? format(new Date(), "yyyy-MM-dd"));
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
