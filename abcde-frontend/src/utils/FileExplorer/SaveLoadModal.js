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


export default function SaveLoadModal(props) {
  const savedFolderAndUINames = useStoreState((state) => state.uiInfo.savedFolderAndUINames);

  const { onClose, isOpen, ButtonText } = props;

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const onSaveOrLoadClick = () => {

    // if (ButtonText === "Save As") {

    // } else if (ButtonText === "Load") {
    // }

    onClose();
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
            <FileExplorer
              folderAndFileInfo={savedFolderAndUINames}
              onFileSelect={setSelectedFile}
              onFolderSelect={setSelectedFolder}
            />
            {ButtonText === "Save As" && <FileNameInput />}
          </ModalBody>
          <ModalFooter>
            <HStack justify="stretch" mb=".5rem" spacing={4}>
              <Button colorScheme="blue" onClick={onSaveOrLoadClick}>
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
