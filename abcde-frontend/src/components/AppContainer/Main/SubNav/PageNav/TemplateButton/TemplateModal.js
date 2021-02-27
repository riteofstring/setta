import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  VStack,
  useRadioGroup,
} from "@chakra-ui/react";
import TemplateListItem from "./TemplateListItem";

export default function TemplateModal({ isOpen, onClose, uiNames, setSelectedUIName }) {
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
    onChange: console.log,
  });

  const group = getRootProps();

  return (
    <Modal isOpen={isOpen} size="full" onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Browse Templates</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack {...group} overflowY="scroll" height="30vh">
            {uiNames.map((e) => {
              const radio = getRadioProps({ e });
              return (
                <TemplateListItem
                  key={e}
                  radio={radio}
                  setSelectedUIName={setSelectedUIName}
                >
                  {e}
                </TemplateListItem>
              );
            })}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={onClose}>
            Load
          </Button>
          <Button variant="ghost">Secondary Action</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
