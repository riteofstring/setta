import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";
import { useStoreState } from "easy-peasy"

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {

  const rootIdHierarchy = useStoreState((state) => state.master.rootIdHierarchy)
  const sectionIdsToSectionHeadings = useStoreState((state) => state.master.sectionIdsToSectionHeadings)
  const getListOfSectionNames = () => {
    return Object.keys(rootIdHierarchy).map((e)=>sectionIdsToSectionHeadings[e])
  }

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionNames={getListOfSectionNames()}/>
    </PaneContainer>
  );
}
