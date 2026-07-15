import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { db, uid, type CellMeeting, type Member } from "@/lib/db";
import { formatUGX } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteButton } from "@/components/delete-button";
import { AttendanceBreakdown } from "@/components/attendance-breakdown";
import { MemberCombobox } from "@/components/member-combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSession, canEditCell } from "@/lib/auth";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cells/$id")({
  component: CellDetail,
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Cell not found.</div>,
});

function CellDetail() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const cell = useLiveQuery(() => db.cells.get(id), [id]);
  const leader = useLiveQuery(
    () => (cell?.leaderId ? db.users.get(cell.leaderId) : undefined),
    [cell?.leaderId],
  );
  const members = useLiveQuery(() => db.members.where("cellId").equals(id).toArray(), [id]) ?? [];
  const allMembers = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const meetings =
    useLiveQuery(() => db.cellMeetings.where("cellId").equals(id).reverse().sortBy("date"), [id]) ??
    [];
  const [addingMember, setAddingMember] = useState(false);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<CellMeeting | null>(null);
  const [attMeeting, setAttMeeting] = useState<CellMeeting | null>(null);

  if (cell === undefined) return null;
  if (!cell) throw notFound();

  const canEdit = session ? canEditCell(session.role, cell.leaderId, session.userId) : false;
  const unassigned = allMembers.filter((m) => !m.cellId);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/cells">
          <ArrowLeft className="mr-1 h-4 w-4" /> All cells
        </Link>
      </Button>
      <PageHeader
        title={cell.name}
        description={`${cell.meetingDay ?? "Any day"} • ${cell.meetingLocation ?? "—"}`}
        actions={
          <div className="text-sm text-muted-foreground">
            Leader: <span className="text-foreground">{leader?.fullName ?? "Unassigned"}</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Roster ({members.length})</h3>
              {canEdit && (
                <Dialog open={addingMember} onOpenChange={setAddingMember}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1 h-4 w-4" /> Add member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-display">Add to {cell.name}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-80 overflow-y-auto">
                      {unassigned.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          All members already belong to a cell.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {unassigned.map((m) => (
                            <li key={m.id}>
                              <button
                                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                onClick={async () => {
                                  await db.members.update(m.id, { cellId: cell.id });
                                  toast.success(`Added ${m.firstName} to ${cell.name}`);
                                }}
                              >
                                {m.firstName} {m.lastName}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/60"
                >
                  <Link to="/members/$id" params={{ id: m.id }} className="hover:text-primary">
                    {m.firstName} {m.lastName}
                  </Link>
                  {canEdit && (
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await db.members.update(m.id, { cellId: undefined });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
              {members.length === 0 && (
                <li className="text-xs text-muted-foreground">No members yet.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Meetings</h3>
              {canEdit && (
                <Dialog
                  open={meetingDialogOpen}
                  onOpenChange={(o) => {
                    setMeetingDialogOpen(o);
                    if (!o) setEditingMeeting(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => setEditingMeeting(null)}>
                      <Plus className="mr-1 h-4 w-4" /> New meeting
                    </Button>
                  </DialogTrigger>
                  <MeetingDialog
                    cellId={cell.id}
                    meeting={editingMeeting}
                    onClose={() => setMeetingDialogOpen(false)}
                  />
                </Dialog>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {meetings.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/60"
                >
                  <button className="text-left" onClick={() => setAttMeeting(m)}>
                    <div className="font-medium">{format(new Date(m.date), "PPP")}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {m.topic && <span>{m.topic}</span>}
                      {!!m.offertoryAmount && <span>{formatUGX(m.offertoryAmount)}</span>}
                    </div>
                  </button>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit meeting on ${format(new Date(m.date), "PPP")}`}
                        onClick={() => {
                          setEditingMeeting(m);
                          setMeetingDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        label={`Delete meeting on ${format(new Date(m.date), "PPP")}`}
                        title="Delete this meeting?"
                        description="This also removes its attendance records. This can't be undone."
                        onConfirm={async () => {
                          try {
                            await db.cellAttendance.where("meetingId").equals(m.id).delete();
                            await db.cellMeetings.delete(m.id);
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Failed to delete meeting",
                            );
                          }
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
              {meetings.length === 0 && (
                <li className="text-xs text-muted-foreground">No meetings recorded.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {attMeeting && (
        <AttendanceDialog
          meeting={attMeeting}
          roster={members}
          allMembers={allMembers}
          canEdit={canEdit}
          onClose={() => setAttMeeting(null)}
        />
      )}
    </div>
  );
}

function MeetingDialog({
  cellId,
  meeting,
  onClose,
}: {
  cellId: string;
  meeting: CellMeeting | null;
  onClose: () => void;
}) {
  const [date, setDate] = useState(meeting?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [topic, setTopic] = useState(meeting?.topic ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [offertoryAmount, setOffertoryAmount] = useState(
    meeting?.offertoryAmount != null ? String(meeting.offertoryAmount) : "",
  );
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {meeting ? "Edit cell meeting" : "New cell meeting"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Topic</Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What was discussed?"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Offertory (UGX)</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={offertoryAmount}
            onChange={(e) => setOffertoryAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Enter 0 if not applicable.</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            try {
              const amount = offertoryAmount ? Number(offertoryAmount) : undefined;
              if (offertoryAmount && Number.isNaN(amount)) {
                toast.error("Enter a valid offertory amount");
                return;
              }
              await db.cellMeetings.put({
                id: meeting?.id ?? uid(),
                cellId,
                date,
                topic: topic || undefined,
                notes: notes || undefined,
                offertoryAmount: amount,
                createdAt: meeting?.createdAt ?? Date.now(),
              });
              toast.success(
                meeting ? "Meeting updated" : "Meeting created — mark attendance next.",
              );
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to save meeting");
            }
          }}
        >
          {meeting ? "Save changes" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AttendanceDialog({
  meeting,
  roster,
  allMembers,
  canEdit,
  onClose,
}: {
  meeting: CellMeeting;
  roster: Member[];
  allMembers: Member[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const records =
    useLiveQuery(
      () => db.cellAttendance.where("meetingId").equals(meeting.id).toArray(),
      [meeting.id],
    ) ?? [];
  const map = new Map(records.map((r) => [r.memberId, r]));
  const presentIds = new Set(records.filter((r) => r.present).map((r) => r.memberId));

  const displayedIds = new Set([...roster.map((m) => m.id), ...records.map((r) => r.memberId)]);
  const displayed = allMembers.filter((m) => displayedIds.has(m.id));

  async function toggle(memberId: string, present: boolean) {
    const existing = map.get(memberId);
    if (existing) {
      await db.cellAttendance.update(existing.id, { present });
    } else {
      await db.cellAttendance.add({ id: uid(), meetingId: meeting.id, memberId, present });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            Attendance — {format(new Date(meeting.date), "PPP")}
          </DialogTitle>
        </DialogHeader>
        {meeting.topic && <p className="text-sm text-muted-foreground">{meeting.topic}</p>}
        <AttendanceBreakdown roster={displayed} presentIds={presentIds} />
        {canEdit && (
          <MemberCombobox
            members={allMembers}
            excludeIds={displayedIds}
            onSelect={(m) => toggle(m.id, true)}
          />
        )}
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {displayed.map((m) => {
            const rec = map.get(m.id);
            return (
              <label
                key={m.id}
                className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
              >
                <span className="text-sm">
                  {m.firstName} {m.lastName}
                </span>
                <Checkbox
                  checked={rec?.present ?? false}
                  disabled={!canEdit}
                  onCheckedChange={(v) => toggle(m.id, Boolean(v))}
                />
              </label>
            );
          })}
          {displayed.length === 0 && (
            <p className="text-sm text-muted-foreground">No members in this cell yet.</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
