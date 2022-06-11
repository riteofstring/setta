import { Heading } from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreState } from "easy-peasy";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { OVERVIEW } from "utils/constants";
import { getOverviewListing } from "utils/sectionIds";

import SectionList from "./SectionList/SectionList";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const topLevelSectionIds = useStoreState((x) =>
    x.sectionInfos.topLevelSectionPositions.map((x) => x.id)
  );
  const currChildren = useStoreState((x) => x.sectionInfos.currChildren);
  const idNames = useStoreState((x) => x.sectionInfos.idNames);

  useDeepCompareEffect(() => {
    console.log("Overview useEffect");
    setListOfSectionIdsAndNames(
      getOverviewListing([topLevelSectionIds], currChildren, idNames)
    );
  }, [topLevelSectionIds, currChildren, idNames]);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
