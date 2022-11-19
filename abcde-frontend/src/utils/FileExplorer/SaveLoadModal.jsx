import { Button, HStack } from "@chakra-ui/react";
import { useState } from "react";
import ModalContainer from "utils/ModalContainer/ModalContainer";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveLoadModal({
  onClose,
  isOpen,
  buttonText,
  files,
  onClickLoadProject,
}) {
  const [selected, setSelected] = useState(null);

  function localOnClickLoadProject() {
    onClickLoadProject(selected);
  }

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"3xl"}
      // header={<Header isSaveAs={isSaveAs} />}
      overrideFooter={true}
      body={<Body files={files} setSelected={setSelected} />}
      footer={
        <Footer
          buttonText={buttonText}
          onClose={onClose}
          onClick={localOnClickLoadProject}
        />
      }
    />
  );
}

function Header({ isSaveAs }) {
  return <>Save As</>;
}

function Body({ isSaveAs, files, setSelected }) {
  return (
    <>
      <FileExplorer files={files} setSelected={setSelected} />
      {isSaveAs && (
        <HStack>
          <FileNameInput placeholder="File" />
        </HStack>
      )}
    </>
  );
}
function Footer({ onClose, onClick, buttonText }) {
  return (
    <HStack justify="stretch" mb=".5rem" spacing={4}>
      <Button colorScheme="blue" onClick={onClick}>
        {buttonText}
      </Button>
      <Button onClick={onClose}>Close</Button>
    </HStack>
  );
}
