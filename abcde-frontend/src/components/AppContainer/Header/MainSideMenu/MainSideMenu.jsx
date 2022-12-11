import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { resetAllSlices } from "models/utils";
import { FiMenu } from "react-icons/fi";
import { logout } from "thunks/authentication";
import { twClasses as MenuBarButtonClasses } from "utils/atoms/buttons/MenuBarButton";
import { Item } from "utils/atoms/dropdown/item";

export default function MainSideMenu() {
  const onClickLogout = () => {
    logout();
    resetAllSlices();
  };

  return (
    <div className="flex flex-1 justify-end content-center">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={MenuBarButtonClasses}>
          <FiMenu />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="bg-white py-2 px-4 rounded-md select-none drop-shadow z-[1000] flex flex-col gap-1"
          >
            <Items onClickLogout={onClickLogout} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
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
