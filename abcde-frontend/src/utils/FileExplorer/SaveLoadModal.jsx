import { Button, HStack } from "@chakra-ui/react";
import ModalContainer from "utils/ModalContainer/ModalContainer";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";
export default function SaveLoadModal(props) {
  const {
    // onClose,
    // isOpen,
    buttonText,
    // foldersAndFiles: originalFoldersAndFiles,
  } = props;

  //   const isSaveAs = buttonText === "Save As";

  //   const [folderNames, setFolderNames] = useState(
  //     Object.keys(originalFoldersAndFiles)
  //   );
  //   const [foldersAndFiles, setFoldersAndFiles] = useState(
  //     originalFoldersAndFiles
  //   );
  //   const [selectedFolder, setSelectedFolder] = useState("");
  //   const [selectedFile, setSelectedFile] = useState({});
  //   const [enteredFile, setEnteredFile] = useState("");

  //   const saveUI = useStoreActions((actions) => actions.uiInfo.saveUI);
  //   const loadUI = useStoreActions((actions) => actions.uiInfo.loadUI);
  //   const access_token = useStoreState((state) => state.auth.access_token);

  //   const _setSelectedFolder = (value) => {
  //     if (value !== undefined) {
  //       setSelectedFolder(value);
  //     }
  //   };

  //   const _setSelectedFile = (value) => {
  //     if (value !== undefined) {
  //       setSelectedFile({ ...selectedFile, [selectedFolder]: value });
  //       setEnteredFile(value);
  //     }
  //   };

  //   const _onClose = () => {
  //     onClose();
  //     _setSelectedFolder("");
  //     _setSelectedFile("");
  //   };

  //   useEffect(() => {
  //     if (!selectedFolder) {
  //       _setSelectedFolder(folderNames[0]);
  //     }
  //   }, [folderNames]);

  //   useEffect(() => {
  //     setFolderNames(Object.keys(originalFoldersAndFiles));
  //     setFoldersAndFiles(originalFoldersAndFiles);
  //   }, [originalFoldersAndFiles]);

  //   const onSaveOrLoadClick = () => {
  //     if (isSaveAs) {
  //       saveUI({ access_token, folderName: selectedFolder, uiName: enteredFile });
  //     } else if (buttonText === "Load") {
  //       loadUI({ access_token, folderName: selectedFolder, uiName: enteredFile });
  //     }

  //     _onClose();
  //   };

  return (
    <ModalContainer
      header={<Header isSaveAs={isSaveAs} />}
      body={<Body />}
      footer={<Footer buttonText={buttonText} onClose={onClose} />}
    />
  );
}

function Header({ isSaveAs }) {
  return <>Save As</>;
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
function Footer({ onClose, buttonText }) {
  return (
    <HStack justify="stretch" mb=".5rem" spacing={4}>
      <Button colorScheme="blue">{buttonText}</Button>
      <Button onClick={onClose}>Close</Button>
    </HStack>
  );
}
