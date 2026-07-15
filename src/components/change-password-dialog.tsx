import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { changePassword } from "@/lib/auth";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function save() {
    try {
      if (next !== confirm) throw new Error("Passwords don't match");
      await changePassword(userId, current, next);
      toast.success("Password changed");
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change password");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title="Change password"
          aria-label="Change password"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Change password</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current password</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
