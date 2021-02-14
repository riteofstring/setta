import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";
const paneWidth = 20;
const minimizedWidth = paneWidth - 2.5;

const paneProps = {
  variants: {
    open: { x: "0rem" },
    closed: { x: `-${minimizedWidth}rem` },
    visible: { opacity: 1 },
    invisible: { opacity: 0 },
    initial: "open",
  },
  right: false,
  width: `${paneWidth}rem`,
};

export default function Overview() {
  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList />
    </PaneContainer>
  );
}
