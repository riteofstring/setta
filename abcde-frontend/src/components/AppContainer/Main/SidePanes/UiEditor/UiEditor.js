import { Heading } from "@chakra-ui/react";
import TextEditor from "./TextEditor/TextEditor";
import PaneContainer from "../PaneContainer";

export const paneProps = {
  defaultWidth: 500,
  right: true,
  openOnLoad: false,
};

export default function UiEditor({ onWidthChange }) {
  return (
    <PaneContainer paneProps={paneProps} onWidthChange={onWidthChange}>
      <Heading id="EDITOR" as="h1" size="md" color="gray.500">
        Edit YAML
      </Heading>
      <TextEditor />
    </PaneContainer>
  );
}
