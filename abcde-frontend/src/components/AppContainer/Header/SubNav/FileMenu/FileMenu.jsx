import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrProjectId } from "hooks/useProject";
import { useProjectToLoad } from "models/info/projectToLoad";
import { useState } from "react";
import { useStoreApi } from "react-flow-renderer";
// import { GrDocumentDownload } from "react-icons/gr";
// import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { DialogTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

export default function FileMenu() {
  const reactFlowStore = useStoreApi();
  const { projects, getProjects } = useGetOrCreateProjects();
  const { id: currProjectId, configId: currConfigId } = useCurrProjectId();
  const setProjectToLoad = useProjectToLoad((x) => x.setProject);
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

  function onClickLoadProject(selected) {
    setProjectToLoad(selected);
  }

  async function onClickSaveAsProject(selected, newConfigName) {
    const { id, configId } = selected;
    if (id !== currProjectId) {
      //TODO: display something
    }
    if (configId) {
      if (configId === currConfigId) {
        onClickSave();
      } else {
        saveAsExistingProjectConfig({ reactFlowStore, configId });
      }
    } else {
      saveAsNewProjectConfig({ reactFlowStore, newConfigName });
    }
  }

  return (
    <SaveLoadModal
      modalType={modalType}
      files={projects}
      onClickLoadProject={onClickLoadProject}
      onClickSaveAsProject={onClickSaveAsProject}
      currProjectId={currProjectId}
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
      <DialogTriggerItem>
        {/* <IoDocumentTextOutline /> */}
        New Project
      </DialogTriggerItem>
      <DialogTriggerItem onClick={onClickLoad}>
        {/* <GrDocumentDownload /> */}
        Load
      </DialogTriggerItem>
      <DialogTriggerItem onClick={onClickSave}>
        <VscSave className="text-gray-500" />
        Save
      </DialogTriggerItem>
      <DialogTriggerItem onClick={onClickSaveAs}>
        <VscSaveAs className="text-gray-500" />
        Save As
      </DialogTriggerItem>
    </>
  );
}
