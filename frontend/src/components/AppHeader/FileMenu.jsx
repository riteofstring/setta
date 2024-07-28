import * as Menubar from "@radix-ui/react-menubar";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { Link } from "react-router-dom";
import {
  openExportFullJSONModal,
  openExportJSONModal,
  openImportJSONModal,
  openLoadModal,
  openSaveAsModal,
} from "state/actions/modal";
import { createAndGoToProject } from "state/actions/project/loadProject";
import { saveProject } from "state/actions/project/saveProject";
import { useSettings } from "state/definitions";
import { SETTINGS_ROUTER_PATH } from "utils/constants";

export function FileMenu() {
  const shortcuts = useSettings((x) =>
    _.pick(x, [
      "newProjectShortcut",
      "saveShortcut",
      "saveAsShortcut",
      "loadShortcut",
    ]),
  );

  return (
    <MenuDropdown trigger="File">
      <MenuItem
        onClick={() => createAndGoToProject({})}
        shortcut={shortcuts.newProjectShortcut}
      >
        New Config
      </MenuItem>
      <MenuItem onClick={openLoadModal} shortcut={shortcuts.loadShortcut}>
        Load
      </MenuItem>
      <MenuItem onClick={saveProject} shortcut={shortcuts.saveShortcut}>
        <VscSave />
        Save
      </MenuItem>
      <MenuItem onClick={openSaveAsModal} shortcut={shortcuts.saveAsShortcut}>
        <VscSaveAs />
        Save As
      </MenuItem>
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-setta-100 dark:bg-setta-600" />

      <MenuItem onClick={openImportJSONModal}>
        {/* <BiImport /> */}
        Import JSON
      </MenuItem>
      <MenuItem onClick={openExportJSONModal}>
        {/* <BiExport /> */}
        Export JSON
      </MenuItem>
      <MenuItem onClick={openExportFullJSONModal}>
        {/* <BiExport /> */}
        Export Full JSON
      </MenuItem>
      <Link to={SETTINGS_ROUTER_PATH}>
        <MenuItem>Settings</MenuItem>
      </Link>
    </MenuDropdown>
  );
}
