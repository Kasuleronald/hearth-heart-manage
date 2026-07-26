import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, MessageCircleHeart, Search } from "lucide-react";
import { TESTIMONY_CATEGORIES, type TestimonyCategory } from "@/lib/db";
import { listTestimoniesFn, createTestimonyFn, deleteTestimonyFn } from "@/server/testimonies";
import { listOrgUsersFn } from "@/server/users";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const queryClient = useQueryClient();
  const { session } = useSession();
  const testimoniesQuery = useQuery({
    queryKey: ["testimonies"],
    queryFn: () => listTestimoniesFn(),
  });
  const usersQuery = useQuery({ queryKey: ["org-users"], queryFn: () => listOrgUsersFn() });
  const sorted = testimoniesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTestimonyFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testimonies"] });
      toast.success("Testimony deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  if (!session) return null;

  const filtered = sorted.filter((t) => {
    if (!q) return true;
    const author = users.find((u) => u.id === t.userId);
    const s = `${t.body} ${t.category} ${author?.fullName ?? ""}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

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
            {open && <TestimonyDialog onClose={() => setOpen(false)} />}
          </Dialog>
        }
      />
      {sorted.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search testimonies…"
            className="pl-9"
          />
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((t) => {
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
                      {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                    </span>
                    {session.role === "admin" && (
                      <DeleteButton
                        label={`Delete testimony from ${author?.fullName ?? "this user"}`}
                        title="Delete this testimony?"
                        description="This can't be undone."
                        onConfirm={async () => {
                          await deleteMutation.mutateAsync(t.id);
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
        {sorted.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches for "{q}".</p>
        )}
      </div>
    </div>
  );
}

function TestimonyDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<TestimonyCategory>("Salvation");
  const [body, setBody] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => createTestimonyFn({ data: { category, body: body.trim() } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testimonies"] });
      toast.success("Testimony shared");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to share testimony"),
  });

  function save() {
    if (!body.trim()) {
      toast.error("Enter your testimony");
      return;
    }
    saveMutation.mutate();
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
        <Button onClick={save} disabled={saveMutation.isPending}>
          Share testimony
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
