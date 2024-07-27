import * as Menubar from "@radix-ui/react-menubar";
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
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";

export function FileMenu() {
  return (
    <MenuDropdown trigger="File">
      <MenuItem
        onClick={() => createAndGoToProject({})}
        shortcut="Ctrl + Shift + N"
      >
        New Project
      </MenuItem>
      <MenuItem onClick={openLoadModal} shortcut="Ctrl + L">
        Load
      </MenuItem>
      <MenuItem onClick={saveProject} shortcut="Ctrl + S">
        <VscSave />
        Save
      </MenuItem>
      <MenuItem onClick={openSaveAsModal} shortcut="Ctrl + Shift + S">
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
      <Link to="/settings">
        <MenuItem>Settings</MenuItem>
      </Link>
    </MenuDropdown>
  );
}
