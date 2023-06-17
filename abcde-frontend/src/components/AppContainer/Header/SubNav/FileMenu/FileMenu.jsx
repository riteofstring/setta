import { useGetOrCreateProjects } from "hooks/useGetOrCreateProjects";
import _ from "lodash";
import { useAuth } from "models/auth";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useState } from "react";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { ProjectSaveLoadModal } from "utils/FileExplorer/ProjectSaveLoadModal";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
} from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function FileMenu() {
  const {
    projects: rawProjects,
    getProjects,
    createAndGoToProject,
  } = useGetOrCreateProjects();
  const [modalType, setModalType] = useState("");
  const projects = convertRawProjectsToFolderFormat({
    rawProjects,
    modalType,
  });

  function onClickLoadProject(selected) {
    const { foldername, filename } = selected;
    const username = useAuth.getState().username;
    router.navigate(`${username}/${foldername}/${filename}`, {
      state: { pageLoadType: NEW_PROJECT },
    });
  }

  async function onClickSaveAsProject(selected, newConfigName) {
    const { foldername: projectName, filename: configName } = selected;
    const currProjectName = useProject.getState().name;
    const currConfigName = useProjectConfig.getState().name;
    const currProject = _.find(projects, (x) => x.name === currProjectName);
    if (configName === currConfigName) {
      saveProject();
    } else {
      const matchingConfig = currProject.files.find(
        (x) => x.name === configName
      );
      const newProjectConfig = matchingConfig
        ? await saveAsExistingProjectConfig({
            configId: matchingConfig.id,
          })
        : await saveAsNewProjectConfig({
            newConfigName,
          });

      const username = useAuth.getState().username;
      router.navigate(`${username}/${projectName}/${configName}`, {
        state: {
          newProjectConfig,
          pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG,
        },
      });
    }
  }

  return (
    <>
      <ProjectSaveLoadModal
        modalType={modalType}
        folders={projects}
        onClickLoadProject={onClickLoadProject}
        onClickSaveAsProject={onClickSaveAsProject}
      >
        <MenuDropdown trigger="File">
          <Items
            setModalType={setModalType}
            getProjects={getProjects}
            createAndGoToProject={createAndGoToProject}
          />
        </MenuDropdown>
      </ProjectSaveLoadModal>
    </>
  );
}

function Items({ setModalType, getProjects, createAndGoToProject }) {
  async function onClickNewProject() {
    await createAndGoToProject({});
  }

  function onClickLoad() {
    setModalType("Load");
    getProjects();
  }

  function onClickSaveAs() {
    setModalType("Save As");
    getProjects();
  }

  return (
    <>
      <MenuItem onClick={onClickNewProject} shortcut="Ctrl + Shift + N">
        New Project
      </MenuItem>
      <DialogMenuBarTriggerItem onClick={onClickLoad} shortcut="Ctrl + L">
        Load
      </DialogMenuBarTriggerItem>
      <MenuItem onClick={saveProject} shortcut="Ctrl + S">
        <VscSave />
        Save
      </MenuItem>
      <DialogMenuBarTriggerItem
        onClick={onClickSaveAs}
        shortcut="Ctrl + Shift + S"
      >
        <VscSaveAs />
        Save As
      </DialogMenuBarTriggerItem>
    </>
  );
}

function convertRawProjectsToFolderFormat({ rawProjects, modalType }) {
  const projects = Object.values(rawProjects).map((x) => ({
    name: x.name,
    files: x.configs.map((c) => c.name),
  }));
  if (modalType === "Save As") {
    const currProjectName = useProject.getState().name;
    const currProject = projects.find((x) => x.name === currProjectName);
    return currProject ? [currProject] : [];
  }
  return projects;
}
