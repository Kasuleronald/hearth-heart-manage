import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRequisitionFn } from "@/server/requisitions";
import { useBaseCurrency } from "@/lib/currency";
import { useDepartmentTerm } from "@/lib/terminology";
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
  onClose,
}: {
  departments: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { singular: departmentSingular, plural: departmentPlural } = useDepartmentTerm();
  const [departmentId, setDepartmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const baseCurrency = useBaseCurrency();

  const createMutation = useMutation({
    mutationFn: (input: { departmentId: string; amount: number; reason: string }) =>
      createRequisitionFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      toast.success("Requisition submitted");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit requisition"),
  });

  function save() {
    if (!departmentId) {
      toast.error(`Select a ${departmentSingular.toLowerCase()}`);
      return;
    }
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter a reason");
      return;
    }
    createMutation.mutate({ departmentId, amount: numericAmount, reason: reason.trim() });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="font-display">Submit a requisition</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{departmentSingular}</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder={`Select a ${departmentSingular.toLowerCase()}`} />
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
              Create a {departmentSingular.toLowerCase()} on the {departmentPlural} page first.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Amount ({baseCurrency.code})</Label>
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
        <Button onClick={save} disabled={createMutation.isPending}>
          Submit requisition
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
