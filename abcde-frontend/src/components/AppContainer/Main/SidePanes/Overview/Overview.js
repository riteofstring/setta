import { useState, useEffect } from "react";
import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";
import { useStoreState } from "easy-peasy";
import { getOverviewListing } from "../../../../../utils/sectionIds";
import { arraysAreEqual } from "../../../../../utils/commonFunctions";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const sections = useStoreState((state) => state.master.sections);

  const allChildrenIds = useStoreState(
    (state) => state.master.sections.allChildrenIds,
    arraysAreEqual
  );

  useEffect(() => {
    console.log("Overview useEffect")
    setListOfSectionIdsAndNames(getOverviewListing(sections, pageMinMaxList));
  }, [pageMinMaxList, allChildrenIds, sections]);

  console.log("listOfSectionIdsAndNames", listOfSectionIdsAndNames);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
