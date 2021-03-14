import { MenuItem } from "@chakra-ui/react";
import { VscSaveAs } from "react-icons/vsc";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function SaveLoadButton({ onOpen, ButtonText }) {
  const token = useStoreState((state) => state.auth.token);
  const loadFolderAndUINames = useStoreActions((actions) => actions.uiInfo.loadFolderAndUINames);

  const _onOpen = () => {
    onOpen()
    loadFolderAndUINames({token})
  }

  return (
    <>
      <MenuItem
        onClick={_onOpen}
        icon={ButtonText === "Save As" ? <VscSaveAs /> : <VscSaveAs />}
      >
        {ButtonText}
      </MenuItem>
    </>
  );
}
