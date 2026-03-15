import * as Menubar from "@radix-ui/react-menubar";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import {
  MenuItem,
  MenuSubTrigger,
} from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { AiOutlineGroup } from "react-icons/ai";
import { FiCheck } from "react-icons/fi";
import { HiPlus } from "react-icons/hi";
import { Link } from "react-router-dom";
import { setColorModePreference } from "state/actions/localStorage";
import { restartLanguageServer } from "state/actions/lsp";
import { resetAllSectionsToDefaultVersions } from "state/actions/sectionHierarchy";
import {
  addCallableSectionInEmptySpace,
  addGroupInEmptySpace,
} from "state/actions/sections/createSections";
import { autoLayout } from "state/actions/sections/sectionPositions";
import { requestTypeCheck } from "state/actions/typeCheck";
import { redoProjectState, undoProjectState } from "state/actions/undo";
import { useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import type { ColorModePreference } from "state/stores/uiPreferenceState";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import {
  APP_MENU_Z_INDEX_CLASS_NAME,
  PAGE_LOAD_TYPES,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { shortcutPrettified } from "utils/utils";

export function EditMenu() {
  return (
    <NavbarMenuDropdown trigger="Edit">
      <Items />
    </NavbarMenuDropdown>
  );
}

function Items() {
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const colorMode = useLocalStorage((x) => x.colorMode);
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
        disabled={!canEditStructure}
      >
        <HiPlus className="h-4 w-4" /> Card
      </MenuItem>
      <MenuItem
        onClick={addGroupInEmptySpace}
        shortcut={shortcuts.newGroupShortcut}
        disabled={!canEditStructure}
      >
        <AiOutlineGroup className="h-4 w-4" />
        Dict
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />
      <MenuItem
        onClick={() => requestTypeCheck(true)}
        shortcut={shortcuts.typeCheckShortcut}
        disabled={isDeploymentMode}
      >
        Type Check
      </MenuItem>
      <MenuItem
        onClick={restartLanguageServer}
        shortcut={shortcuts.restartLanguageServerShortcut}
        disabled={isDeploymentMode}
      >
        Restart Language Server
      </MenuItem>
      <MenuItem onClick={autoLayout} disabled={!canEditLayout}>
        Auto Layout
      </MenuItem>
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
      <Menubar.Sub>
        <MenuSubTrigger>Color mode</MenuSubTrigger>
        <Menubar.Portal>
          <Menubar.SubContent
            className={`${APP_MENU_Z_INDEX_CLASS_NAME} min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850`}
            alignOffset={-5}
            sideOffset={6}
          >
            <ColorModeItem label="Dark" mode="dark" activeMode={colorMode} />
            <ColorModeItem label="Light" mode="light" activeMode={colorMode} />
            <ColorModeItem label="Auto" mode="auto" activeMode={colorMode} />
          </Menubar.SubContent>
        </Menubar.Portal>
      </Menubar.Sub>
      <Link
        to={SETTINGS_ROUTER_PATH}
        state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
      >
        <MenuItem>Settings</MenuItem>
      </Link>
    </>
  );
}

function ColorModeItem({
  label,
  mode,
  activeMode,
}: {
  label: string;
  mode: ColorModePreference;
  activeMode: ColorModePreference;
}) {
  const isActive = activeMode === mode;

  return (
    <MenuItem onClick={() => setColorModePreference(mode)}>
      <span className="flex items-center gap-2">
        <span className="flex h-4 w-4 items-center justify-center">
          {isActive ? <FiCheck className="h-3 w-3" /> : null}
        </span>
        <span>{label}</span>
      </span>
    </MenuItem>
  );
}
