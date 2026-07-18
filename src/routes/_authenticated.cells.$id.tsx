import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ArrowLeft, Plus, Pencil, Wallet, Check, Receipt, X } from "lucide-react";
import { db, uid, type CellMeeting, type Member } from "@/lib/db";
import { useBaseCurrency, formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { generateReportRef, getCellBalance } from "@/lib/finance";
import { notifyCellReportSubmitted, notifyCellExpenseApproved } from "@/lib/notifications";
import { ensureCellFellowshipsDepartment } from "@/lib/cell-fellowships";
import { PageHeader } from "@/components/page-header";
import { CurrencyToggle } from "@/components/currency-toggle";
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
  canToggleCurrency,
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
  const [approvingExpenseMeeting, setApprovingExpenseMeeting] = useState<CellMeeting | null>(null);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  if (cell === undefined) return null;
  if (!cell) throw notFound();
  if (session && !canAccessRecordBranch(session.branchId, cell.branchId)) throw notFound();

  const canEdit = session ? canEditCell(session.role, cell.leaderId, session.userId) : false;
  const canRecordReceived = session
    ? canRecordOffertoryReceived(session.role, session.financeTier)
    : false;
  const canApproveEdit = session ? canApproveEditRequest(session.role) : false;
  // Anyone who can edit this cell without being admin/pastor got that access by
  // being the assigned leader — regardless of their account's primary role — so
  // they're still subject to the edit-request-approval workflow below.
  const isPlainCellLeader = canEdit && session?.role !== "admin" && session?.role !== "pastor";
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
                  {formatAmount(balance)}
                </span>
              </span>
            )}
            {canToggle && <CurrencyToggle baseCode={base.code} />}
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
                    key={editingMeeting?.id ?? "new"}
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
                            Reported {formatAmount(m.offertoryReported)} • Received{" "}
                            {formatAmount(m.offertoryReceived)}
                            {!!m.expenseClaimed && (
                              <> • Expense claimed {formatAmount(m.expenseClaimed)}</>
                            )}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        {m.editRequestStatus !== "none" && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            Edit {m.editRequestStatus}
                          </Badge>
                        )}
                        {!!m.expenseStatus && m.expenseStatus !== "none" && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            Expense {m.expenseStatus}
                          </Badge>
                        )}
                        {canRecordReceived && m.expenseStatus === "pending" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Approve expense for ${format(new Date(m.date), "PPP")}`}
                            title="Approve expense"
                            onClick={() => setApprovingExpenseMeeting(m)}
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
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

      {approvingExpenseMeeting && session && (
        <ApproveExpenseDialog
          meeting={approvingExpenseMeeting}
          cellName={cell.name}
          cellLeaderId={cell.leaderId}
          approverId={session.userId}
          onClose={() => setApprovingExpenseMeeting(null)}
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
  const [expenseClaimed, setExpenseClaimed] = useState(
    meeting?.expenseClaimed ? String(meeting.expenseClaimed) : "",
  );
  const [expenseDescription, setExpenseDescription] = useState(meeting?.expenseDescription ?? "");
  const expenseApproved = meeting?.expenseStatus === "approved";
  const baseCurrency = useBaseCurrency();
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
          <Label>Offertory reported ({baseCurrency.code})</Label>
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
        <div className="space-y-1.5">
          <Label>Spent before hand-in ({baseCurrency.code})</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={expenseClaimed}
            disabled={expenseApproved}
            onChange={(e) => setExpenseClaimed(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {expenseApproved
              ? "This expense was already approved and posted to Expenses — edit or delete it directly on the Expenses page if it needs correcting."
              : "Only fill this in if you used part of the offertory for something before handing in the rest (e.g. transport) — the Treasurer must approve it before it counts."}
          </p>
        </div>
        {!expenseApproved && !!Number(expenseClaimed) && (
          <div className="space-y-1.5">
            <Label>What was it spent on?</Label>
            <Input
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
              placeholder="e.g. Transport to visit a sick member"
            />
          </div>
        )}
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
              const expenseAmt = expenseClaimed ? Number(expenseClaimed) : 0;
              if (expenseClaimed && Number.isNaN(expenseAmt)) {
                toast.error("Enter a valid expense amount");
                return;
              }
              if (expenseAmt > 0 && !expenseDescription.trim() && !expenseApproved) {
                toast.error("Describe what the expense was for");
                return;
              }
              const claimChanged =
                !expenseApproved &&
                (expenseAmt !== (meeting?.expenseClaimed ?? 0) ||
                  expenseDescription.trim() !== (meeting?.expenseDescription ?? ""));
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
                expenseClaimed: expenseApproved ? meeting?.expenseClaimed : expenseAmt || undefined,
                expenseDescription: expenseApproved
                  ? meeting?.expenseDescription
                  : expenseDescription.trim() || undefined,
                expenseStatus: expenseApproved
                  ? meeting?.expenseStatus
                  : claimChanged
                    ? expenseAmt > 0
                      ? "pending"
                      : "none"
                    : meeting?.expenseStatus,
                expenseApproved: expenseApproved
                  ? meeting?.expenseApproved
                  : claimChanged
                    ? undefined
                    : meeting?.expenseApproved,
                expenseId: expenseApproved
                  ? meeting?.expenseId
                  : claimChanged
                    ? undefined
                    : meeting?.expenseId,
                branchId: meeting?.branchId ?? cellBranchId,
                createdAt: meeting?.createdAt ?? Date.now(),
              };
              await db.transaction(
                "rw",
                [db.cellMeetings, db.users, db.notifications],
                async () => {
                  await db.cellMeetings.put(data);
                  if (!meeting) {
                    await notifyCellReportSubmitted(data, cellName);
                  }
                },
              );
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
  const baseCurrency = useBaseCurrency();

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
          <span className="text-foreground">
            {formatCurrency(meeting.offertoryReported, baseCurrency.code)}
          </span>{" "}
          (ref {meeting.reportRef}). Enter what was actually received — it can be less than, equal
          to, or more than the reported amount.
        </p>
        <div className="space-y-1.5">
          <Label>Amount received ({baseCurrency.code})</Label>
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

function ApproveExpenseDialog({
  meeting,
  cellName,
  cellLeaderId,
  approverId,
  onClose,
}: {
  meeting: CellMeeting;
  cellName: string;
  cellLeaderId: string | undefined;
  approverId: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(meeting.expenseClaimed ?? 0));
  const baseCurrency = useBaseCurrency();

  async function approve() {
    const numericAmount = Number(amount);
    if (amount === "" || Number.isNaN(numericAmount) || numericAmount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      const department = await ensureCellFellowshipsDepartment();
      const expenseId = uid();
      await db.transaction(
        "rw",
        [db.cellMeetings, db.expenses, db.users, db.notifications],
        async () => {
          await db.expenses.add({
            id: expenseId,
            departmentId: department.id,
            amount: numericAmount,
            description: `${cellName} — ${meeting.reportRef} — ${meeting.expenseDescription ?? "Cell expense"}`,
            enteredBy: approverId,
            branchId: meeting.branchId,
            createdAt: Date.now(),
          });
          await db.cellMeetings.update(meeting.id, {
            expenseApproved: numericAmount,
            expenseStatus: "approved",
            expenseId,
          });
          await notifyCellExpenseApproved(meeting, cellName, cellLeaderId);
        },
      );
      toast.success("Expense approved and posted to Expenses");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve expense");
    }
  }

  async function reject() {
    try {
      await db.cellMeetings.update(meeting.id, { expenseStatus: "rejected" });
      toast.success("Expense claim rejected");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject expense");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            Approve expense — {format(new Date(meeting.date), "PPP")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The cell leader reported spending{" "}
          <span className="text-foreground">
            {formatCurrency(meeting.expenseClaimed ?? 0, baseCurrency.code)}
          </span>{" "}
          on: <span className="text-foreground">{meeting.expenseDescription}</span>. Approving posts
          this amount to Expenses against the Cell Fellowships department.
        </p>
        <div className="space-y-1.5">
          <Label>Amount to approve ({baseCurrency.code})</Label>
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={reject}>
            <X className="mr-1 h-4 w-4" /> Reject
          </Button>
          <Button onClick={approve}>
            <Check className="mr-1 h-4 w-4" /> Approve
          </Button>
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
  const [guestDraftName, setGuestDraftName] = useState<string | null>(null);
  const memberRecords = records.filter((r) => r.memberId);
  const guestRecords = records.filter((r) => !r.memberId && r.guestName);
  const map = new Map(memberRecords.map((r) => [r.memberId as string, r]));
  const presentIds = new Set(
    memberRecords.filter((r) => r.present).map((r) => r.memberId as string),
  );

  const displayedIds = new Set([
    ...roster.map((m) => m.id),
    ...memberRecords.map((r) => r.memberId as string),
  ]);
  const displayed = allMembers.filter((m) => displayedIds.has(m.id));
  const guestPresentCount = guestRecords.filter((r) => r.present).length;

  async function toggle(memberId: string, present: boolean) {
    const existing = map.get(memberId);
    if (existing) {
      await db.cellAttendance.update(existing.id, { present });
    } else {
      await db.cellAttendance.add({ id: uid(), meetingId: meeting.id, memberId, present });
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              Attendance — {format(new Date(meeting.date), "PPP")}
            </DialogTitle>
          </DialogHeader>
          {meeting.topic && <p className="text-sm text-muted-foreground">{meeting.topic}</p>}
          <AttendanceBreakdown
            roster={displayed}
            presentIds={presentIds}
            guestCount={guestPresentCount}
          />
          {canEdit && (
            <MemberCombobox
              members={allMembers}
              excludeIds={displayedIds}
              onSelect={(m) => toggle(m.id, true)}
              allowGuestAdd
              onAddGuest={(name) => setGuestDraftName(name)}
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
          {guestRecords.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Guests</Label>
              {guestRecords.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
                >
                  <span className="text-sm">
                    {r.guestName}{" "}
                    <span className="text-xs text-muted-foreground">
                      {r.guestPhone || "No phone"}
                    </span>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Remove ${r.guestName}`}
                      onClick={() => db.cellAttendance.delete(r.id)}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {guestDraftName !== null && (
        <GuestDialog
          meetingId={meeting.id}
          defaultName={guestDraftName}
          onClose={() => setGuestDraftName(null)}
        />
      )}
    </>
  );
}

function GuestDialog({
  meetingId,
  defaultName,
  onClose,
}: {
  meetingId: string;
  defaultName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");

  async function save() {
    if (!name.trim()) {
      toast.error("Enter a name");
      return;
    }
    try {
      await db.cellAttendance.add({
        id: uid(),
        meetingId,
        guestName: name.trim(),
        guestPhone: phone.trim() || undefined,
        present: true,
      });
      toast.success("Guest added");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add guest");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Add guest</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone (optional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Add guest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
