import * as Menubar from "@radix-ui/react-menubar";
import {
  createAndGoToProject,
  useExportProjectJson,
  useGetProjectsForFileMenu,
} from "hooks/useGetOrCreateProjects";
import { useSaveLoadProjectOnKeyActivation } from "hooks/useSaveProjectOnKeyActivation";
import { useProject } from "models/info/project";
import { useState } from "react";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { saveProject } from "thunks/save";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { FileMenuModal } from "utils/FileExplorer/FileMenuModal";
export function FileMenu() {
  const { projects, getProjects } = useGetProjectsForFileMenu();
  const { projectJson, exportProjectJson, exportFullProjectJson } =
    useExportProjectJson();
  const [modalType, setModalType] = useState("");
  const [open, setOpen] = useState(false);

  async function openLoadModal() {
    setModalType("Load");
    await getProjects({});
    setOpen(true);
  }

  async function openSaveAsModal() {
    setModalType("Save As");
    await getProjects({ projectId: useProject.getState().id });
    setOpen(true);
  }

  function openExportJSONModal() {
    setModalType("Export JSON");
    exportProjectJson();
    setOpen(true);
  }

  function openExportFullJSONModal() {
    setModalType("Export Full JSON");
    exportFullProjectJson();
    setOpen(true);
  }

  function openImportJSONModal() {
    setModalType("Import JSON");
    setOpen(true);
  }

  useSaveLoadProjectOnKeyActivation({ openLoadModal, openSaveAsModal });

  return (
    <FileMenuModal
      modalType={modalType}
      projects={projects}
      projectJson={projectJson}
      open={open}
      setOpen={setOpen}
    >
      <MenuItems
        openLoadModal={openLoadModal}
        openSaveAsModal={openSaveAsModal}
        openExportJSONModal={openExportJSONModal}
        openExportFullJSONModal={openExportFullJSONModal}
        openImportJSONModal={openImportJSONModal}
      />
    </FileMenuModal>
  );
}

function MenuItems({
  openLoadModal,
  openSaveAsModal,
  openExportJSONModal,
  openExportFullJSONModal,
  openImportJSONModal,
}) {
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
      <Menubar.Separator className="dark: m-[5px] h-[1px] bg-runcoder-100 dark:bg-runcoder-600" />

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
    </MenuDropdown>
  );
}
