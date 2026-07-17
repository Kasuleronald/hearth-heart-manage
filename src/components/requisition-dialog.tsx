import { useState } from "react";
import { db, uid, type Department } from "@/lib/db";
import { notifyRequisitionSubmitted } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function RequisitionDialog({
  departments,
  currentUserId,
  onClose,
}: {
  departments: Department[];
  currentUserId: string;
  onClose: () => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  async function save() {
    if (!departmentId) return toast.error("Select a department");
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      return toast.error("Enter a valid amount");
    }
    if (!reason.trim()) return toast.error("Enter a reason");
    try {
      const requisition = {
        id: uid(),
        requestedBy: currentUserId,
        departmentId,
        amount: numericAmount,
        reason: reason.trim(),
        status: "pending" as const,
        createdAt: Date.now(),
      };
      await db.transaction(
        "rw",
        [db.requisitions, db.users, db.departments, db.notifications],
        async () => {
          await db.requisitions.add(requisition);
          await notifyRequisitionSubmitted(requisition);
        },
      );
      toast.success("Requisition submitted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit requisition");
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">Submit a requisition</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Department</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {departments.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a department on the Departments page first.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Amount (UGX)</Label>
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What is this money needed for?"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Submit requisition</Button>
      </DialogFooter>
    </DialogContent>
  );
}
