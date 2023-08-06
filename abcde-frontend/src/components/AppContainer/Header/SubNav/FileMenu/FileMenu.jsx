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
import { ProjectSaveLoadModal } from "utils/FileExplorer/ProjectSaveLoadModal";
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

  async function onClickSaveAsProject({ selected, folder, filename }) {
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
      const projectName = projects.find((x) => x.id === folder).name;
      router.navigate(`${username}/${projectName}/${filename}`, {
        state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG },
      });
    }
  }

  return (
    <>
      <ProjectSaveLoadModal
        modalType={modalType}
        files={projects}
        onClickLoadProject={onClickLoadProject}
        onClickSaveAsProject={onClickSaveAsProject}
        open={open}
        setOpen={setOpen}
      >
        <MenuDropdown trigger="File">
          <Items
            openLoadModal={openLoadModal}
            openSaveAsModal={openSaveAsModal}
          />
        </MenuDropdown>
      </ProjectSaveLoadModal>
    </>
  );
}

function Items({ openLoadModal, openSaveAsModal }) {
  return (
    <>
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
    </>
  );
}
