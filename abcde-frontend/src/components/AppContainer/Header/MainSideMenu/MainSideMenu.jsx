import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { logout } from "dbRequests/authentication";
import { resetAllStores } from "models/utils";
import { FiMenu } from "react-icons/fi";
import { Item } from "utils/atoms/dropdown/item";
import { router } from "utils/Routes/router";

export function MainSideMenu() {
  const onClickLogout = () => {
    logout();
    resetAllStores();
    router.navigate("/");
  };

  return (
    <div className="flex flex-1 justify-end content-center">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="grid place-items0center transition-colors duration-150 focus-visible:ring-2 nodrag cursor-pointer w-4 h-4 p-1 bg-transparent hover:bg-gray-200 text-gray-500 rounded-full">
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
      <Item className="hover:shadow-gray-400 outline-none border-0">
        Profile
      </Item>
      <Item>Settings</Item>
      <Item onClick={onClickLogout}>Logout</Item>
    </>
  );
}
