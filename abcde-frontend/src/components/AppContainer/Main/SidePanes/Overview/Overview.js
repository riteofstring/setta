import { Heading } from "@chakra-ui/react";
import { useState, useEffect } from "react";

import { getOverviewListing } from "../../../../../utils/sectionIds";
import { useIsEqual } from "../../../../../utils/useCreateInfo";
import PaneContainer from "../PaneContainer";
import SectionList from "./SectionList/SectionList";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const pageMinMaxList = useIsEqual((x) => x.master.pageMinMaxList);
  const idsOverview = useIsEqual((x) => x.sectionInfos.idsOverview);
  const idNames = useIsEqual((x) => x.sectionInfos.idNames);

  useEffect(() => {
    console.log("Overview useEffect");
    console.log("idsOverview", idsOverview);
    setListOfSectionIdsAndNames(
      getOverviewListing(pageMinMaxList, idsOverview, idNames)
    );
  }, [idsOverview, idNames]);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
