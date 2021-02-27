import { Heading } from "@chakra-ui/react";
import TextEditor from "./TextEditor/TextEditor";
import PaneContainer from "../PaneContainer";

const paneWidth = 40;
const minimizedWidth = 37.5;

const paneProps = {
  variants: {
    open: { marginRight: "0rem" },
    closed: { marginRight: `-${minimizedWidth}rem` },
    initial: "open",
  },
  right: true,
  width: `${paneWidth}rem`,
};

export default function UiEditor() {
  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h1" size="md" color="gray.500">
        Edit YAML
      </Heading>
      <TextEditor />
    </PaneContainer>
  );
}
