import * as Menubar from "@radix-ui/react-menubar";
import C from "constants/constants.json";
import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { addSectionInEmptySpace } from "state/actions/createSection";
import { requestTypeCheck } from "state/actions/typeCheck";
import { redoProjectState, undoProjectState } from "state/actions/undo";
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
  const addSection = () => addSectionInEmptySpace({ type: C.SECTION });
  const addGroup = () => addSectionInEmptySpace({ type: C.DECK });
  const typeCheck = () => requestTypeCheck();

  return (
    <>
      <MenuItem onClick={addSection} shortcut="Ctrl + N">
        <HiPlus className="h-4 w-4" /> Card
      </MenuItem>
      <MenuItem onClick={addGroup} shortcut="Ctrl + G">
        <AiOutlineGroup className="h-4 w-4" />
        Group
      </MenuItem>
      <MenuItem onClick={typeCheck} shortcut="Ctrl + Shift + T">
        Type Check
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
      <MenuItem onClick={redoProjectState} shortcut="Ctrl + Shift + Z">
        Redo
      </MenuItem>

      <MenuItem onClick={undoProjectState} shortcut="Ctrl + Z">
        Undo
      </MenuItem>
    </>
  );
}
