import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { changePlatformAdminPasswordFn } from "@/server/auth";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 8;

export function ChangePlatformPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (next !== confirm) throw new Error("Passwords don't match");
      return changePlatformAdminPasswordFn({
        data: { currentPassword: current, newPassword: next },
      });
    },
    onSuccess: () => {
      toast.success("Password changed");
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to change password"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Change password" aria-label="Change password">
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
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <PasswordInput
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <PasswordInput
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
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
