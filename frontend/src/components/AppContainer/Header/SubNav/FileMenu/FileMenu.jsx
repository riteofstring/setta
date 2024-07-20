import * as Menubar from "@radix-ui/react-menubar";
import { createAndGoToProject } from "state/hooks/useGetOrCreateProjects";
import { useModal } from "models/modal";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { Link } from "react-router-dom";
import { saveProject } from "thunks/save";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

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

function openFileMenuModal(modalType) {
  const x = useModal.getState();
  x.setModalType(modalType);
  x.setOpen(true);
}

export function openLoadModal() {
  openFileMenuModal("Load");
}

export function openSaveAsModal() {
  openFileMenuModal("Save As");
}

function openExportJSONModal() {
  openFileMenuModal("Export JSON");
}

function openExportFullJSONModal() {
  openFileMenuModal("Export Full JSON");
}

function openImportJSONModal() {
  openFileMenuModal("Import JSON");
}
