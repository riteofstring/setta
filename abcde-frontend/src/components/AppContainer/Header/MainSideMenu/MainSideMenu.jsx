import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { logout } from "dbRequests/authentication";
import { resetAllStores } from "models/utils";
import { FiMenu } from "react-icons/fi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { Item } from "utils/atoms/dropdown/item";

export default function MainSideMenu() {
  const onClickLogout = () => {
    logout();
    resetAllStores();
  };

  return (
    <div className="flex flex-1 justify-end content-center">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton icon={<FiMenu />} />
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
