import { useAddSectionInEmptySpace } from "hooks/useAddSectionInEmptySpace";
import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

export function EditMenu() {
  return (
    <MenuDropdown trigger={<MenuBarButton>Edit</MenuBarButton>}>
      <Items />
    </MenuDropdown>
  );
}

function Items() {
  const addSection = useAddSectionInEmptySpace({ isDeck: false });
  const addGroup = useAddSectionInEmptySpace({ isDeck: true });
  return (
    <>
      <MenuItem onClick={addSection} shortcut="Ctrl + N">
        <HiPlus className="h-4 w-4" /> Card
      </MenuItem>
      <MenuItem onClick={addGroup} shortcut="Ctrl + G">
        <AiOutlineGroup className="h-4 w-4" />
        Group
      </MenuItem>
    </>
  );
}
