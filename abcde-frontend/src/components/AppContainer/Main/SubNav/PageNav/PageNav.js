import { VscSave } from "react-icons/vsc";
import { IoDocumentTextOutline } from "react-icons/io5";
import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  useDisclosure,
} from "@chakra-ui/react";
import UiEditButton from "./UiEditButton/UiEditButton";
import SaveLoadButton from "../../../../../utils/FileExplorer/SaveLoadButton";
import SaveLoadModal from "../../../../../utils/FileExplorer/SaveLoadModal";
export default function PageNav() {
  const {
    isOpen: loadIsOpen,
    onOpen: loadOnOpen,
    onClose: loadOnClose,
  } = useDisclosure();
  const {
    isOpen: saveIsOpen,
    onOpen: saveOnOpen,
    onClose: saveOnClose,
  } = useDisclosure();

  return (
    <>
      <Menu>
        <MenuButton
          size="sm"
          variant="ghost"
          as={Button}
          // _hover={{ bg: "gray.400" }}
          // _expanded={{ bg: "blue.400" }}
          // _focus={{ boxShadow: "outline" }}
        >
          File <ChevronDownIcon />
        </MenuButton>
        <MenuList zIndex="11">
          <MenuItem icon={<IoDocumentTextOutline />}>New Project</MenuItem>
          <SaveLoadButton ButtonText="Load" onOpen={loadOnOpen} />
          <MenuItem icon={<VscSave />}>Save</MenuItem>
          <SaveLoadButton ButtonText="Save As" onOpen={saveOnOpen} />
        </MenuList>
      </Menu>
      <SaveLoadModal
        onClose={loadOnClose}
        isOpen={loadIsOpen}
        ButtonText="Load"
      />
      <SaveLoadModal
        onClose={saveOnClose}
        isOpen={saveIsOpen}
        ButtonText="Save As"
      />

      <UiEditButton />
    </>
  );
}
