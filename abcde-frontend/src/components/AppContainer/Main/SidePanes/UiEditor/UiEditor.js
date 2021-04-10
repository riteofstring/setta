import { useCallback } from "react";
import { Heading } from "@chakra-ui/react";
import TextEditor from "./TextEditor/TextEditor";
import PaneContainer from "../PaneContainer";
import { useDropzone } from "react-dropzone";
import { useStoreActions } from "easy-peasy";

const paneProps = {
  right: true,
  paneName: "uiEditor",
};

export default function UiEditor() {
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );

  const onDrop = useCallback((acceptedFiles) => {
    for (let file of acceptedFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        // Do whatever you want with the file contents
        const text = reader.result;
        setEnteredText(text);
      };
      reader.readAsText(file);
    }
  }, []);
  const { getRootProps } = useDropzone({ onDrop });

  return (
    <PaneContainer paneProps={paneProps} dropZoneProps={getRootProps()}>
      <Heading id="EDITOR" as="h1" size="md" color="gray.500">
        Edit YAML
      </Heading>
      <TextEditor />
    </PaneContainer>
  );
}
