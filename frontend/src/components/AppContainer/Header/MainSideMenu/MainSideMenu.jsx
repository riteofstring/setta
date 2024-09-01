import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FiMenu } from "react-icons/fi";
import { Item } from "utils/atoms/dropdown/item";

export function MainSideMenu() {
  return (
    <DropdownMenu.Root asChild>
      <section className="flex content-center">
        <DropdownMenu.Trigger className="place-items0center nodrag grid h-4 w-4 cursor-pointer rounded-full bg-transparent p-1 text-setta-500 transition-colors duration-150 hover:bg-setta-200 focus-visible:ring-2 dark:text-setta-50 dark:hover:bg-setta-900">
          <FiMenu />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="z-[1000] flex select-none flex-col gap-1 rounded-md bg-white px-4 py-2 drop-shadow dark:bg-setta-800"
          >
            <Items />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </section>
    </DropdownMenu.Root>
  );
}

function Items() {
  return (
    <>
      <Item>Profile</Item>
      <Item>Settings</Item>
    </>
  );
}
