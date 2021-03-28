import SaveLoadModal from "../../../../../utils/FileExplorer/SaveLoadModal";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import { GrDocumentDownload } from "react-icons/gr";
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
import { useStoreActions, useStoreState } from "easy-peasy";
import { useState } from "react";

export default function FileMenu() {
  const [buttonText, setButtonText] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();

  const token = useStoreState((state) => state.auth.token);
  const loadFolderAndUINames = useStoreActions(
    (actions) => actions.uiInfo.loadFolderAndUINames
  );
  const savedFolderAndUINames = useStoreState(
    (state) => state.uiInfo.savedFolderAndUINames
  );

  const _onOpen = (buttonText) => {
    setButtonText(buttonText);
    onOpen();
    loadFolderAndUINames({ token });
  };

  function SaveLoadButton({ buttonText }) {
    return (
      <MenuItem
        onClick={() => _onOpen(buttonText)}
        icon={buttonText === "Save As" ? <VscSaveAs /> : <GrDocumentDownload />}
      >
        {buttonText}
      </MenuItem>
    );
  }

  return (
    <>
      <Menu>
        <MenuButton size="sm" variant="ghost" as={Button}>
          File <ChevronDownIcon />
        </MenuButton>
        <MenuList zIndex="11">
          <MenuItem icon={<IoDocumentTextOutline />}>New Project</MenuItem>
          <SaveLoadButton buttonText="Load" />
          <MenuItem>Advanced Load</MenuItem>
          <MenuItem icon={<VscSave />}>Save</MenuItem>
          <SaveLoadButton buttonText="Save As" />
        </MenuList>
      </Menu>
      <SaveLoadModal
        onClose={onClose}
        isOpen={isOpen}
        buttonText={buttonText}
        foldersAndFiles={savedFolderAndUINames}
      />
    </>
  );
}
