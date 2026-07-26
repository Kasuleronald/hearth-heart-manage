import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateMyNotificationPrefsFn } from "@/server/notifications";
import { toast } from "sonner";

export function NotificationPrefsDialog({
  emailNotificationsEnabled,
}: {
  emailNotificationsEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(emailNotificationsEnabled);

  async function toggle(next: boolean) {
    setEnabled(next);
    try {
      await updateMyNotificationPrefsFn({ data: { emailNotificationsEnabled: next } });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success(next ? "Email notifications turned on" : "Email notifications turned off");
    } catch (e) {
      setEnabled(!next);
      toast.error(e instanceof Error ? e.message : "Failed to update notification preference");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title="Notification preferences"
          aria-label="Notification preferences"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Mail className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Notification preferences</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Email notifications</Label>
            <p className="text-xs text-muted-foreground">
              Also send new-event notifications to your email, on top of the in-app bell.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
