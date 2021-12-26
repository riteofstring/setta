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
import { GrDocumentDownload } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { VscSave, VscSaveAs } from "react-icons/vsc";
import SaveLoadModal from "utils/FileExplorer/SaveLoadModal";

export default function FileMenu() {
  const [buttonText, setButtonText] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();

  const token = useStoreState((state) => state.auth.token);
  const loadFolderAndUINames = useStoreActions(
    (actions) => actions.uiInfo.loadFolderAndUINames
  );
  const loadedFolderAndUINames = useStoreState(
    (state) => state.uiInfo.loadedFolderAndUINames
  );
  const saveDraftUI = useStoreActions((actions) => actions.uiInfo.saveDraftUI);

  const _onOpen = (buttonText) => {
    setButtonText(buttonText);
    onOpen();
    loadFolderAndUINames({ token });
  };

  function SaveAsOrLoadButton({ buttonText }) {
    return (
      <MenuItem
        onClick={() => _onOpen(buttonText)}
        icon={buttonText === "Save As" ? <VscSaveAs /> : <GrDocumentDownload />}
      >
        {buttonText}
      </MenuItem>
    );
  }

  function onSaveButtonClick() {
    saveDraftUI({ token });
  }

  return (
    <>
      <Menu>
        <MenuButton size="sm" variant="ghost" as={Button}>
          File <ChevronDownIcon />
        </MenuButton>
        <MenuList zIndex="11">
          <MenuItem icon={<IoDocumentTextOutline />}>New Project</MenuItem>
          <SaveAsOrLoadButton buttonText="Load" />
          <MenuItem>Advanced Load</MenuItem>
          <MenuItem icon={<VscSave />} onClick={onSaveButtonClick}>
            Save
          </MenuItem>
          <SaveAsOrLoadButton buttonText="Save As" />
        </MenuList>
      </Menu>
      <SaveLoadModal
        onClose={onClose}
        isOpen={isOpen}
        buttonText={buttonText}
        foldersAndFiles={loadedFolderAndUINames}
      />
    </>
  );
}
