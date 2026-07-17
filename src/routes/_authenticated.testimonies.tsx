import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, MessageCircleHeart } from "lucide-react";
import { db, uid, TESTIMONY_CATEGORIES, type Testimony, type TestimonyCategory } from "@/lib/db";
import { notifyTestimonyAdded } from "@/lib/notifications";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/testimonies")({
  component: TestimoniesPage,
});

function TestimoniesPage() {
  const { session } = useSession();
  const testimonies = useLiveQuery(() => db.testimonies.toArray(), []) ?? [];
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const sorted = [...testimonies].sort((a, b) => b.createdAt - a.createdAt);
  const [open, setOpen] = useState(false);

  if (!session) return null;

  return (
    <div>
      <PageHeader
        title="Testimonies"
        description="Share what God has done — visible to everyone."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Share a testimony
              </Button>
            </DialogTrigger>
            {open && (
              <TestimonyDialog currentUserId={session.userId} onClose={() => setOpen(false)} />
            )}
          </Dialog>
        }
      />
      <div className="space-y-3">
        {sorted.map((t) => {
          const author = users.find((u) => u.id === t.userId);
          return (
            <Card key={t.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{author?.fullName ?? "Unknown"}</span>
                      <Badge variant="secondary">{t.category}</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {t.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDistanceToNow(t.createdAt, { addSuffix: true })}
                    </span>
                    {session.role === "admin" && (
                      <DeleteButton
                        label={`Delete testimony from ${author?.fullName ?? "this user"}`}
                        title="Delete this testimony?"
                        description="This can't be undone."
                        onConfirm={async () => {
                          try {
                            await db.testimonies.delete(t.id);
                            toast.success("Testimony deleted");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to delete");
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {sorted.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <MessageCircleHeart className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No testimonies shared yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}

function TestimonyDialog({
  currentUserId,
  onClose,
}: {
  currentUserId: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<TestimonyCategory>("Salvation");
  const [body, setBody] = useState("");

  async function save() {
    if (!body.trim()) {
      toast.error("Enter your testimony");
      return;
    }
    try {
      const testimony: Testimony = {
        id: uid(),
        userId: currentUserId,
        category,
        body: body.trim(),
        createdAt: Date.now(),
      };
      await db.transaction("rw", [db.testimonies, db.users, db.notifications], async () => {
        await db.testimonies.add(testimony);
        await notifyTestimonyAdded(testimony);
      });
      toast.success("Testimony shared");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to share testimony");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">Share a testimony</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as TestimonyCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TESTIMONY_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Testimony</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Share what God has done…"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Share testimony</Button>
      </DialogFooter>
    </DialogContent>
  );
}
