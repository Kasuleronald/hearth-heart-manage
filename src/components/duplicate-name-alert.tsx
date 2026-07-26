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

export function DuplicateNameAlert({
  open,
  onOpenChange,
  name,
  kind,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  kind: string;
  onContinue: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Already added?</AlertDialogTitle>
          <AlertDialogDescription>
            A {kind} named <span className="font-medium text-foreground">"{name}"</span> already
            exists. If this is the same one, go back rather than creating a duplicate. If it's a
            different one that just happens to share the name, you can continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Add anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
