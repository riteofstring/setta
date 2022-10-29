import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { BiCodeBlock } from "react-icons/bi";

import UiEditorModal from "./UiConfigModal";

export default function UiConfigButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Button
        leftIcon={<Icon as={BiCodeBlock} />}
        size="xs"
        mr="-px"
        onClick={onOpen}
        variant="ghost"
      >
        UI Config
      </Button>
      <UiEditorModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
