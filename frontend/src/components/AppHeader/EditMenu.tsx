import * as Menubar from "@radix-ui/react-menubar";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { AiOutlineGroup } from "react-icons/ai";
import { HiPlus } from "react-icons/hi";
import { Link } from "react-router-dom";
import { restartLanguageServer } from "state/actions/lsp";
import { resetAllSectionsToDefaultVersions } from "state/actions/sectionInfos";
import {
  addCallableSectionInEmptySpace,
  addGroupInEmptySpace,
} from "state/actions/sections/createSections";
import { autoLayout } from "state/actions/sections/sectionPositions";
import { requestTypeCheck } from "state/actions/typeCheck";
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
  const shortcuts = useSettings((x) => {
    return {
      newCardShortcut: shortcutPrettified(x.shortcuts.newCardShortcut),
      newGroupShortcut: shortcutPrettified(x.shortcuts.newGroupShortcut),
      typeCheckShortcut: shortcutPrettified(x.shortcuts.typeCheckShortcut),
      redoShortcut: shortcutPrettified(x.shortcuts.redoShortcut),
      undoShortcut: shortcutPrettified(x.shortcuts.undoShortcut),
      groupShortcut: shortcutPrettified(x.shortcuts.groupShortcut),
      restartLanguageServerShortcut: shortcutPrettified(
        x.shortcuts.restartLanguageServerShortcut,
      ),
    };
  }, _.isEqual);

  return (
    <>
      <MenuItem
        onClick={addCallableSectionInEmptySpace}
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
        onClick={() => requestTypeCheck(true)}
        shortcut={shortcuts.typeCheckShortcut}
      >
        Type Check
      </MenuItem>
      <MenuItem
        onClick={restartLanguageServer}
        shortcut={shortcuts.restartLanguageServerShortcut}
      >
        Restart Language Server
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
