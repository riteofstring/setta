import { useDisclosure, MenuItem } from "@chakra-ui/react";
import { VscSaveAs } from "react-icons/vsc";
import SaveLoadModal from "./SaveLoadModal";

export default function SaveLoadButton({ ButtonText }) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <MenuItem
        onClick={onOpen}
        icon={ButtonText === "Save As" ? <VscSaveAs /> : <VscSaveAs />}
      >
        {ButtonText}
      </MenuItem>

      <SaveLoadModal
        onClose={onClose}
        isOpen={isOpen}
        ButtonText={ButtonText}
      />
    </>
  );
}
