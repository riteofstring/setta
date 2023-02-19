import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrProjectName } from "hooks/useProject";
import _ from "lodash";
import { useAuth } from "models/auth";
import { useState } from "react";
import { useStoreApi } from "react-flow-renderer";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { DialogTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { ProjectSaveLoadModal } from "utils/FileExplorer/ProjectSaveLoadModal";
import { router } from "utils/Routes/router";

export function FileMenu() {
  const reactFlowStore = useStoreApi();
  const username = useAuth((x) => x.username);
  const { projects: rawProjects, getProjects } = useGetOrCreateProjects();
  const { projectName: currProjectName, configName: currConfigName } =
    useCurrProjectName();
  const [modalType, setModalType] = useState("");
  const projects = convertRawProjectsToFolderFormat({
    rawProjects,
    modalType,
    currProjectName,
  });

  function onClickSave() {
    saveProject({ reactFlowStore });
  }

  function onClickLoad() {
    setModalType("Load");
    getProjects();
  }

  function onClickSaveAs() {
    setModalType("Save As");
    getProjects();
  }

  function onClickLoadProject({ projectName, configName }) {
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
            reactFlowStore,
            configId: matchingConfig.id,
          })
        : await saveAsNewProjectConfig({
            reactFlowStore,
            newConfigName,
          });

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
          <Items
            onClickLoad={onClickLoad}
            onClickSave={onClickSave}
            onClickSaveAs={onClickSaveAs}
          />
        </MenuDropdown>
      </ProjectSaveLoadModal>
    </>
  );
}

function Items({ onClickLoad, onClickSave, onClickSaveAs }) {
  return (
    <>
      <DialogTriggerItem shortcut="Ctrl + Shift + N">
        New Project
      </DialogTriggerItem>
      <DialogTriggerItem onClick={onClickLoad} shortcut="Ctrl + L">
        Load
      </DialogTriggerItem>
      <MenuItem onClick={onClickSave} shortcut="Ctrl + S">
        <VscSave />
        Save
      </MenuItem>
      <DialogTriggerItem onClick={onClickSaveAs} shortcut="Ctrl + Shift + S">
        <VscSaveAs />
        Save As
      </DialogTriggerItem>
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
