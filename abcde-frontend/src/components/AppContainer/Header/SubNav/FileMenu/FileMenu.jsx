import {
  createAndGoToProject,
  useGetProjectsForFileMenu,
} from "hooks/useGetOrCreateProjects";
import { useSaveLoadProjectOnKeyActivation } from "hooks/useSaveProjectOnKeyActivation";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useUser } from "models/user";
import { useState } from "react";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { SaveLoadModal } from "utils/FileExplorer/SaveLoadModal";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
} from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function FileMenu() {
  const { projects, getProjects } = useGetProjectsForFileMenu();
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

  useSaveLoadProjectOnKeyActivation({ openLoadModal, openSaveAsModal });

  function onClickLoadProject({ selected }) {
    const configInfo = projects.find((x) => x.id === selected);
    if (configInfo) {
      const { name, projectName } = configInfo;
      const username = useUser.getState().username;
      router.navigate(`${username}/${projectName}/${name}`, {
        state: { pageLoadType: NEW_PROJECT },
      });
    }
  }

  async function onClickSaveAsProject({ selected, filename }) {
    if (selected === useProjectConfig.getState().id) {
      saveProject();
    } else {
      selected
        ? await saveAsExistingProjectConfig({
            configName: filename,
          })
        : await saveAsNewProjectConfig({
            newConfigName: filename,
          });

      const username = useUser.getState().username;
      const projectName = useProject.getState().name;
      router.navigate(`${username}/${projectName}/${filename}`, {
        state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG },
      });
    }
  }

  const onClickActionButton =
    modalType === "Load" ? onClickLoadProject : onClickSaveAsProject;
  const title = modalType === "Load" ? "Load Project" : "Save Project As";

  return (
    <SaveLoadModal
      modalType={modalType}
      files={projects}
      onClickActionButton={onClickActionButton}
      title={title}
      buttonText={modalType}
      placeholder="Config Name"
      open={open}
      setOpen={setOpen}
    >
      <MenuItems
        openLoadModal={openLoadModal}
        openSaveAsModal={openSaveAsModal}
      />
    </SaveLoadModal>
  );
}

function MenuItems({ openLoadModal, openSaveAsModal }) {
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
    </MenuDropdown>
  );
}
