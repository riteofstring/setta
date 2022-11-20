import { useDisclosure } from "@chakra-ui/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useStoreActions } from "easy-peasy";
import { useStoreApi } from "react-flow-renderer";
import { GrDocumentDownload } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { twClasses as MenuBarButtonClasses } from "utils/atoms/buttons/MenuBarButton";

export default function FileMenu() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const reactFlowStore = useStoreApi();
  const saveProject = useStoreActions((x) => x.thunks.saveProject);

  function onSaveButtonClick() {
    saveProject({ reactFlowStore });
  }

  function onLoadClick() {
    onOpen();
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
            <Items />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

function Item(props) {
  return (
    <DropdownMenu.Item className="text-sm flex flex-row gap-1">
      {props.children}
    </DropdownMenu.Item>
  );
}

function Items() {
  return (
    <>
      <Item>
        <IoDocumentTextOutline />
        New Project
      </Item>
      <Item>
        <GrDocumentDownload />
        Load
      </Item>
      <Item>
        <VscSave />
        Save
      </Item>
      <Item>
        <VscSaveAs />
        Save As
      </Item>
    </>
  );
}
