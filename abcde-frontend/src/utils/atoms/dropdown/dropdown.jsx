import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function StandardDropdown({ trigger, content, align = "start" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          className="bg-white p-2 rounded-md select-none drop-shadow z-[1000] flex flex-col gap-1"
        >
          {content}
          <DropdownMenu.Arrow className="[fill:rgb(255,_255,_255)]" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
