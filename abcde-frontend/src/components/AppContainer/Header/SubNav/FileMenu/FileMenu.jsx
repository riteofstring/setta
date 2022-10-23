import { useDisclosure } from "@chakra-ui/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useStoreActions } from "easy-peasy";
import { GrDocumentDownload } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { twClasses as MenuBarButtonClasses } from "utils/atoms/buttons/MenuBarButton";

export default function FileMenu() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const saveProject = useStoreActions((x) => x.thunks.saveProject);

  function onSaveButtonClick() {
    saveProject();
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
            <DropdownMenu.Item className="text-sm flex flex-row gap-1">
              <IoDocumentTextOutline />
              New Project
            </DropdownMenu.Item>
            <DropdownMenu.Item className="text-sm flex flex-row gap-1">
              <GrDocumentDownload />
              Load
            </DropdownMenu.Item>
            <DropdownMenu.Item className="text-sm flex flex-row gap-1">
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
      {/* <Menu>
        <MenuButton size="xs" variant="ghost" as={Button}>
          File <ChevronDownIcon />
        </MenuButton>
        <MenuList zIndex="11">
          <MenuItem icon={<IoDocumentTextOutline />}>New Project</MenuItem>
          <MenuItem icon={<GrDocumentDownload />} onClick={onLoadClick}>
            Load
          </MenuItem>
          <MenuItem icon={<VscSave />} onClick={onSaveButtonClick}>
            Save
          </MenuItem>
          <MenuItem icon={<VscSaveAs />}>Save As</MenuItem>
        </MenuList>
      </Menu>
      <SaveLoadModal
        onClose={onClose}
        isOpen={isOpen}
        buttonText={"SaveLoadModal"}
      /> */}
    </>
  );
}
