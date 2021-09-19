import { useState, useEffect } from "react";
import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";
import { useStoreState } from "easy-peasy";
import { getOverviewListing } from "../../../../../utils/sectionIds";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const idsOverview = useStoreState((state) => state.master.idsOverview);
  const idNames = useStoreState((state) => state.master.idNames);

  useEffect(() => {
    console.log("Overview useEffect");
    setListOfSectionIdsAndNames(
      getOverviewListing(pageMinMaxList, idsOverview, idNames)
    );
  }, [idsOverview]);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
