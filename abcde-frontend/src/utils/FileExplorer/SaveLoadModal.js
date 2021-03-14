import { useState } from "react";
import {
  HStack,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveAsButton(props) {
  const { onClose, isOpen, ButtonText } = props;
  // const { isOpen, onOpen, onClose } = useDisclosure();
  const token = useStoreState((state) => state.auth.token);
  const currUIName = useStoreState((state) => state.uiInfo.currUIName);
  const currVersionName = useStoreState(
    (state) => state.uiInfo.currVersionName
  );
  const saveUI = useStoreActions((actions) => actions.uiInfo.saveUI);

  const [enteredUIName, setEnteredUIName] = useState(currUIName);
  const [enteredVersionName, setEnteredVersionName] = useState(currVersionName);

  const onSaveAs = () => {
    saveUI({ token, uiName: enteredUIName, versionName: enteredVersionName });
  };

  return (
    <>
      <Modal onClose={onClose} isOpen={isOpen} isCentered size="6xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {ButtonText === "Save As" ? "Save Project As" : "Load Project"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FileExplorer />
            {ButtonText === "Save As" && <FileNameInput />}
          </ModalBody>
          <ModalFooter>
            <HStack justify="stretch" mb=".5rem" spacing={4}>
              <Button colorScheme="blue" onClick={ButtonText && onSaveAs}>
                {ButtonText}
              </Button>
              <Button onClick={onClose}>Close</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
