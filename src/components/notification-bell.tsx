import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  listNotificationsFn,
  markNotificationReadFn,
  markAllNotificationsReadFn,
} from "@/server/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Maps a Notification's entityType to the route that shows that record.
const ENTITY_ROUTES: Record<string, string> = {
  member: "/members/$id",
  event: "/events/$id",
  requisition: "/requisitions",
  cell: "/cells/$id",
  testimony: "/testimonies",
  pledge: "/pledges",
};

type OrgNotification = Awaited<ReturnType<typeof listNotificationsFn>>[number];

// No push infra exists yet — a short poll keeps the bell reasonably fresh
// without a websocket/SSE channel.
const REFETCH_INTERVAL_MS = 45_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotificationsFn(),
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationReadFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsReadFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleClick(n: OrgNotification) {
    if (!n.read) markReadMutation.mutate(n.id);
    const route = n.entityType ? ENTITY_ROUTES[n.entityType] : undefined;
    if (route && n.entityId) {
      navigate({ to: route, params: { id: n.entityId } } as never);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                markAllReadMutation.mutate();
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          )}
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
              onClick={() => handleClick(n)}
            >
              <span className={`text-sm ${n.read ? "text-muted-foreground" : "font-medium"}`}>
                {n.message}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
