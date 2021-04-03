import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { BiCodeBlock } from "react-icons/bi";
import UiEditorModal from "./UiEditorModal";

export default function UiEditButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Button
        leftIcon={<Icon as={BiCodeBlock} />}
        size="sm"
        mr="-px"
        onClick={onOpen}
        variant="ghost"
      >
        Edit UI
      </Button>
      <UiEditorModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
