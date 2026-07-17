import { useLiveQuery } from "dexie-react-hooks";
import { Building } from "lucide-react";
import { db } from "@/lib/db";
import { useBranchFilter } from "@/lib/branch-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Only rendered for church-wide users (branchId undefined on their session) —
// branch-scoped users are always pinned to their own branch and never see this.
export function BranchSwitcher() {
  const branches = useLiveQuery(() => db.branches.orderBy("name").toArray(), []) ?? [];
  const [selected, setSelected] = useBranchFilter();

  if (branches.length === 0) return null;

  return (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger className="w-44">
        <Building className="mr-1 h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All branches</SelectItem>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
