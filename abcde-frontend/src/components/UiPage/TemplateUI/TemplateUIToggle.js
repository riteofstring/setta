import React, { useState } from "react";

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
import { useStoreState, useStoreActions } from "easy-peasy";

const TemplateUIToggle = () => {
  const uiNames = useStoreState((state) => state.uiInfo.uiNames);
  const loadUINames = useStoreActions((actions) => actions.uiInfo.loadUINames);
  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  const token = useStoreState((state) => state.auth.token);

  const loadSections = useStoreActions((actions) => actions.master._loadSections);

  const [selectedUIName, setSelectedUIName] = useState(null);

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "framework",
    defaultValue: "react",
    onChange: console.log,
  });
  const group = getRootProps();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const onOpenClick = () => {
    loadUINames({ token });
    onOpen();
  };

  const onCloseClick = async () => {
    const { sections, selections, globalCurr } = await loadUI({
      token,
      uiName: selectedUIName,
    });
    loadSections({isJson: false, data: sections})
    onClose();
  };

  return (
    <>
      <Button onClick={onOpenClick}>Load Template</Button>
      <Modal isCentered onClose={onClose} isOpen={isOpen}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Load a template</ModalHeader>
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
            <Button colorScheme="blue" mr={3} onClick={onCloseClick}>
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
