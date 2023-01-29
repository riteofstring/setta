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
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { DialogTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { Item } from "utils/atoms/dropdown/item";
import { SaveLoadModal } from "utils/FileExplorer/SaveLoadModal";
import { router } from "utils/Routes/router";

export function FileMenu() {
  const reactFlowStore = useStoreApi();
  const username = useAuth((x) => x.username);
  const { projects, getProjects } = useGetOrCreateProjects();
  const { projectName: currProjectName, configName: currConfigName } =
    useCurrProjectName();
  const [modalType, setModalType] = useState("");

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
    <SaveLoadModal
      modalType={modalType}
      files={projects}
      onClickLoadProject={onClickLoadProject}
      onClickSaveAsProject={onClickSaveAsProject}
      currProjectName={currProjectName}
    >
      <StandardDropdown
        trigger={<MenuBarButton>File</MenuBarButton>}
        content={
          <Items
            onClickLoad={onClickLoad}
            onClickSave={onClickSave}
            onClickSaveAs={onClickSaveAs}
          />
        }
      />
    </SaveLoadModal>
  );
}

function Items({ onClickLoad, onClickSave, onClickSaveAs }) {
  return (
    <>
      <DialogTriggerItem>New Project</DialogTriggerItem>
      <DialogTriggerItem onClick={onClickLoad}>Load</DialogTriggerItem>
      <Item onClick={onClickSave}>
        <VscSave className="text-gray-500" />
        Save
      </Item>
      <DialogTriggerItem onClick={onClickSaveAs}>
        <VscSaveAs className="text-gray-500" />
        Save As
      </DialogTriggerItem>
    </>
  );
}
