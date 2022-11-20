import { useDisclosure } from "@chakra-ui/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useStoreActions } from "easy-peasy";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
import { useCurrProjectId } from "hooks/useProject";
import { useState } from "react";
import { useStoreApi } from "react-flow-renderer";
import { GrDocumentDownload } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { twClasses as MenuBarButtonClasses } from "utils/atoms/buttons/MenuBarButton";
import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

export default function FileMenu() {
  const { isOpen, onOpen: openModal, onClose: closeModal } = useDisclosure();
  const reactFlowStore = useStoreApi();
  const { projects, getProjects } = useGetOrCreateProjects();
  const { id: currProjectId, configId: currConfigId } = useCurrProjectId();
  const saveProject = useStoreActions((x) => x.thunks.saveProject);
  const saveAsNewProjectConfig = useStoreActions(
    (x) => x.thunks.saveAsNewProjectConfig
  );
  const saveAsExistingProjectConfig = useStoreActions(
    (x) => x.thunks.saveAsExistingProjectConfig
  );
  const setProjectToLoad = useStoreActions((x) => x.projectToLoad.setProject);
  const [modalType, setModalType] = useState("");

  function onClose() {
    closeModal();
  }

  function onClickSave() {
    saveProject({ reactFlowStore });
  }

  function onClickLoad() {
    setModalType("Load");
    getProjects();
    openModal();
  }

  function onClickSaveAs() {
    setModalType("Save As");
    getProjects();
    openModal();
  }

  function onClickLoadProject(selected) {
    setProjectToLoad(selected);
    closeModal();
  }

  async function onClickSaveAsProject(selected, newConfigName) {
    const { id, configId } = selected;
    if (id !== currProjectId) {
      closeModal(); //TODO: display something
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

    closeModal();
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={MenuBarButtonClasses}>
          File
        </DropdownMenu.Trigger>
        {/* <DropdownMenu.Arrow /> */}
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="bg-white py-2 px-4 rounded-md select-none drop-shadow z-[1000] flex flex-col gap-1"
          >
            <DropdownMenu.Item className="text-sm flex flex-row gap-1">
              <IoDocumentTextOutline />
              New Project
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="text-sm flex flex-row gap-1"
              onClick={onClickLoad}
            >
              <GrDocumentDownload />
              Load
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="text-sm flex flex-row gap-1"
              onClick={onClickSave}
            >
              <VscSave />
              Save
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="text-sm flex flex-row gap-1"
              onClick={onClickSaveAs}
            >
              <VscSaveAs />
              Save As
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <SaveLoadModal
        onClose={onClose}
        isOpen={isOpen}
        modalType={modalType}
        files={projects}
        onClickLoadProject={onClickLoadProject}
        onClickSaveAsProject={onClickSaveAsProject}
        currProjectId={currProjectId}
      />
    </>
  );
}
