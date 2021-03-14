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
  const savedFolderAndUINames = useStoreState(
    (state) => state.uiInfo.savedFolderAndUINames
  );

  const { onClose, isOpen, buttonText } = props;

  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFile, setSelectedFile] = useState("");

  const [enteredFolder, setEnteredFolder] = useState("");
  const [enteredField, setEnteredField] = useState("");


  const _onClose = () => {
    onClose();
    setSelectedFolder("")
    setSelectedFile("")
    setEnteredFolder("")
    setEnteredField("")
  }

  const onSaveOrLoadClick = () => {
    // if (buttonText === "Save As") {

    // } else if (buttonText === "Load") {
    // }

    _onClose()
  };

  console.log(enteredFolder, enteredField);

  return (
    <>
      <Modal onClose={_onClose} isOpen={isOpen} isCentered size="6xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {buttonText === "Save As" ? "Save Project As" : "Load Project"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FileExplorer
              folderAndFileInfo={savedFolderAndUINames}
              onFileSelect={setSelectedFile}
              onFolderSelect={setSelectedFolder}
            />
            {buttonText === "Save As" && (
              <HStack>
                <FileNameInput
                  value={enteredFolder}
                  onChange={setEnteredFolder}
                  placeholder="Folder"
                />
                <FileNameInput
                  value={enteredField}
                  onChange={setEnteredField}
                  placeholder="File"
                />
              </HStack>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack justify="stretch" mb=".5rem" spacing={4}>
              <Button colorScheme="blue" onClick={onSaveOrLoadClick}>
                {buttonText}
              </Button>
              <Button onClick={_onClose}>Close</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
