import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FiMenu } from "react-icons/fi";
import { logout } from "thunks/user/logout";
import { Item } from "utils/atoms/dropdown/item";

export function MainSideMenu() {
  return (
    <DropdownMenu.Root asChild>
      <section className="flex content-center">
        <DropdownMenu.Trigger className="place-items0center nodrag grid h-4 w-4 cursor-pointer rounded-full bg-transparent p-1 text-slate-500 transition-colors duration-150 hover:bg-slate-200 focus-visible:ring-2 dark:text-slate-50">
          <FiMenu />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="z-[1000] flex select-none flex-col gap-1 rounded-md bg-white py-2 px-4 drop-shadow"
          >
            <Items onClickLogout={logout} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </section>
    </DropdownMenu.Root>
  );
}

function Items({ onClickLogout }) {
  return (
    <>
      <Item>Profile</Item>
      <Item>Settings</Item>
      <Item onClick={onClickLogout}>Logout</Item>
    </>
  );
}
