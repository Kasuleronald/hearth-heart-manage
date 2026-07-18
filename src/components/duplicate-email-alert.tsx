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
  allowContinue,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: DuplicateEmailMatch[];
  allowContinue: boolean;
  onContinue: () => void;
}) {
  const match = matches[0];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Is this the same person?</AlertDialogTitle>
          <AlertDialogDescription>
            {match && (
              <>
                <span className="font-medium text-foreground">{match.name}</span> ({match.detail})
                already uses this email address.{" "}
              </>
            )}
            {allowContinue
              ? "If it's the same person, go back rather than creating a duplicate record. If it's a different person who just happens to share this email, you can continue."
              : "Sign-in email must be unique, so if this is the same person, edit their existing account instead of creating a new one. If it's a different person, go back and use a different email."}
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
