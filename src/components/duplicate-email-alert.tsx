import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DuplicateEmailMatch } from "@/lib/duplicate-contact";

export function DuplicateEmailAlert({
  open,
  onOpenChange,
  matches,
  subject,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: DuplicateEmailMatch[];
  subject: "user" | "member";
  onContinue: () => void;
}) {
  const match = matches[0];
  // A user account can never share a sign-in email with anyone else — a
  // member record can, but only after the admin is looped in.
  const blockedByUser = matches.some((m) => m.kind === "user");
  const allowContinue = !blockedByUser;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">
            {blockedByUser && subject === "member"
              ? "Can't add this member"
              : "Is this the same person?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {match && (
              <>
                <span className="font-medium text-foreground">{match.name}</span> ({match.detail})
                already uses this email address.{" "}
              </>
            )}
            {blockedByUser
              ? subject === "member"
                ? "Members can't be added with an email that already belongs to a user account. Contact the admin to resolve this."
                : "Sign-in email must be unique, so if this is the same person, edit their existing account instead of creating a new one. If it's a different person, go back and use a different email."
              : "If it's the same person, go back rather than creating a duplicate record. If it's a different person who just happens to share this email, you can continue."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          {allowContinue && (
            <AlertDialogAction onClick={onContinue}>
              No, different person — continue
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
