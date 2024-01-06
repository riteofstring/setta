import * as Menubar from "@radix-ui/react-menubar";
import { FiSettings } from "react-icons/fi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { DeriveButton } from "./DeriveButton/DeriveButton";

function MenuButton({ sectionId }) {
  // hover:bg-runcoder-100 dark:hover:bg-runcoder-900
  return (
    <Menubar.Root>
      <MenuDropdown
        padding="p-1"
        rounded="rounded-full"
        triggerStyle="ml-1"
        trigger={
          <IconButton
            icon={<FiSettings />}
            twClasses="transition-colors duration-150 focus-visible:ring-2"
            color="text-runcoder-300 hover:text-runcoder-500 dark:text-runcoder-400/50 dark:hover:text-runcoder-300"
            bg="bg-transparent"
          />
        }
      >
        <MenuItem>Save</MenuItem>
        <MenuItem>Save As</MenuItem>
        <MenuItem>Versions</MenuItem>
        <DeriveButton sectionId={sectionId} />
        <MenuItem>Multi-Run</MenuItem>
        <MenuItem>Freeze</MenuItem>
      </MenuDropdown>
    </Menubar.Root>
  );
}

export default MenuButton;
