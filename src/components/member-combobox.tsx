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
}: {
  members: Member[];
  excludeIds: Set<string>;
  onSelect: (member: Member) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const available = members.filter((m) => !excludeIds.has(m.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open}>
          <UserPlus className="mr-1 h-4 w-4" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search members…" />
          <CommandList>
            <CommandEmpty>No member found — add them from the Members page first.</CommandEmpty>
            <CommandGroup>
              {available.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.firstName} ${m.lastName}`}
                  onSelect={() => {
                    onSelect(m);
                    setOpen(false);
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
