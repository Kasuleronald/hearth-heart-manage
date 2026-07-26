import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import {
  getEventFn,
  listEventAttendanceFn,
  setEventAttendanceFn,
  submitEventReportFn,
} from "@/server/events";
import { listMembersFn } from "@/server/members";
import {
  useSession,
  canAccessRecordBranch,
  canSubmitEventReport,
  canToggleCurrency,
} from "@/lib/auth";
import { useDisplayCurrency } from "@/lib/currency-toggle";
import { useBaseCurrency } from "@/lib/currency";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AttendanceBreakdown } from "@/components/attendance-breakdown";
import { MemberCombobox } from "@/components/member-combobox";
import { CurrencyToggle } from "@/components/currency-toggle";
import { describeRecurrence } from "@/lib/recurrence";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/events/$id")({
  component: EventDetail,
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Event not found.</div>
  ),
});

type OrgEvent = Awaited<ReturnType<typeof getEventFn>>;

function EventDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const eventQuery = useQuery({
    queryKey: ["events", id],
    queryFn: () => getEventFn({ data: { id } }),
    retry: false,
  });
  const membersQuery = useQuery({ queryKey: ["members"], queryFn: () => listMembersFn() });
  const attendanceQuery = useQuery({
    queryKey: ["event-attendance", id],
    queryFn: () => listEventAttendanceFn({ data: { eventId: id } }),
  });
  const event = eventQuery.data;
  const members = membersQuery.data ?? [];
  const attendance = attendanceQuery.data ?? [];
  const canToggle = session ? canToggleCurrency(session.role, session.financeTier) : false;
  const { format: formatAmount, base } = useDisplayCurrency(canToggle);
  const [reportOpen, setReportOpen] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: (vars: { memberId: string; present: boolean }) =>
      setEventAttendanceFn({ data: { eventId: id, ...vars } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-attendance", id] }),
  });

  if (eventQuery.isLoading) return null;
  if (eventQuery.isError || !event) throw notFound();
  if (session && !canAccessRecordBranch(session.branchId, event.branchId ?? undefined)) {
    throw notFound();
  }

  const canReport = session ? canSubmitEventReport(session.role, session.allowedModules) : false;
  const hasReport = !!event.reportSubmittedAt;

  const map = new Map(attendance.map((a) => [a.memberId, a]));
  const presentCount = attendance.filter((a) => a.present).length;
  const presentIds = new Set(attendance.filter((a) => a.present).map((a) => a.memberId));
  const activeMembers = members.filter((m) => m.status !== "inactive");
  const displayedIds = new Set([
    ...activeMembers.map((m) => m.id),
    ...attendance.map((a) => a.memberId),
  ]);
  const displayedMembers = members.filter((m) => displayedIds.has(m.id));

  function toggle(memberId: string, present: boolean) {
    toggleMutation.mutate({ memberId, present });
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/events">
          <ArrowLeft className="mr-1 h-4 w-4" /> All events
        </Link>
      </Button>
      <PageHeader
        title={event.title}
        description={
          format(new Date(event.date), "PPPP") +
          (event.startTime
            ? ` · ${event.startTime}${event.endTime ? ` – ${event.endTime}` : ""}`
            : "") +
          (event.recurrence ? ` · ${describeRecurrence(event.recurrence)}` : "")
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {event.type.replace("_", " ")}
            </Badge>
            <Badge className="bg-primary text-primary-foreground border-0">
              {presentCount} present
            </Badge>
            {!!event.offertoryAmount && (
              <Badge variant="secondary">{formatAmount(event.offertoryAmount)}</Badge>
            )}
            {canToggle && <CurrencyToggle baseCode={base.code} />}
            {canReport && (
              <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <FileText className="mr-2 h-4 w-4" />
                    {hasReport ? "Edit report" : "Submit report"}
                  </Button>
                </DialogTrigger>
                {reportOpen && (
                  <EventReportDialog event={event} onClose={() => setReportOpen(false)} />
                )}
              </Dialog>
            )}
          </div>
        }
      />

      {hasReport && (
        <Card className="mb-4">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Event report</h3>
              <span className="text-xs text-muted-foreground">
                Submitted {format(new Date(event.reportSubmittedAt!), "PPP")}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {event.venue && (
                <div>
                  <div className="text-xs text-muted-foreground">Venue</div>
                  <div>{event.venue}</div>
                </div>
              )}
              {event.reportAttendance != null && (
                <div>
                  <div className="text-xs text-muted-foreground">Attendance</div>
                  <div>{event.reportAttendance}</div>
                </div>
              )}
              {event.ministers && (
                <div>
                  <div className="text-xs text-muted-foreground">Ministers</div>
                  <div>{event.ministers}</div>
                </div>
              )}
              {!!event.offertoryAmount && (
                <div>
                  <div className="text-xs text-muted-foreground">Offertory</div>
                  <div>{formatAmount(event.offertoryAmount)}</div>
                </div>
              )}
            </div>
            {event.strengths && (
              <div>
                <div className="text-xs text-muted-foreground">Strengths</div>
                <p className="whitespace-pre-wrap text-sm">{event.strengths}</p>
              </div>
            )}
            {event.challengesFaced && (
              <div>
                <div className="text-xs text-muted-foreground">Challenges faced</div>
                <p className="whitespace-pre-wrap text-sm">{event.challengesFaced}</p>
              </div>
            )}
            {event.recommendations && (
              <div>
                <div className="text-xs text-muted-foreground">Recommendations for next time</div>
                <p className="whitespace-pre-wrap text-sm">{event.recommendations}</p>
              </div>
            )}
            {event.reportNotes && (
              <div>
                <div className="text-xs text-muted-foreground">More notes</div>
                <p className="whitespace-pre-wrap text-sm">{event.reportNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <h3 className="font-display text-lg font-semibold">Attendance</h3>
          <div className="mb-3 mt-1">
            <AttendanceBreakdown roster={displayedMembers} presentIds={presentIds} />
          </div>
          <MemberCombobox
            members={members}
            excludeIds={displayedIds}
            onSelect={(m) => toggle(m.id, true)}
          />
          <div className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
            {displayedMembers.map((m) => {
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
                    onCheckedChange={(v) => toggle(m.id, Boolean(v))}
                  />
                </label>
              );
            })}
            {displayedMembers.length === 0 && (
              <p className="text-sm text-muted-foreground">No active members to check in.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EventReportDialog({ event, onClose }: { event: OrgEvent; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [venue, setVenue] = useState(event.venue ?? "");
  const [reportAttendance, setReportAttendance] = useState(
    event.reportAttendance != null ? String(event.reportAttendance) : "",
  );
  const [ministers, setMinisters] = useState(event.ministers ?? "");
  const [strengths, setStrengths] = useState(event.strengths ?? "");
  const [challengesFaced, setChallengesFaced] = useState(event.challengesFaced ?? "");
  const [offertoryAmount, setOffertoryAmount] = useState(
    event.offertoryAmount != null ? String(event.offertoryAmount) : "",
  );
  const [recommendations, setRecommendations] = useState(event.recommendations ?? "");
  const [reportNotes, setReportNotes] = useState(event.reportNotes ?? "");
  const baseCurrency = useBaseCurrency();

  const saveMutation = useMutation({
    mutationFn: () =>
      submitEventReportFn({
        data: {
          eventId: event.id,
          venue: venue || undefined,
          reportAttendance: reportAttendance ? Number(reportAttendance) : undefined,
          ministers: ministers || undefined,
          strengths: strengths || undefined,
          challengesFaced: challengesFaced || undefined,
          offertoryAmount: offertoryAmount ? Number(offertoryAmount) : undefined,
          recommendations: recommendations || undefined,
          reportNotes: reportNotes || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events", event.id] });
      toast.success("Report submitted — everyone has been notified");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit report"),
  });

  return (
    <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display">Event report — {event.title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Venue</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Attendance</Label>
            <Input
              type="number"
              min="0"
              value={reportAttendance}
              onChange={(e) => setReportAttendance(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ministers</Label>
          <Input
            value={ministers}
            onChange={(e) => setMinisters(e.target.value)}
            placeholder="Who ministered"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Offertory ({baseCurrency.code})</Label>
          <Input
            type="number"
            min="0"
            value={offertoryAmount}
            onChange={(e) => setOffertoryAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Strengths</Label>
          <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label>Challenges faced</Label>
          <Textarea
            value={challengesFaced}
            onChange={(e) => setChallengesFaced(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Recommendations for next time</Label>
          <Textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>More notes</Label>
          <Textarea value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} rows={2} />
        </div>
        <p className="text-xs text-muted-foreground">
          Submitting notifies every user in the app, and by email for anyone with email
          notifications turned on.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          Submit report
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
