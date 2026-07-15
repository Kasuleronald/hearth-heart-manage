import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Users, Users2, CalendarDays, GraduationCap } from "lucide-react";
import { db } from "@/lib/db";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format } from "date-fns";

export function QuickSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const cells = useLiveQuery(() => db.cells.toArray(), []) ?? [];
  const classes = useLiveQuery(() => db.classes.toArray(), []) ?? [];
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];

  function go(to: string, params?: Record<string, string>) {
    onOpenChange(false);
    navigate({ to, params } as never);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a member, cell, or event…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Members">
          {members.map((m) => (
            <CommandItem
              key={m.id}
              value={`member ${m.firstName} ${m.lastName}`}
              onSelect={() => go("/members/$id", { id: m.id })}
            >
              <Users className="h-4 w-4" />
              {m.firstName} {m.lastName}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Cell fellowships">
          {cells.map((c) => (
            <CommandItem
              key={c.id}
              value={`cell ${c.name}`}
              onSelect={() => go("/cells/$id", { id: c.id })}
            >
              <Users2 className="h-4 w-4" />
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Discipleship classes">
          {classes.map((c) => (
            <CommandItem
              key={c.id}
              value={`class ${c.name}`}
              onSelect={() => go("/classes/$id", { id: c.id })}
            >
              <GraduationCap className="h-4 w-4" />
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Events">
          {events.map((e) => (
            <CommandItem
              key={e.id}
              value={`event ${e.title}`}
              onSelect={() => go("/events/$id", { id: e.id })}
            >
              <CalendarDays className="h-4 w-4" />
              {e.title}
              <span className="ml-auto text-xs text-muted-foreground">
                {format(new Date(e.date), "MMM d")}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
