import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { db, type Notification } from "@/lib/db";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications";
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
};

export function NotificationBell({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const all =
    useLiveQuery(
      () => db.notifications.where("recipientUserId").equals(userId).toArray(),
      [userId],
    ) ?? [];
  const notifications = [...all].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  const unreadCount = all.filter((n) => !n.read).length;

  async function handleClick(n: Notification) {
    if (!n.read) await markNotificationRead(n.id);
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
                markAllNotificationsRead(userId);
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
                {formatDistanceToNow(n.createdAt, { addSuffix: true })}
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
