import React from "react";

import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  VStack,
  useRadioGroup,
} from "@chakra-ui/react";
import TemplateListItem from "./TemplateUIContainer/TemplateListItem";

const TemplateUIToggle = () => {
  const tempList = [
    "My Favourite Template",
    "a great save",
    "large python",
    "cool cool cool",
    "Best Style Transfer Settings!",
    "Picasso style",
    "2020-12-31-Preset_SkyNet",
  ];

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
    onChange: console.log,
  });
  const group = getRootProps();

  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Button onClick={onOpen}>Load Template</Button>
      <Modal isCentered onClose={onClose} isOpen={isOpen}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Load a template</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack {...group} overflowY="scroll" height="30vh">
              {tempList.map((e) => {
                const radio = getRadioProps({ e });
                return (
                  <TemplateListItem key={e} {...radio}>
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
            {/* <Button variant="ghost">Secondary Action</Button> */}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default React.memo(TemplateUIToggle);
