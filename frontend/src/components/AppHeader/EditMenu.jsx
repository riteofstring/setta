import * as Menubar from "@radix-ui/react-menubar";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { Link } from "react-router-dom";
import { dbRequestTypeCheck } from "requests/sections";
import {
  addGroupInEmptySpace,
  addRegularSectionInEmptySpace,
} from "state/actions/sections/createSections";
import { autoLayout } from "state/actions/sections/sectionPositions";
import { resetAllSectionsToDefaultVersions } from "state/actions/sectionVariants";
import { redoProjectState, undoProjectState } from "state/actions/undo";
import { useSettings } from "state/definitions";
import { SETTINGS_ROUTER_PATH } from "utils/constants";
import { shortcutPrettified } from "utils/utils";

export function EditMenu() {
  return (
    <NavbarMenuDropdown trigger="Edit">
      <Items />
    </NavbarMenuDropdown>
  );
}

function Items() {
  const shortcuts = useSettings((x) =>
    _.mapValues(
      _.pick(x, [
        "newCardShortcut",
        "newGroupShortcut",
        "typeCheckShortcut",
        "redoShortcut",
        "undoShortcut",
        "groupShortcut",
      ]),
      shortcutPrettified,
    ),
  );

  return (
    <>
      <MenuItem
        onClick={addRegularSectionInEmptySpace}
        shortcut={shortcuts.newCardShortcut}
      >
        <HiPlus className="h-4 w-4" /> Card
      </MenuItem>
      <MenuItem
        onClick={addGroupInEmptySpace}
        shortcut={shortcuts.newGroupShortcut}
      >
        <AiOutlineGroup className="h-4 w-4" />
        Group
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
      <MenuItem
        onClick={() => dbRequestTypeCheck(true)}
        shortcut={shortcuts.typeCheckShortcut}
      >
        Type Check
      </MenuItem>
      <MenuItem onClick={autoLayout}>Auto Layout</MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
      <MenuItem onClick={redoProjectState} shortcut={shortcuts.redoShortcut}>
        Redo
      </MenuItem>
      <MenuItem onClick={undoProjectState} shortcut={shortcuts.undoShortcut}>
        Undo
      </MenuItem>
      <MenuItem onClick={resetAllSectionsToDefaultVersions}>
        Reset sections
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
      <Link to={SETTINGS_ROUTER_PATH}>
        <MenuItem>Settings</MenuItem>
      </Link>
    </>
  );
}
