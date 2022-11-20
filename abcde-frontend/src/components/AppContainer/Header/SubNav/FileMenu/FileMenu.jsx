import { useDisclosure } from "@chakra-ui/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useStoreActions } from "easy-peasy";
import { useGetOrCreateProjects } from "hooks/dbRequests/projects";
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
  const saveProject = useStoreActions((x) => x.thunks.saveProject);
  const setCurrProject = useStoreActions((x) => x.project.setId);
  const setCurrProjectConfig = useStoreActions((x) => x.projectConfig.setId);

  function onClose() {
    closeModal();
  }

  function onClickSaveButton() {
    saveProject({ reactFlowStore });
  }

  function onClickLoad() {
    getProjects();
    openModal();
  }

  function onClickLoadProject(selected) {
    setCurrProject(selected.project);
    setCurrProjectConfig(selected.projectConfig);
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
              onClick={onClickSaveButton}
            >
              <VscSave />
              Save
            </DropdownMenu.Item>
            <DropdownMenu.Item className="text-sm flex flex-row gap-1">
              <VscSaveAs />
              Save As
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <SaveLoadModal
        onClose={onClose}
        isOpen={isOpen}
        buttonText={"SaveLoadModal"}
        files={projects}
        onClickLoadProject={onClickLoadProject}
      />
    </>
  );
}
