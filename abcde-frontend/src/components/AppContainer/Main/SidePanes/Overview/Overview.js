import { Heading } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";

import { useSectionGroups } from "../../../../../hooks/useCreateInfo";
import { getOverviewListing } from "../../../../../utils/sectionIds";
import PaneContainer from "../PaneContainer";
import SectionList from "./SectionList/SectionList";
import SectionsPerGroup from "./SectionsPerGroup/SectionsPerGroup";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const groups = useSectionGroups();
  const currChildren = useStoreState((x) => x.sectionInfos.currChildren);
  const idNames = useStoreState((x) => x.sectionInfos.idNames);

  useDeepCompareEffect(() => {
    console.log("Overview useEffect");
    console.log("currChildren", currChildren, groups);
    setListOfSectionIdsAndNames(
      getOverviewListing(groups, currChildren, idNames)
    );
  }, [groups, currChildren, idNames]);

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
