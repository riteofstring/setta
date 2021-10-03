import { HStack, Button } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useState, useEffect } from "react";

import ModalContainer from "../ModalContainer/ModalContainer";
import { useIsEqual } from "../useCreateInfo";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveLoadModal(props) {
  const {
    onClose,
    isOpen,
    buttonText,
    foldersAndFiles: originalFoldersAndFiles,
  } = props;

  const isSaveAs = buttonText === "Save As";

  const [folderNames, setFolderNames] = useState(
    Object.keys(originalFoldersAndFiles)
  );
  const [foldersAndFiles, setFoldersAndFiles] = useState(
    originalFoldersAndFiles
  );
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFile, setSelectedFile] = useState({});
  const [enteredFile, setEnteredFile] = useState("");

  const saveUI = useStoreActions((actions) => actions.uiInfo.saveUI);
  const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  const token = useIsEqual((state) => state.auth.token);

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

  useEffect(() => {
    setFolderNames(Object.keys(originalFoldersAndFiles));
    setFoldersAndFiles(originalFoldersAndFiles);
  }, [originalFoldersAndFiles]);

  const onSaveOrLoadClick = () => {
    if (isSaveAs) {
      saveUI({ token, folderName: selectedFolder, uiName: enteredFile });
    } else if (buttonText === "Load") {
      loadUI({ token, folderName: selectedFolder, uiName: enteredFile });
    }

    _onClose();
  };

  return (
    <ModalContainer
      onClose={_onClose}
      isOpen={isOpen}
      size={"6xl"}
      header={<Header isSaveAs={isSaveAs} />}
      overrideFooter={true}
      body={
        <Body
          token={token}
          folderNames={folderNames}
          foldersAndFiles={foldersAndFiles}
          onFileSelect={_setSelectedFile}
          onFolderSelect={_setSelectedFolder}
          selectedFolder={selectedFolder}
          selectedFile={selectedFile}
          includeNewFolderButton={isSaveAs}
          setFolderNames={setFolderNames}
          setFoldersAndFiles={setFoldersAndFiles}
          value={enteredFile}
          onChange={setEnteredFile}
          isSaveAs={isSaveAs}
        />
      }
      footer={
        <Footer
          onSaveOrLoadClick={onSaveOrLoadClick}
          buttonText={buttonText}
          _onClose={_onClose}
        />
      }
    />
  );
}

function Header({ isSaveAs }) {
  return <>{isSaveAs ? "Save Project As" : "Load Project"}</>;
}
function Body(props) {
  return (
    <>
      <FileExplorer {...props} />
      {props.isSaveAs && (
        <HStack>
          <FileNameInput {...props} placeholder="File" />
        </HStack>
      )}
    </>
  );
}
function Footer({ _onClose, onSaveOrLoadClick, buttonText }) {
  return (
    <HStack justify="stretch" mb=".5rem" spacing={4}>
      <Button colorScheme="blue" onClick={onSaveOrLoadClick}>
        {buttonText}
      </Button>
      <Button onClick={_onClose}>Close</Button>
    </HStack>
  );
}
