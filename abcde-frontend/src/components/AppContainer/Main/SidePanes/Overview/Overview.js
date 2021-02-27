import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";

export const paneProps = {
  defaultWidth: 320,
  right: false,
  openOnLoad: true,
};

export default function Overview({ onWidthChange }) {
  return (
    <PaneContainer paneProps={paneProps} onWidthChange={onWidthChange}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList />
    </PaneContainer>
  );
}
