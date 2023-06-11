import { useGetOrCreateProjects } from "hooks/useGetOrCreateProjects";
import { useCurrProjectName } from "hooks/useProject";
import _ from "lodash";
import { useAuth } from "models/auth";
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
import { router } from "utils/Routes/router";

export function FileMenu() {
  const { projects: rawProjects, getProjects, createAndGoToProject } = useGetOrCreateProjects();
  const { projectName: currProjectName, configName: currConfigName } =
    useCurrProjectName();
  const [modalType, setModalType] = useState("");
  const projects = convertRawProjectsToFolderFormat({
    rawProjects,
    modalType,
    currProjectName,
  });

  function onClickLoadProject({ projectName, configName }) {
    const username = useAuth.getState().username
    router.navigate(`${username}/${projectName}/${configName}`);
  }

  async function onClickSaveAsProject(selected, newConfigName) {
    const { projectName, configName } = selected;
    const currProject = _.find(projects, (x) => x.name === currProjectName);
    if (configName === currConfigName) {
      onClickSave();
    } else {
      const matchingConfig = currProject.configs.find(
        (x) => x.name === configName
      );
      const newProjectConfig = matchingConfig
        ? await saveAsExistingProjectConfig({
            configId: matchingConfig.id,
          })
        : await saveAsNewProjectConfig({
            newConfigName,
          });

      const username = useAuth.getState().username
      router.navigate(`${username}/${projectName}/${configName}`, {
        state: { newProjectConfig },
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
          <Items setModalType={setModalType} getProjects={getProjects} createAndGoToProject={createAndGoToProject}/>
        </MenuDropdown>
      </ProjectSaveLoadModal>
    </>
  );
}

function Items({setModalType, getProjects, createAndGoToProject}) {

  async function onClickNewProject(){
    await createAndGoToProject({})
  }

  function onClickSave() {
    saveProject();
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
      <MenuItem onClick={onClickSave} shortcut="Ctrl + S">
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

function convertRawProjectsToFolderFormat({
  rawProjects,
  modalType,
  currProjectName,
}) {
  const projects = Object.values(rawProjects).map((x) => ({
    name: x.name,
    files: x.configs.map((c) => c.name),
  }));
  if (modalType === "Save As") {
    const currProject = projects.find((x) => x.name === currProjectName);
    return currProject ? [currProject] : [];
  }
  return projects;
}
