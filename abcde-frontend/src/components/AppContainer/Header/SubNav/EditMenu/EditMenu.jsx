import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { addSectionInEmptySpace } from "thunks/addSectionInEmptySpace";
import { redoProjectState, undoProjectState } from "thunks/undo";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

export function EditMenu() {
  return (
    <MenuDropdown trigger="Edit">
      <Items />
    </MenuDropdown>
  );
}

function Items() {
  const addSection = () => addSectionInEmptySpace({ isDeck: false });
  const addGroup = () => addSectionInEmptySpace({ isDeck: true });
  return (
    <>
      <MenuItem onClick={addSection} shortcut="Ctrl + N">
        <HiPlus className="h-4 w-4" /> Card
      </MenuItem>
      <MenuItem onClick={addGroup} shortcut="Ctrl + G">
        <AiOutlineGroup className="h-4 w-4" />
        Group
      </MenuItem>
      <MenuItem onClick={undoProjectState} shortcut="Ctrl + Z">
        Undo
      </MenuItem>
      <MenuItem onClick={redoProjectState} shortcut="Ctrl + Shift + Z">
        Redo
      </MenuItem>
    </>
  );
}
