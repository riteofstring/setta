import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { CgCommunity } from "react-icons/cg";
import EcoSysModal from "./EcoSysModal";

export default function EcoSysButton() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Button
        leftIcon={<Icon as={CgCommunity} />}
        size="sm"
        mr="-px"
        onClick={onOpen}
        variant="ghost"
      >
        Templates
      </Button>
      <EcoSysModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
