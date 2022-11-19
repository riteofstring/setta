import { Button, HStack } from "@chakra-ui/react";
import ModalContainer from "utils/ModalContainer/ModalContainer";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveLoadModal(props) {
  const { onClose, isOpen, buttonText, files } = props;

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"3xl"}
      // header={<Header isSaveAs={isSaveAs} />}
      overrideFooter={true}
      body={<Body files={files} />}
      footer={<Footer buttonText={buttonText} onClose={onClose} />}
    />
  );
}

function Header({ isSaveAs }) {
  return <>Save As</>;
}

function Body({ isSaveAs, files }) {
  return (
    <>
      <FileExplorer files={files} />
      {isSaveAs && (
        <HStack>
          <FileNameInput placeholder="File" />
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
