import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ArrowLeft, Plus, Pencil, Wallet, Check } from "lucide-react";
import { db, uid, type CellMeeting, type Member } from "@/lib/db";
import { formatUGX } from "@/lib/currency";
import { generateReportRef, getCellBalance } from "@/lib/finance";
import { notifyCellReportSubmitted } from "@/lib/notifications";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import {
  useSession,
  canEditCell,
  canAccessRecordBranch,
  canRecordOffertoryReceived,
  canApproveEditRequest,
} from "@/lib/auth";
import { useCellTerm } from "@/lib/terminology";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cells/$id")({
  component: CellDetail,
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

function CellDetail() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const { singular, plural } = useCellTerm();
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
  const [recordingMeeting, setRecordingMeeting] = useState<CellMeeting | null>(null);

  if (cell === undefined) return null;
  if (!cell) throw notFound();
  if (session && !canAccessRecordBranch(session.branchId, cell.branchId)) throw notFound();

  const canEdit = session ? canEditCell(session.role, cell.leaderId, session.userId) : false;
  const canRecordReceived = session
    ? canRecordOffertoryReceived(session.role, session.financeTier)
    : false;
  const canApproveEdit = session ? canApproveEditRequest(session.role) : false;
  const isPlainCellLeader = session?.role === "cell_leader" && cell.leaderId === session.userId;
  const unassigned = allMembers.filter((m) => !m.cellId);
  const balance = getCellBalance(meetings);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/cells">
          <ArrowLeft className="mr-1 h-4 w-4" /> All {plural.toLowerCase()}
        </Link>
      </Button>
      <PageHeader
        title={cell.name}
        description={`${cell.meetingDay ?? "Any day"} • ${cell.meetingLocation ?? "—"}`}
        actions={
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {meetings.length > 0 && (canEdit || canRecordReceived) && (
              <span className="flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                Balance:{" "}
                <span
                  className={
                    balance < 0
                      ? "font-medium text-destructive"
                      : balance > 0
                        ? "font-medium text-primary"
                        : "font-medium text-foreground"
                  }
                >
                  {formatUGX(balance)}
                </span>
              </span>
            )}
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
                          All members already belong to a {singular.toLowerCase()}.
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
                    cellName={cell.name}
                    cellBranchId={cell.branchId}
                    meeting={editingMeeting}
                    singular={singular}
                    onClose={() => setMeetingDialogOpen(false)}
                  />
                </Dialog>
              )}
            </div>
            <ul className="space-y-1.5 text-sm">
              {meetings.map((m) => {
                const canEditThisMeeting =
                  canEdit && (!isPlainCellLeader || m.editRequestStatus === "approved");
                const canRequestEdit = isPlainCellLeader && m.editRequestStatus === "none";
                const canApproveThisEdit = canApproveEdit && m.editRequestStatus === "requested";
                return (
                  <li key={m.id} className="rounded px-2 py-1.5 hover:bg-muted/60">
                    <div className="flex items-center justify-between">
                      <button className="text-left" onClick={() => setAttMeeting(m)}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{format(new Date(m.date), "PPP")}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {m.reportRef}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {m.topic && <span>{m.topic}</span>}
                          <span>
                            Reported {formatUGX(m.offertoryReported)} • Received{" "}
                            {formatUGX(m.offertoryReceived)}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        {m.editRequestStatus !== "none" && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            Edit {m.editRequestStatus}
                          </Badge>
                        )}
                        {canRecordReceived && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Record offertory received for ${format(new Date(m.date), "PPP")}`}
                            title="Record received"
                            onClick={() => setRecordingMeeting(m)}
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>
                        )}
                        {canRequestEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={async () => {
                              await db.cellMeetings.update(m.id, {
                                editRequestStatus: "requested",
                              });
                              toast.success(
                                "Edit requested — an admin or treasurer must approve it.",
                              );
                            }}
                          >
                            Request edit
                          </Button>
                        )}
                        {canApproveThisEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={async () => {
                              await db.cellMeetings.update(m.id, { editRequestStatus: "approved" });
                              toast.success("Edit approved");
                            }}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve edit
                          </Button>
                        )}
                        {canEditThisMeeting && (
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
                        )}
                        {canEdit && (
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
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
              {meetings.length === 0 && (
                <li className="text-xs text-muted-foreground">No meetings recorded.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {recordingMeeting && (
        <RecordReceivedDialog
          meeting={recordingMeeting}
          onClose={() => setRecordingMeeting(null)}
        />
      )}

      {attMeeting && (
        <AttendanceDialog
          meeting={attMeeting}
          roster={members}
          allMembers={allMembers}
          canEdit={canEdit}
          singular={singular}
          onClose={() => setAttMeeting(null)}
        />
      )}
    </div>
  );
}

function MeetingDialog({
  cellId,
  cellName,
  cellBranchId,
  meeting,
  singular,
  onClose,
}: {
  cellId: string;
  cellName: string;
  cellBranchId: string | undefined;
  meeting: CellMeeting | null;
  singular: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(meeting?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [topic, setTopic] = useState(meeting?.topic ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [offertoryReported, setOffertoryReported] = useState(
    meeting ? String(meeting.offertoryReported) : "",
  );
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {meeting
            ? `Edit ${singular.toLowerCase()} meeting`
            : `New ${singular.toLowerCase()} meeting`}
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
          <Label>Offertory reported (UGX)</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={offertoryReported}
            onChange={(e) => setOffertoryReported(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            What you collected. Enter 0 if not applicable — finance confirms the actual amount
            received separately.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            try {
              const amount = offertoryReported ? Number(offertoryReported) : 0;
              if (offertoryReported && Number.isNaN(amount)) {
                toast.error("Enter a valid offertory amount");
                return;
              }
              const data: CellMeeting = {
                id: meeting?.id ?? uid(),
                cellId,
                date,
                topic: topic || undefined,
                notes: notes || undefined,
                offertoryReported: amount,
                offertoryReceived: meeting?.offertoryReceived ?? 0,
                reportRef: meeting?.reportRef ?? (await generateReportRef(date)),
                editRequestStatus: "none",
                branchId: meeting?.branchId ?? cellBranchId,
                createdAt: meeting?.createdAt ?? Date.now(),
              };
              await db.cellMeetings.put(data);
              if (!meeting) {
                await notifyCellReportSubmitted(data, cellName);
              }
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

function RecordReceivedDialog({ meeting, onClose }: { meeting: CellMeeting; onClose: () => void }) {
  const [amount, setAmount] = useState(String(meeting.offertoryReceived));

  async function save() {
    const numericAmount = Number(amount);
    if (amount === "" || Number.isNaN(numericAmount) || numericAmount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await db.cellMeetings.update(meeting.id, { offertoryReceived: numericAmount });
      toast.success("Received amount recorded");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record amount");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            Record received — {format(new Date(meeting.date), "PPP")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The cell leader reported{" "}
          <span className="text-foreground">{formatUGX(meeting.offertoryReported)}</span> (ref{" "}
          {meeting.reportRef}). Enter what was actually received — it can be less than, equal to, or
          more than the reported amount.
        </p>
        <div className="space-y-1.5">
          <Label>Amount received (UGX)</Label>
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDialog({
  meeting,
  roster,
  allMembers,
  canEdit,
  singular,
  onClose,
}: {
  meeting: CellMeeting;
  roster: Member[];
  allMembers: Member[];
  canEdit: boolean;
  singular: string;
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
            <p className="text-sm text-muted-foreground">
              No members in this {singular.toLowerCase()} yet.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
