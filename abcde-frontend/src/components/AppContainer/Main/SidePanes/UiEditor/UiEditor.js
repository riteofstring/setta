import { Heading } from "@chakra-ui/react";
import TextEditor from "./TextEditor/TextEditor";
import PaneContainer from "../PaneContainer";

const paneProps = {
  right: true,
  paneName: "uiEditor",
};

export default function UiEditor() {
  return (
    <PaneContainer paneProps={paneProps}>
      <Heading id="EDITOR" as="h1" size="md" color="gray.500">
        Edit YAML
      </Heading>
      <TextEditor />
    </PaneContainer>
  );
}
