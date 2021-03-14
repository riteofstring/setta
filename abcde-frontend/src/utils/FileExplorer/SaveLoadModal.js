import { useState, useEffect } from "react";
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
  const { onClose, isOpen, buttonText, savedFolderAndUINames } = props;

  const folderNames = Object.keys(savedFolderAndUINames);

  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFile, setSelectedFile] = useState({});
  const [enteredFile, setEnteredFile] = useState("");

  const saveUI = useStoreActions((actions) => actions.uiInfo.saveUI);
  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  const token = useStoreState((state) => state.auth.token);

  const _setSelectedFolder = (value) => {
    if (value !== undefined) {
      setSelectedFolder(value);
    }
  };

  const _setSelectedFile = (value) => {
    if (value !== undefined) {
      setSelectedFile({ ...selectedFile, [selectedFolder]: value });
      setEnteredFile(value);
    }
  };

  const _onClose = () => {
    onClose();
    _setSelectedFolder("");
    _setSelectedFile("");
  };

  useEffect(() => {
    if (!selectedFolder) {
      _setSelectedFolder(folderNames[0]);
    }
  }, [folderNames]);

  console.log("enteredFile", enteredFile);

  const onSaveOrLoadClick = () => {
    if (buttonText === "Save As") {
      saveUI({ token, folderName: selectedFolder, uiName: enteredFile });
    } else if (buttonText === "Load") {
      loadUI({ token, folderName: selectedFolder, uiName: enteredFile });
    }

    _onClose();
  };

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
              folderNames={folderNames}
              folderAndFileInfo={savedFolderAndUINames}
              onFileSelect={_setSelectedFile}
              onFolderSelect={_setSelectedFolder}
              selectedFolder={selectedFolder}
              selectedFile={selectedFile}
            />
            {buttonText === "Save As" && (
              <HStack>
                <FileNameInput
                  value={enteredFile}
                  onChange={setEnteredFile}
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
