import { useDisclosure, MenuItem } from "@chakra-ui/react";
import { VscSaveAs } from "react-icons/vsc";
import SaveLoadModal from "./SaveLoadModal";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function SaveLoadButton({ ButtonText }) {
  // const { isOpen, onOpen, onClose } = useDisclosure();

  // const token = useStoreState((state) => state.auth.token);
  // const savedFolderAndUINames = useStoreState((state) => state.uiInfo.savedFolderAndUINames);
  // const loadFolderAndUINames = useStoreActions((actions) => actions.uiInfo.loadFolderAndUINames);

  // const _onOpen = () => {
  //   // onOpen()
  //   // loadFolderAndUINames({token})
  // }

  return (
    <>
      {/* <MenuItem
        onClick={_onOpen}
        icon={ButtonText === "Save As" ? <VscSaveAs /> : <VscSaveAs />}
      >
        {ButtonText}
      </MenuItem> */}

      <SaveLoadModal
        // onClose={onClose}
        // isOpen={isOpen}
        // ButtonText={ButtonText}
        // savedFolderAndUINames={savedFolderAndUINames}
      />
    </>
  );
}
