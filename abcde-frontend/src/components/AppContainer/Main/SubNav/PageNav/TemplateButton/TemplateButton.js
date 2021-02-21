import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { HiSave } from "react-icons/hi";
import TemplateModal from "./TemplateModal";

export default function TemplateButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Button
        bg="whiteAlpha"
        leftIcon={<Icon as={HiSave} />}
        size="sm"
        mr="-px"
        onClick={onOpen}
      >
        Template
      </Button>
      <TemplateModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
