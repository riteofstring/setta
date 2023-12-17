import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { TbVersions } from "react-icons/tb";
import { Item } from "utils/atoms/dropdown/item";

export const VersionsButton = () => {
  return (
    <DropdownMenu.Root asChild>
      <section className="flex content-center">
        <DropdownMenu.Trigger className="place-items center nodrag mr-3 grid h-3 w-3 cursor-pointer rounded-full bg-transparent p-1 text-runcoder-300 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:outline-none focus-visible:ring-2 dark:text-runcoder-600 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300">
          <TbVersions className="h-3 w-3" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="z-[1000] flex select-none flex-col gap-1 rounded-md bg-white py-2 px-4 drop-shadow dark:bg-runcoder-800"
          >
            <Items />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </section>
    </DropdownMenu.Root>
  );
};

function Items() {
  return (
    <>
      <Item>Version 1</Item>
      <Item>Version 2</Item>
      <Item>Version 3</Item>
      <Item>Version 4</Item>
    </>
  );
}
