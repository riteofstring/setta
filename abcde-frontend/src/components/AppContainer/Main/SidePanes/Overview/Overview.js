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

  const idHierarchy = useStoreState((state) => state.master.idHierarchy);
  const getListOfSectionIdsAndNames = () => {
    const overviewListing = getOverviewListing(idHierarchy);
    console.log("overviewListing", overviewListing);
    return overviewListing;
  };

  useEffect(() => {
    setListOfSectionIdsAndNames(getListOfSectionIdsAndNames());
  }, [idHierarchy]);

  console.log("Overview");

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
