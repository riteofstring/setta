import { Heading } from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreState } from "easy-peasy";
import { useState, useEffect } from "react";
import { getOverviewListing } from "utils/sectionIds";

import SectionList from "./SectionList/SectionList";
import SectionsPerGroup from "./SectionsPerGroup/SectionsPerGroup";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const groups = useStoreState((x) => x.master.groups);
  const idsOverview = useStoreState((x) => x.sectionInfos.allIdsOverview);
  const idNames = useStoreState((x) => x.sectionInfos.idNames);

  useEffect(() => {
    console.log("Overview useEffect");
    console.log("idsOverview", idsOverview, groups);
    setListOfSectionIdsAndNames(
      getOverviewListing(groups, idsOverview, idNames)
    );
  }, [groups, idsOverview, idNames]);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
      <SectionsPerGroup />
    </PaneContainer>
  );
}
