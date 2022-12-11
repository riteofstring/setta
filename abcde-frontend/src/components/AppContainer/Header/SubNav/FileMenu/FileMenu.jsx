import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrProjectId } from "hooks/useProject";
import { useProjectToLoad } from "models/info/projectToLoad";
import { useRef, useState } from "react";
import { useStoreApi } from "react-flow-renderer";
import { GrDocumentDownload } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { twClasses as MenuBarButtonClasses } from "utils/atoms/buttons/MenuBarButton";
import { Item } from "utils/atoms/dropdown/item";
import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

export default function FileMenu() {
  const dropdownRef = useRef();
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const reactFlowStore = useStoreApi();
  const { projects, getProjects } = useGetOrCreateProjects();
  const { id: currProjectId, configId: currConfigId } = useCurrProjectId();
  const setProjectToLoad = useProjectToLoad((x) => x.setProject);
  const [modalType, setModalType] = useState("");

  function onClose() {
    // closeModal();
  }

  function onClickSave() {
    saveProject({ reactFlowStore });
  }

  function onClickLoad() {
    setModalType("Load");
    getProjects();
    // openModal();
    setModalIsOpen(true);
  }

  function onClickSaveAs() {
    setModalType("Save As");
    getProjects();
    // openModal();
  }

  function onClickLoadProject(selected) {
    setProjectToLoad(selected);
    // closeModal();
  }

  async function onClickSaveAsProject(selected, newConfigName) {
    const { id, configId } = selected;
    if (id !== currProjectId) {
      // closeModal(); //TODO: display something
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

    // closeModal();
  }

  return (
    <div ref={dropdownRef}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={MenuBarButtonClasses}>
          File
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="bg-white py-2 px-4 rounded-md select-none drop-shadow z-[1000] flex flex-col gap-1"
          >
            <Items
              onClickLoad={onClickLoad}
              onClickSave={onClickSave}
              onClickSaveAs={onClickSaveAs}
            />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <SaveLoadModal
        onClose={onClose}
        returnFocusTo={dropdownRef}
        modalIsOpen={modalIsOpen}
        setModalIsOpen={setModalIsOpen}
        modalType={modalType}
        files={projects}
        onClickLoadProject={onClickLoadProject}
        onClickSaveAsProject={onClickSaveAsProject}
        currProjectId={currProjectId}
      />
    </div>
  );
}

function Items({ onClickLoad, onClickSave, onClickSaveAs }) {
  return (
    <>
      <Item>
        <IoDocumentTextOutline />
        New Project
      </Item>
      <Item onClick={onClickLoad}>
        <GrDocumentDownload />
        Load
      </Item>
      <Item onClick={onClickSave}>
        <VscSave />
        Save
      </Item>
      <Item onClick={onClickSaveAs}>
        <VscSaveAs />
        Save As
      </Item>
    </>
  );
}
