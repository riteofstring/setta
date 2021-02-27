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
  Heading,
} from "@chakra-ui/react";
import TemplateListItem from "./TemplateListItem";

export default function TemplateModal({
  isOpen,
  onClose,
  onLoad,
  savedUIAndVersionNames,
  setSelectedUIName,
}) {
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
    onChange: console.log,
  });

  const group = getRootProps();

  const uiNames = Object.keys(savedUIAndVersionNames);

  const allVersionsForUI = (U) => {
    return savedUIAndVersionNames[U].map((V) => {
      const key = U + ": " + V;
      const radio = getRadioProps({ key });
      return (
        <TemplateListItem
          key={key}
          radio={radio}
          setSelectedUIName={setSelectedUIName}
        >
          {V}
        </TemplateListItem>
      );
    });
  };

  return (
    <Modal isOpen={isOpen} size="full" onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Browse Templates</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack {...group} overflowY="scroll" height="30vh">
            {uiNames.map((U) => {
              return (
                <>
                  <Heading as="h4" size="md">
                    {U}
                  </Heading>
                  {allVersionsForUI(U)}
                </>
              );
            })}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={onLoad}>
            Load
          </Button>
          <Button variant="ghost">Secondary Action</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
