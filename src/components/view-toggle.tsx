import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CollectionView = "tiles" | "list";

// A small tiles/list switch reused by every page that renders a grid of
// entity cards (Organizations, Departments, Cells, Households, ...) — lets
// the same data render either as a scannable grid or a dense stacked list
// once the collection grows large, without changing what's shown per item.
export function ViewToggle({
  view,
  onChange,
}: {
  view: CollectionView;
  onChange: (view: CollectionView) => void;
}) {
  return (
    <div className="flex items-center rounded-md border p-0.5">
      <Button
        type="button"
        size="icon"
        variant={view === "tiles" ? "secondary" : "ghost"}
        className="h-8 w-8"
        aria-label="Tile view"
        aria-pressed={view === "tiles"}
        title="Tile view"
        onClick={() => onChange("tiles")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={view === "list" ? "secondary" : "ghost"}
        className="h-8 w-8"
        aria-label="List view"
        aria-pressed={view === "list"}
        title="List view"
        onClick={() => onChange("list")}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
