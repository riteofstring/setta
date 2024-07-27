import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function StandardDropdown({ trigger, content, align = "start" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          className="z-[1000] flex select-none flex-col gap-1 rounded-md bg-white p-2 drop-shadow dark:bg-runcoder-800"
        >
          {content}
          <DropdownMenu.Arrow className="[fill:rgb(255,_255,_255)] dark:[fill:rgb(30,_41,_59)]" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
