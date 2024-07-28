import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import C from "constants/constants.json";
import _ from "lodash";
import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { addSectionInEmptySpace } from "state/actions/sections/createSections";
import { requestTypeCheck } from "state/actions/typeCheck";
import { redoProjectState, undoProjectState } from "state/actions/undo";
import { useSettings } from "state/definitions";

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
  const shortcuts = useSettings((x) =>
    _.pick(x, [
      "newCardShortcut",
      "newGroupShortcut",
      "typeCheckShortcut",
      "redoShortcut",
      "undoShortcut",
      "groupShortcut",
    ]),
  );

  return (
    <>
      <MenuItem onClick={addSection} shortcut={shortcuts.newCardShortcut}>
        <HiPlus className="h-4 w-4" /> Card
      </MenuItem>
      <MenuItem onClick={addGroup} shortcut={shortcuts.newGroupShortcut}>
        <AiOutlineGroup className="h-4 w-4" />
        Group
      </MenuItem>
      <MenuItem
        onClick={requestTypeCheck}
        shortcut={shortcuts.typeCheckShortcut}
      >
        Type Check
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
      <MenuItem onClick={redoProjectState} shortcut={shortcuts.redoShortcut}>
        Redo
      </MenuItem>
      <MenuItem onClick={undoProjectState} shortcut={shortcuts.undoShortcut}>
        Undo
      </MenuItem>
    </>
  );
}
