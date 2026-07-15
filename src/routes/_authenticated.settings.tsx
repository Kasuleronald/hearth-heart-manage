import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, Database } from "lucide-react";
import { exportDatabase, importDatabase, type DatabaseBackup } from "@/lib/db";
import { downloadJson } from "@/lib/download";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function canAccessSettings(role: string) {
  return role === "admin" || role === "pastor";
}

function SettingsPage() {
  const navigate = useNavigate();
  const { session } = useSession();

  useEffect(() => {
    if (session && !canAccessSettings(session.role)) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (!session || !canAccessSettings(session.role)) return null;

  return (
    <div>
      <PageHeader title="Settings" description="Back up and restore your church's data." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExportCard />
        <ImportCard />
      </div>
    </div>
  );
}

function ExportCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Download className="h-5 w-5" /> Export backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download every household, member, cell, event and attendance record as a single JSON file.
          Keep it somewhere safe — this is the only way to recover your data if this browser's
          storage is ever cleared, or to move it to a new device. User accounts are not included.
        </p>
        <Button
          onClick={async () => {
            try {
              const backup = await exportDatabase();
              downloadJson(`my-church-backup-${format(new Date(), "yyyy-MM-dd")}.json`, backup);
              toast.success("Backup downloaded");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Export failed");
            }
          }}
        >
          <Download className="mr-2 h-4 w-4" /> Download backup
        </Button>
      </CardContent>
    </Card>
  );
}

function ImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<DatabaseBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("merge");
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as DatabaseBackup;
      if (data.format !== "my-church-backup") {
        throw new Error("This file isn't a My Church backup.");
      }
      setParsed(data);
      setFileName(file.name);
    } catch (e) {
      setParsed(null);
      setFileName("");
      toast.error(e instanceof Error ? e.message : "Couldn't read that file");
    }
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      await importDatabase(parsed, mode);
      toast.success("Backup restored");
      setParsed(null);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const counts = parsed
    ? Object.entries(parsed.tables).map(([name, rows]) => `${rows.length} ${name}`)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Upload className="h-5 w-5" /> Restore backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Restore data from a previously exported backup file.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          <Database className="mr-2 h-4 w-4" /> Choose backup file…
        </Button>

        {parsed && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="text-sm">
              <div className="font-medium">{fileName}</div>
              <div className="text-xs text-muted-foreground">
                Exported {format(new Date(parsed.exportedAt), "PPP p")} — {counts.join(", ")}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Restore mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "replace" | "merge")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge — add/update, keep existing records</SelectItem>
                  <SelectItem value="replace">Replace — erase current data first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={busy}>Restore now</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">
                    {mode === "replace" ? "Replace all data?" : "Merge backup into current data?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {mode === "replace"
                      ? "This erases all current households, members, cells, events and attendance before restoring the backup. This can't be undone."
                      : "Records in the backup will be added, and any existing record with the same ID will be overwritten. This can't be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={doImport}>Restore</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
