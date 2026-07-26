import { useQuery } from "@tanstack/react-query";
import { listBranchesFn } from "@/server/branches";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Shared branch picker for every entity form that carries an optional
// branchId. Hides itself when no branches exist yet, so single-branch
// churches never see it.
export function BranchField({
  value,
  onChange,
  label = "Branch",
}: {
  value: string; // "" = whole church
  onChange: (v: string) => void;
  label?: string;
}) {
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => listBranchesFn() });
  const branches = branchesQuery.data ?? [];
  if (branches.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Whole church" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Whole church</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
