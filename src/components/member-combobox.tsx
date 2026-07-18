import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Member } from "@/lib/db";

export function MemberCombobox({
  members,
  excludeIds,
  onSelect,
  label = "Add attendee",
  allowGuestAdd = false,
  onAddGuest,
}: {
  members: Member[];
  excludeIds: Set<string>;
  onSelect: (member: Member) => void;
  label?: string;
  allowGuestAdd?: boolean;
  onAddGuest?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const available = members.filter((m) => !excludeIds.has(m.id));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open}>
          <UserPlus className="mr-1 h-4 w-4" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search members…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {allowGuestAdd && query.trim() ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm hover:text-primary"
                  onClick={() => {
                    onAddGuest?.(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  + Add "{query.trim()}" as a guest
                </button>
              ) : (
                "No member found — add them from the Members page first."
              )}
            </CommandEmpty>
            <CommandGroup>
              {available.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.firstName} ${m.lastName}`}
                  onSelect={() => {
                    onSelect(m);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {m.firstName} {m.lastName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
