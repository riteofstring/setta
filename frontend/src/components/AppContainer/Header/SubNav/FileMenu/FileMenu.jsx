import {
  createAndGoToProject,
  useExportProjectConfigJson,
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
  const { projectJson, exportProjectJson } = useExportProjectConfigJson();
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
      />
    </FileMenuModal>
  );
}

function MenuItems({ openLoadModal, openSaveAsModal, openExportJSONModal }) {
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
      <MenuItem onClick={openExportJSONModal}>
        <VscSaveAs />
        Export JSON
      </MenuItem>
    </MenuDropdown>
  );
}
