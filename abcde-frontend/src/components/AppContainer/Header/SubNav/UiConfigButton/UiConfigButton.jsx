import { useDisclosure } from "@chakra-ui/react";
import MenuBarButton from "components/Common/Button/MenuBarButton";
import { BiCodeBlock } from "react-icons/bi";

import UiEditorModal from "./UiConfigModal";

export default function UiConfigButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <MenuBarButton onClick={onOpen}>
        <BiCodeBlock />
        UI Config
      </MenuBarButton>
      <UiEditorModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
