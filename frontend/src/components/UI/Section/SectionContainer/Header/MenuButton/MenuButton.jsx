import * as Menubar from "@radix-ui/react-menubar";
import { FiSettings } from "react-icons/fi";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

function MenuButton() {
  // hover:bg-runcoder-100 dark:hover:bg-runcoder-900
  return (
    <Menubar.Root>
      <MenuDropdown
        padding="p-1"
        rounded="rounded-full"
        triggerStyle="ml-1"
        trigger={
          <FiSettings className="bg-transparent text-runcoder-300 transition-colors duration-150 hover:text-runcoder-500 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:text-runcoder-300" />
        }
      >
        <MenuItem>Save</MenuItem>
        <MenuItem>Save As</MenuItem>
        <MenuItem>Versions</MenuItem>
        <MenuItem>Derive</MenuItem>
        <MenuItem>Multi-Run</MenuItem>
        <MenuItem>Freeze</MenuItem>
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
