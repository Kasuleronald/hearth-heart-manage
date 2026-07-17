import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { db, uid, type ClassSession, type Member } from "@/lib/db";
import { useBaseCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { PageHeader } from "@/components/page-header";
import { CurrencyToggle } from "@/components/currency-toggle";
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
import { useSession, canEditClass, canAccessRecordBranch, canToggleCurrency } from "@/lib/auth";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/classes/$id")({
  component: ClassDetail,
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Class not found.</div>
  ),
});

function ClassDetail() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const cls = useLiveQuery(() => db.classes.get(id), [id]);
  const facilitator = useLiveQuery(
    () => (cls?.facilitatorId ? db.users.get(cls.facilitatorId) : undefined),
    [cls?.facilitatorId],
  );
  const members = useLiveQuery(() => db.members.where("classId").equals(id).toArray(), [id]) ?? [];
  const allMembers = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const sessions =
    useLiveQuery(
      () => db.classSessions.where("classId").equals(id).reverse().sortBy("date"),
      [id],
    ) ?? [];
  const [addingMember, setAddingMember] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [attSession, setAttSession] = useState<ClassSession | null>(null);
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);

  if (cls === undefined) return null;
  if (!cls) throw notFound();
  if (session && !canAccessRecordBranch(session.branchId, cls.branchId)) throw notFound();

  const canEdit = session ? canEditClass(session.role, cls.facilitatorId, session.userId) : false;
  const unassigned = allMembers.filter((m) => !m.classId);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/classes">
          <ArrowLeft className="mr-1 h-4 w-4" /> All classes
        </Link>
      </Button>
      <PageHeader
        title={cls.name}
        description={`${cls.meetingDay ?? "Any day"} • ${cls.meetingLocation ?? "—"}`}
        actions={
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            Facilitator:{" "}
            <span className="text-foreground">{facilitator?.fullName ?? "Unassigned"}</span>
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
                      <DialogTitle className="font-display">Add to {cls.name}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-80 overflow-y-auto">
                      {unassigned.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          All members already belong to a class.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {unassigned.map((m) => (
                            <li key={m.id}>
                              <button
                                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                                onClick={async () => {
                                  await db.members.update(m.id, { classId: cls.id });
                                  toast.success(`Added ${m.firstName} to ${cls.name}`);
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
                        await db.members.update(m.id, { classId: undefined });
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
              <h3 className="font-display text-lg font-semibold">Sessions</h3>
              {canEdit && (
                <Dialog
                  open={sessionDialogOpen}
                  onOpenChange={(o) => {
                    setSessionDialogOpen(o);
                    if (!o) setEditingSession(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => setEditingSession(null)}>
                      <Plus className="mr-1 h-4 w-4" /> New session
                    </Button>
                  </DialogTrigger>
                  <SessionDialog
                    classId={cls.id}
                    classBranchId={cls.branchId}
                    session={editingSession}
                    onClose={() => setSessionDialogOpen(false)}
                  />
                </Dialog>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/60"
                >
                  <button className="text-left" onClick={() => setAttSession(s)}>
                    <div className="font-medium">{format(new Date(s.date), "PPP")}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {s.topic && <span>{s.topic}</span>}
                      {!!s.offertoryAmount && <span>{formatAmount(s.offertoryAmount)}</span>}
                    </div>
                  </button>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit session on ${format(new Date(s.date), "PPP")}`}
                        onClick={() => {
                          setEditingSession(s);
                          setSessionDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        label={`Delete session on ${format(new Date(s.date), "PPP")}`}
                        title="Delete this session?"
                        description="This also removes its attendance records. This can't be undone."
                        onConfirm={async () => {
                          try {
                            await db.classAttendance.where("sessionId").equals(s.id).delete();
                            await db.classSessions.delete(s.id);
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Failed to delete session",
                            );
                          }
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
              {sessions.length === 0 && (
                <li className="text-xs text-muted-foreground">No sessions recorded.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {attSession && (
        <AttendanceDialog
          session={attSession}
          roster={members}
          allMembers={allMembers}
          canEdit={canEdit}
          onClose={() => setAttSession(null)}
        />
      )}
    </div>
  );
}

function SessionDialog({
  classId,
  classBranchId,
  session,
  onClose,
}: {
  classId: string;
  classBranchId: string | undefined;
  session: ClassSession | null;
  onClose: () => void;
}) {
  const [date, setDate] = useState(session?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [topic, setTopic] = useState(session?.topic ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [offertoryAmount, setOffertoryAmount] = useState(
    session?.offertoryAmount != null ? String(session.offertoryAmount) : "",
  );
  const baseCurrency = useBaseCurrency();
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">
          {session ? "Edit class session" : "New class session"}
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
            placeholder="What was taught?"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              await db.classSessions.put({
                id: session?.id ?? uid(),
                classId,
                date,
                topic: topic || undefined,
                notes: notes || undefined,
                offertoryAmount: amount,
                branchId: session?.branchId ?? classBranchId,
                createdAt: session?.createdAt ?? Date.now(),
              });
              toast.success(
                session ? "Session updated" : "Session created — mark attendance next.",
              );
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to save session");
            }
          }}
        >
          {session ? "Save changes" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AttendanceDialog({
  session,
  roster,
  allMembers,
  canEdit,
  onClose,
}: {
  session: ClassSession;
  roster: Member[];
  allMembers: Member[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const records =
    useLiveQuery(
      () => db.classAttendance.where("sessionId").equals(session.id).toArray(),
      [session.id],
    ) ?? [];
  const map = new Map(records.map((r) => [r.memberId, r]));
  const presentIds = new Set(records.filter((r) => r.present).map((r) => r.memberId));

  const displayedIds = new Set([...roster.map((m) => m.id), ...records.map((r) => r.memberId)]);
  const displayed = allMembers.filter((m) => displayedIds.has(m.id));

  async function toggle(memberId: string, present: boolean) {
    const existing = map.get(memberId);
    if (existing) {
      await db.classAttendance.update(existing.id, { present });
    } else {
      await db.classAttendance.add({ id: uid(), sessionId: session.id, memberId, present });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            Attendance — {format(new Date(session.date), "PPP")}
          </DialogTitle>
        </DialogHeader>
        {session.topic && <p className="text-sm text-muted-foreground">{session.topic}</p>}
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
            <p className="text-sm text-muted-foreground">No members in this class yet.</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
