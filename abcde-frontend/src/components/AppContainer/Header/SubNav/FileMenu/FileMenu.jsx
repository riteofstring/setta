import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Button,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useStoreApi } from "react-flow-renderer";
import { GrDocumentDownload } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

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
      <Menu>
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
      />
    </>
  );
}
